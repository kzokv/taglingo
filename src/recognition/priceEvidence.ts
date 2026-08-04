import {
  currencyFractionDigits,
  SOURCE_CURRENCIES,
  type CurrencyAmount,
  type SourceCurrencyCode
} from "../domain/currencies";
import {
  getCurrencyNotationRules,
  type CurrencyNotationRules
} from "../domain/currencyNotation";
import type { Rectangle } from "../domain/geometry";
import type { RecognizerObservation } from "./ocrRecognizer";
import type { FixedRecognitionRules } from "./recognitionRuntime";

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

export interface PriceEvidenceConfiguration {
  readonly sourceCurrency: SourceCurrencyCode;
  readonly fractionDigits: number;
  readonly notation: CurrencyNotationRules;
  readonly thresholds: FixedRecognitionRules["thresholds"];
  readonly fusion: FixedRecognitionRules["fusion"];
}

export function createPriceEvidenceConfiguration(
  sourceCurrency: SourceCurrencyCode,
  rules: FixedRecognitionRules
): PriceEvidenceConfiguration {
  return {
    sourceCurrency,
    fractionDigits: currencyFractionDigits(sourceCurrency),
    notation: getCurrencyNotationRules(sourceCurrency),
    thresholds: rules.thresholds,
    fusion: rules.fusion
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll(/[’‘]/gu, "'")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function normalizeGroupingSeparator(value: string): string {
  return /\s/u.test(value) ? " " : normalize(value);
}

function normalizedMarkers(
  configuration: PriceEvidenceConfiguration
): readonly string[] {
  return configuration.notation.markers
    .map(normalize)
    .sort((left, right) => right.length - left.length);
}

function removeCompatibleMarker(
  text: string,
  configuration: PriceEvidenceConfiguration
): string | null {
  const normalizedText = normalize(text);
  const upperText = normalizedText.toLocaleUpperCase("en-US");

  for (const marker of normalizedMarkers(configuration)) {
    const upperMarker = marker.toLocaleUpperCase("en-US");
    if (upperText.startsWith(upperMarker)) {
      return normalizedText.slice(marker.length).trim();
    }
    if (upperText.endsWith(upperMarker)) {
      return normalizedText.slice(0, -marker.length).trim();
    }
  }
  return null;
}

function isCompatibleMarker(
  text: string,
  configuration: PriceEvidenceConfiguration
): boolean {
  const normalizedText = normalize(text).toLocaleUpperCase("en-US");
  return normalizedMarkers(configuration).some(
    (marker) => marker.toLocaleUpperCase("en-US") === normalizedText
  );
}

function validGroupedInteger(
  integer: string,
  configuration: PriceEvidenceConfiguration
): boolean {
  const normalizedSeparators = [
    configuration.notation.separators.grouping,
    configuration.notation.separators.displayGrouping
  ].map(normalizeGroupingSeparator);
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
  const westernGrouping =
    /^[1-9]\d{0,2}$/u.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/u.test(group));
  if (
    configuration.notation.groupingStyle === "western" ||
    westernGrouping
  ) {
    return westernGrouping;
  }
  return (
    /^[1-9]\d?$/u.test(groups[0]) &&
    groups.length >= 2 &&
    groups.slice(1, -1).every((group) => /^\d{2}$/u.test(group)) &&
    /^\d{3}$/u.test(groups.at(-1) ?? "")
  );
}

function parseMinorUnits(
  amountText: string,
  configuration: PriceEvidenceConfiguration
): number | null {
  const amount = normalize(amountText);
  if (!/^[\d.,' ]+$/u.test(amount)) {
    return null;
  }

  const decimalSeparator = configuration.notation.separators.decimal;
  const parts = decimalSeparator ? amount.split(decimalSeparator) : [amount];
  if (parts.length > 2) {
    return null;
  }
  const [integer, fraction] = parts;
  if (
    !validGroupedInteger(integer, configuration) ||
    (configuration.fractionDigits === 0 && fraction !== undefined) ||
    (fraction !== undefined &&
      !new RegExp(
        `^\\d{${configuration.fractionDigits.toString()}}$`,
        "u"
      ).test(fraction))
  ) {
    return null;
  }

  const normalizedInteger = [
    configuration.notation.separators.grouping,
    configuration.notation.separators.displayGrouping
  ].reduce(
    (value, separator) =>
      value.replaceAll(normalizeGroupingSeparator(separator), ""),
    integer
  );
  const scale = 10n ** BigInt(configuration.fractionDigits);
  const minorUnits =
    BigInt(normalizedInteger) * scale + BigInt(fraction ?? "0");
  return minorUnits <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(minorUnits)
    : null;
}

function containsForeignCurrencyMarker(
  text: string,
  configuration: PriceEvidenceConfiguration
): boolean {
  if (isCompatibleMarker(text, configuration)) {
    return false;
  }
  const compatibleAmount = removeCompatibleMarker(text, configuration);
  if (
    compatibleAmount !== null &&
    parseMinorUnits(compatibleAmount, configuration) !== null
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

function observationRelationship(
  left: RecognizerObservation,
  right: RecognizerObservation
) {
  const textHeight = Math.max(left.box.height, right.box.height);
  const verticalOverlap = Math.max(
    0,
    Math.min(
      left.box.y + left.box.height,
      right.box.y + right.box.height
    ) - Math.max(left.box.y, right.box.y)
  );
  return {
    textHeight,
    verticalOverlap,
    overlapRatio:
      verticalOverlap / Math.min(left.box.height, right.box.height),
    horizontalGap: Math.max(
      0,
      left.box.x - (right.box.x + right.box.width),
      right.box.x - (left.box.x + left.box.width)
    ),
    baselineDelta: Math.abs(
      left.box.y + left.box.height - (right.box.y + right.box.height)
    )
  };
}

function aligned(
  left: RecognizerObservation,
  right: RecognizerObservation,
  configuration: PriceEvidenceConfiguration
): boolean {
  const {
    textHeight,
    overlapRatio,
    horizontalGap,
    baselineDelta
  } = observationRelationship(left, right);
  if (textHeight <= 0) {
    return false;
  }

  return (
    (sameLine(left, right) || overlapRatio > 0) &&
    overlapRatio >= configuration.fusion.minimumVerticalOverlapRatio &&
    horizontalGap <= configuration.fusion.maximumGapInTextHeights * textHeight &&
    baselineDelta <=
      textHeight * configuration.fusion.maximumBaselineDeltaInTextHeights
  );
}

function sharesContext(
  anchor: RecognizerObservation,
  context: RecognizerObservation,
  configuration: PriceEvidenceConfiguration
): boolean {
  if (sameLine(anchor, context)) {
    return true;
  }
  const { textHeight, verticalOverlap, horizontalGap } =
    observationRelationship(anchor, context);
  return (
    verticalOverlap > 0 &&
    horizontalGap <=
      configuration.fusion.maximumGapInTextHeights * textHeight * 2
  );
}

function hasNegativeContext(
  amount: RecognizerObservation,
  observations: readonly RecognizerObservation[],
  configuration: PriceEvidenceConfiguration
): boolean {
  const context = observations.filter((observation) =>
    sharesContext(amount, observation, configuration)
  );
  if (
    NEGATIVE_CONTEXT_PATTERN.test(context.map(({ text }) => text).join(" "))
  ) {
    return true;
  }
  return context.some(
    ({ text }) => containsForeignCurrencyMarker(text, configuration)
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
  configuration: PriceEvidenceConfiguration,
  minorUnits: number,
  evidence: readonly RecognizerObservation[]
): PriceEvidenceCandidate | null {
  const confidence = Math.min(...evidence.map(({ confidence }) => confidence));
  if (confidence < configuration.thresholds.candidateConfidence) {
    return null;
  }
  const polygon = convexHull(evidence.flatMap(({ polygon }) => polygon));
  return {
    currency: configuration.sourceCurrency,
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
  configuration: PriceEvidenceConfiguration,
  observations: readonly RecognizerObservation[]
): PriceEvidenceCandidate[] {
  const candidates: PriceEvidenceCandidate[] = [];
  const observationsByFrame = new Map<
    string,
    Map<string, RecognizerObservation[]>
  >();
  for (const observation of observations) {
    const { frameIdentity, preprocessingIdentity } = observation.passIdentity;
    const passes = observationsByFrame.get(frameIdentity) ?? new Map();
    const passObservations = passes.get(preprocessingIdentity) ?? [];
    passObservations.push(observation);
    passes.set(preprocessingIdentity, passObservations);
    observationsByFrame.set(frameIdentity, passes);
  }

  for (const passObservations of [...observationsByFrame.values()].flatMap(
    (passes) => [...passes.values()]
  )) {
    const markers = passObservations.filter(
      (observation) =>
        observation.confidence >= configuration.thresholds.markerConfidence &&
        isCompatibleMarker(observation.text, configuration)
    );

    for (const amount of passObservations) {
      if (
        amount.confidence < configuration.thresholds.textConfidence ||
        hasNegativeContext(amount, passObservations, configuration)
      ) {
        continue;
      }

      const combinedAmount = removeCompatibleMarker(
        amount.text,
        configuration
      );
      if (combinedAmount !== null) {
        if (amount.confidence < configuration.thresholds.markerConfidence) {
          continue;
        }
        const minorUnits = parseMinorUnits(combinedAmount, configuration);
        const combinedCandidate =
          minorUnits === null
            ? null
            : candidate(configuration, minorUnits, [amount]);
        if (combinedCandidate) {
          candidates.push(combinedCandidate);
        }
        continue;
      }

      const minorUnits = parseMinorUnits(amount.text, configuration);
      if (minorUnits === null) {
        continue;
      }
      for (const marker of markers) {
        if (!aligned(amount, marker, configuration)) {
          continue;
        }
        const splitCandidate = candidate(
          configuration,
          minorUnits,
          [amount, marker]
        );
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
