import {
  SOURCE_CURRENCIES,
  type CurrencyAmount,
  type SourceCurrencyCode
} from "../domain/currencies";
import type { Rectangle } from "../domain/geometry";
import type { RecognizerObservation } from "./ocrRecognizer";
import type { RecognitionProfile } from "./recognitionProfile";

type Point = RecognizerObservation["polygon"][number];

const NEGATIVE_CONTEXT_PATTERN =
  /(?:%|％|ポイント|points?|商品番号|品番|型番|item\s*(?:no\.?|number)|model\s*(?:no\.?|number)?|sku|serial\s*(?:no\.?|number)?|part\s*(?:no\.?|number)?)/iu;
const KNOWN_CURRENCY_MARKER_PATTERN =
  /(?:(?:US|CA|C|AU|A|NZ|HK|S|NT|MX|R)\$|[$€£¥₩₹₪₱฿₺]|RMB|NTD|円|元|원|KČ|ZŁ|FR\.?|SFR\.?)/iu;
const CURRENCY_CODES = SOURCE_CURRENCIES.map(({ code }) => code);

export interface PriceEvidenceCandidate extends CurrencyAmount {
  readonly currency: SourceCurrencyCode;
  readonly confidence: number;
  readonly box: Rectangle;
  readonly polygon: readonly Point[];
  readonly frameIdentity: string;
  readonly preprocessingIdentities: readonly string[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll(/[’‘]/gu, "'")
    .replaceAll(/\s/gu, "");
}

function normalizedMarkers(profile: RecognitionProfile): readonly string[] {
  return profile.notation.markers
    .map(normalize)
    .sort((left, right) => right.length - left.length);
}

function removeCompatibleMarker(
  text: string,
  profile: RecognitionProfile
): string | null {
  const normalizedText = normalize(text);
  const upperText = normalizedText.toLocaleUpperCase("en-US");

  for (const marker of normalizedMarkers(profile)) {
    const upperMarker = marker.toLocaleUpperCase("en-US");
    if (upperText.startsWith(upperMarker)) {
      return normalizedText.slice(marker.length);
    }
    if (upperText.endsWith(upperMarker)) {
      return normalizedText.slice(0, -marker.length);
    }
  }
  return null;
}

function isCompatibleMarker(
  text: string,
  profile: RecognitionProfile
): boolean {
  const normalizedText = normalize(text).toLocaleUpperCase("en-US");
  return normalizedMarkers(profile).some(
    (marker) => marker.toLocaleUpperCase("en-US") === normalizedText
  );
}

function validGroupedInteger(
  integer: string,
  groupingSeparators: readonly string[]
): boolean {
  const normalizedSeparators = groupingSeparators.map(normalize);
  const usedSeparator = normalizedSeparators.find((separator) =>
    integer.includes(separator)
  );
  if (!usedSeparator) {
    return /^(?:0|[1-9]\d*)$/u.test(integer);
  }
  if (
    normalizedSeparators.some(
      (separator) =>
        separator !== usedSeparator && integer.includes(separator)
    )
  ) {
    return false;
  }
  const groups = integer.split(usedSeparator);
  return (
    /^[1-9]\d{0,2}$/u.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/u.test(group))
  );
}

function parseMinorUnits(
  amountText: string,
  profile: RecognitionProfile
): number | null {
  const amount = normalize(amountText);
  if (!/^[\d.,']+$/u.test(amount)) {
    return null;
  }

  const decimalSeparator = profile.notation.decimalSeparator;
  const parts = decimalSeparator ? amount.split(decimalSeparator) : [amount];
  if (parts.length > 2) {
    return null;
  }
  const [integer, fraction] = parts;
  if (
    !validGroupedInteger(integer, profile.notation.groupingSeparators) ||
    (profile.notation.fractionDigits === 0 && fraction !== undefined) ||
    (fraction !== undefined &&
      !new RegExp(
        `^\\d{${profile.notation.fractionDigits.toString()}}$`,
        "u"
      ).test(fraction))
  ) {
    return null;
  }

  const normalizedInteger = profile.notation.groupingSeparators.reduce(
    (value, separator) => value.replaceAll(normalize(separator), ""),
    integer
  );
  const scale = 10n ** BigInt(profile.notation.fractionDigits);
  const minorUnits =
    BigInt(normalizedInteger) * scale + BigInt(fraction ?? "0");
  return minorUnits <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(minorUnits)
    : null;
}

function containsForeignCurrencyMarker(
  text: string,
  profile: RecognitionProfile
): boolean {
  if (isCompatibleMarker(text, profile)) {
    return false;
  }
  const compatibleAmount = removeCompatibleMarker(text, profile);
  if (
    compatibleAmount !== null &&
    parseMinorUnits(compatibleAmount, profile) !== null
  ) {
    return false;
  }

  const normalizedText = normalize(text).toLocaleUpperCase("en-US");
  return (
    CURRENCY_CODES.some((code) => {
      const index = normalizedText.indexOf(code);
      if (index < 0) {
        return false;
      }
      const before = normalizedText[index - 1] ?? "";
      const after = normalizedText[index + code.length] ?? "";
      return !/[A-Z]/u.test(before) && !/[A-Z]/u.test(after);
    }) || KNOWN_CURRENCY_MARKER_PATTERN.test(normalizedText)
  );
}

function sameLine(
  left: RecognizerObservation,
  right: RecognizerObservation
): boolean {
  return (
    left.line !== undefined &&
    right.line !== undefined &&
    left.line.blockIndex === right.line.blockIndex &&
    left.line.paragraphIndex === right.line.paragraphIndex &&
    left.line.lineIndex === right.line.lineIndex
  );
}

function aligned(
  left: RecognizerObservation,
  right: RecognizerObservation,
  profile: RecognitionProfile
): boolean {
  const textHeight = Math.max(left.box.height, right.box.height);
  if (textHeight <= 0) {
    return false;
  }
  const verticalOverlap = Math.max(
    0,
    Math.min(
      left.box.y + left.box.height,
      right.box.y + right.box.height
    ) - Math.max(left.box.y, right.box.y)
  );
  const overlapRatio =
    verticalOverlap / Math.min(left.box.height, right.box.height);
  const horizontalGap = Math.max(
    0,
    left.box.x - (right.box.x + right.box.width),
    right.box.x - (left.box.x + left.box.width)
  );
  const baselineDelta = Math.abs(
    left.box.y + left.box.height - (right.box.y + right.box.height)
  );

  return (
    (sameLine(left, right) || overlapRatio > 0) &&
    overlapRatio >= profile.fusion.minimumVerticalOverlapRatio &&
    horizontalGap <= profile.fusion.maximumGapInTextHeights * textHeight &&
    baselineDelta <=
      textHeight * profile.fusion.maximumBaselineDeltaInTextHeights
  );
}

function sharesContext(
  anchor: RecognizerObservation,
  context: RecognizerObservation,
  profile: RecognitionProfile
): boolean {
  if (sameLine(anchor, context)) {
    return true;
  }
  const textHeight = Math.max(anchor.box.height, context.box.height);
  const verticalOverlap =
    Math.min(
      anchor.box.y + anchor.box.height,
      context.box.y + context.box.height
    ) - Math.max(anchor.box.y, context.box.y);
  const horizontalGap = Math.max(
    0,
    anchor.box.x - (context.box.x + context.box.width),
    context.box.x - (anchor.box.x + anchor.box.width)
  );
  return (
    verticalOverlap > 0 &&
    horizontalGap <= profile.fusion.maximumGapInTextHeights * textHeight * 2
  );
}

function hasNegativeContext(
  amount: RecognizerObservation,
  observations: readonly RecognizerObservation[],
  profile: RecognitionProfile
): boolean {
  const context = observations.filter((observation) =>
    sharesContext(amount, observation, profile)
  );
  if (
    NEGATIVE_CONTEXT_PATTERN.test(context.map(({ text }) => text).join(" "))
  ) {
    return true;
  }
  return context.some(
    ({ text }) => containsForeignCurrencyMarker(text, profile)
  );
}

function cross(origin: Point, left: Point, right: Point): number {
  return (
    (left.x - origin.x) * (right.y - origin.y) -
    (left.y - origin.y) * (right.x - origin.x)
  );
}

function convexHull(points: readonly Point[]): readonly Point[] {
  const sorted = [...points]
    .filter(
      (point, index, all) =>
        all.findIndex(({ x, y }) => x === point.x && y === point.y) === index
    )
    .sort((left, right) => left.x - right.x || left.y - right.y);
  if (sorted.length <= 2) {
    return sorted;
  }
  const lower: Point[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower.at(-2)!, lower.at(-1)!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper.at(-2)!, upper.at(-1)!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function boxFor(points: readonly Point[]): Rectangle {
  const left = Math.min(...points.map(({ x }) => x));
  const top = Math.min(...points.map(({ y }) => y));
  const right = Math.max(...points.map(({ x }) => x));
  const bottom = Math.max(...points.map(({ y }) => y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxesOverlap(left: Rectangle, right: Rectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function coalesceVariants(
  candidates: readonly PriceEvidenceCandidate[]
): PriceEvidenceCandidate[] {
  const coalesced: PriceEvidenceCandidate[] = [];
  for (const next of candidates) {
    const matchingIndex = coalesced.findIndex(
      (current) =>
        current.frameIdentity === next.frameIdentity &&
        current.currency === next.currency &&
        current.minorUnits === next.minorUnits &&
        boxesOverlap(current.box, next.box)
    );
    if (matchingIndex < 0) {
      coalesced.push(next);
      continue;
    }
    const current = coalesced[matchingIndex];
    const polygon = convexHull([...current.polygon, ...next.polygon]);
    coalesced[matchingIndex] = {
      ...current,
      confidence: Math.min(current.confidence, next.confidence),
      box: boxFor(polygon),
      polygon,
      preprocessingIdentities: [
        ...new Set([
          ...current.preprocessingIdentities,
          ...next.preprocessingIdentities
        ])
      ].sort()
    };
  }
  return coalesced;
}

function candidate(
  profile: RecognitionProfile,
  minorUnits: number,
  evidence: readonly RecognizerObservation[]
): PriceEvidenceCandidate | null {
  const confidence = Math.min(...evidence.map(({ confidence }) => confidence));
  if (confidence < profile.thresholds.candidateConfidence) {
    return null;
  }
  const polygon = convexHull(evidence.flatMap(({ polygon }) => polygon));
  return {
    currency: profile.sourceCurrency,
    minorUnits,
    confidence,
    box: boxFor(polygon),
    polygon,
    frameIdentity: evidence[0].passIdentity.frameIdentity,
    preprocessingIdentities: [
      ...new Set(
        evidence.map(
          ({ passIdentity }) => passIdentity.preprocessingIdentity
        )
      )
    ].sort()
  };
}

export function fusePriceEvidence(
  profile: RecognitionProfile,
  observations: readonly RecognizerObservation[]
): PriceEvidenceCandidate[] {
  const candidates: PriceEvidenceCandidate[] = [];
  const observationsByFrame = new Map<string, RecognizerObservation[]>();
  for (const observation of observations) {
    const frameIdentity = observation.passIdentity.frameIdentity;
    const frameObservations = observationsByFrame.get(frameIdentity) ?? [];
    frameObservations.push(observation);
    observationsByFrame.set(frameIdentity, frameObservations);
  }

  for (const frameObservations of observationsByFrame.values()) {
    const markers = frameObservations.filter(
      (observation) =>
        observation.evidenceKind === "marker" &&
        observation.confidence >= profile.thresholds.markerConfidence &&
        isCompatibleMarker(observation.text, profile)
    );

    for (const amount of frameObservations) {
      if (
        amount.confidence < profile.thresholds.textConfidence ||
        hasNegativeContext(amount, frameObservations, profile)
      ) {
        continue;
      }

      const combinedAmount = removeCompatibleMarker(amount.text, profile);
      if (combinedAmount !== null) {
        if (amount.confidence < profile.thresholds.markerConfidence) {
          continue;
        }
        const minorUnits = parseMinorUnits(combinedAmount, profile);
        const combinedCandidate =
          minorUnits === null
            ? null
            : candidate(profile, minorUnits, [amount]);
        if (combinedCandidate) {
          candidates.push(combinedCandidate);
        }
        continue;
      }

      const minorUnits = parseMinorUnits(amount.text, profile);
      if (minorUnits === null) {
        continue;
      }
      for (const marker of markers) {
        if (!aligned(amount, marker, profile)) {
          continue;
        }
        const splitCandidate = candidate(profile, minorUnits, [amount, marker]);
        if (splitCandidate) {
          candidates.push(splitCandidate);
        }
      }
    }
  }

  const coalesced = coalesceVariants(candidates);
  const unconflicted = coalesced.filter(
    (candidate) =>
      !coalesced.some(
        (other) =>
          other !== candidate &&
          other.frameIdentity === candidate.frameIdentity &&
          other.currency === candidate.currency &&
          other.minorUnits !== candidate.minorUnits &&
          boxesOverlap(other.box, candidate.box)
      )
  );
  return unconflicted.sort(
    (left, right) => left.box.x - right.box.x || left.box.y - right.box.y
  );
}
