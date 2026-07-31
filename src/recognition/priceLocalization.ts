import type {
  SourceCurrencyCode
} from "../domain/currencies";
import type { Rectangle } from "../domain/geometry";

export interface OcrLineIdentity {
  blockIndex: number;
  paragraphIndex: number;
  lineIndex: number;
}

export interface OcrToken {
  text: string;
  confidence: number;
  line?: OcrLineIdentity;
  box: Rectangle;
}

export interface DetectedPrice {
  currency: SourceCurrencyCode;
  minorUnits: number;
  confidence: number;
  box: Rectangle;
}

interface PriceProfile {
  fractionDigits: 0 | 2;
  markers: readonly string[];
  decimalSeparator?: "." | ",";
  groupingSeparators: readonly string[];
}

const PRICE_PROFILES: Record<SourceCurrencyCode, PriceProfile> = {
  USD: {
    fractionDigits: 2,
    markers: ["USD", "US$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  EUR: {
    fractionDigits: 2,
    markers: ["EUR", "€"],
    decimalSeparator: ",",
    groupingSeparators: ["."]
  },
  JPY: {
    fractionDigits: 0,
    markers: ["JPY", "¥", "円"],
    groupingSeparators: [","]
  },
  GBP: {
    fractionDigits: 2,
    markers: ["GBP", "£"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  CNY: {
    fractionDigits: 2,
    markers: ["CNY", "RMB", "RMB¥", "CN¥", "¥", "元"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  KRW: {
    fractionDigits: 0,
    markers: ["KRW", "₩", "원"],
    groupingSeparators: [","]
  },
  TWD: {
    fractionDigits: 2,
    markers: ["TWD", "NT$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  HKD: {
    fractionDigits: 2,
    markers: ["HKD", "HK$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  AUD: {
    fractionDigits: 2,
    markers: ["AUD", "A$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  CAD: {
    fractionDigits: 2,
    markers: ["CAD", "C$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  SGD: {
    fractionDigits: 2,
    markers: ["SGD", "S$", "$"],
    decimalSeparator: ".",
    groupingSeparators: [","]
  },
  CHF: {
    fractionDigits: 2,
    markers: ["CHF", "SFR.", "FR."],
    decimalSeparator: ".",
    groupingSeparators: ["'", "’"]
  }
};

const NEGATIVE_EVIDENCE_PATTERN =
  /(?:%|％|ポイント|points?|商品番号|品番|型番|item\s*no|(?:^|\W)no\.?(?:\W|$))/iu;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll(/[’]/gu, "'")
    .replaceAll(/\s/gu, "");
}

function unionBoxes(tokens: OcrToken[]): Rectangle {
  const left = Math.min(...tokens.map(({ box }) => box.x));
  const top = Math.min(...tokens.map(({ box }) => box.y));
  const right = Math.max(...tokens.map(({ box }) => box.x + box.width));
  const bottom = Math.max(...tokens.map(({ box }) => box.y + box.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sameLine(left: OcrToken, right: OcrToken): boolean {
  return (
    (!left.line && !right.line) ||
    (left.line !== undefined &&
      right.line !== undefined &&
      left.line.blockIndex === right.line.blockIndex &&
      left.line.paragraphIndex === right.line.paragraphIndex &&
      left.line.lineIndex === right.line.lineIndex)
  );
}

function sharesLineAndGeometry(tokens: OcrToken[]): boolean {
  return tokens.slice(1).every((right, index) => {
    const left = tokens[index];
    const maximumHeight = Math.max(left.box.height, right.box.height);
    const horizontalGap = right.box.x - (left.box.x + left.box.width);
    const verticalOverlap =
      Math.min(
        left.box.y + left.box.height,
        right.box.y + right.box.height
      ) - Math.max(left.box.y, right.box.y);

    return (
      sameLine(left, right) &&
      horizontalGap >= -maximumHeight * 0.25 &&
      horizontalGap <= maximumHeight * 1.5 &&
      verticalOverlap > 0
    );
  });
}

function removeMarker(
  text: string,
  markers: readonly string[]
): string | null {
  const normalizedMarkers = markers
    .map(normalize)
    .sort((left, right) => right.length - left.length);
  const upperText = text.toUpperCase();

  for (const marker of normalizedMarkers) {
    const upperMarker = marker.toUpperCase();
    if (upperText.startsWith(upperMarker)) {
      return text.slice(marker.length);
    }
    if (upperText.endsWith(upperMarker)) {
      return text.slice(0, -marker.length);
    }
  }
  return null;
}

function validGroupedInteger(
  integer: string,
  groupingSeparators: readonly string[]
): boolean {
  const usedSeparator = groupingSeparators.find((separator) =>
    integer.includes(normalize(separator))
  );
  if (!usedSeparator) {
    return /^(?:0|[1-9]\d*)$/u.test(integer);
  }
  if (
    groupingSeparators.some(
      (separator) =>
        normalize(separator) !== normalize(usedSeparator) &&
        integer.includes(normalize(separator))
    )
  ) {
    return false;
  }
  const groups = integer.split(normalize(usedSeparator));
  return (
    /^[1-9]\d{0,2}$/u.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/u.test(group))
  );
}

function parseMinorUnits(text: string, profile: PriceProfile): number | null {
  const amount = removeMarker(normalize(text), profile.markers);
  if (!amount || !/^[\d.,']+$/u.test(amount)) {
    return null;
  }

  const decimalSeparator = profile.decimalSeparator;
  const decimalParts = decimalSeparator
    ? amount.split(decimalSeparator)
    : [amount];
  if (decimalParts.length > 2) {
    return null;
  }
  const [integer, fraction] = decimalParts;
  if (
    !validGroupedInteger(integer, profile.groupingSeparators) ||
    (profile.fractionDigits === 0 && fraction !== undefined) ||
    (fraction !== undefined &&
      !new RegExp(`^\\d{${profile.fractionDigits}}$`, "u").test(fraction))
  ) {
    return null;
  }

  const normalizedInteger = profile.groupingSeparators.reduce(
    (value, separator) => value.replaceAll(normalize(separator), ""),
    integer
  );
  const majorUnits = Number.parseInt(normalizedInteger, 10);
  const minorFraction = fraction ? Number.parseInt(fraction, 10) : 0;
  const minorUnits =
    majorUnits * 10 ** profile.fractionDigits + minorFraction;

  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

export function localizePrices(
  currency: SourceCurrencyCode,
  tokens: OcrToken[]
): DetectedPrice[] {
  const normalizedTokens = tokens.map((token) => ({
    ...token,
    text: normalize(token.text)
  }));
  const detections: DetectedPrice[] = [];

  for (let start = 0; start < normalizedTokens.length; start += 1) {
    for (const length of [1, 2, 3]) {
      const priceTokens = normalizedTokens.slice(start, start + length);
      if (
        priceTokens.length !== length ||
        !sharesLineAndGeometry(priceTokens)
      ) {
        continue;
      }

      const evidence = normalizedTokens
        .slice(Math.max(0, start - 1), start + length + 1)
        .map(({ text }) => text)
        .join(" ");
      if (NEGATIVE_EVIDENCE_PATTERN.test(evidence)) {
        continue;
      }

      const minorUnits = parseMinorUnits(
        priceTokens.map(({ text }) => text).join(""),
        PRICE_PROFILES[currency]
      );
      if (minorUnits === null) {
        continue;
      }

      detections.push({
        currency,
        minorUnits,
        confidence: Math.min(...priceTokens.map(({ confidence }) => confidence)),
        box: unionBoxes(priceTokens)
      });
    }
  }

  return detections;
}
