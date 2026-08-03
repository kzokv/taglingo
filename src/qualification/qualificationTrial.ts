import { SOURCE_CURRENCIES } from "../domain/currencies";
import { deepFreeze, hasExactKeys } from "../domain/exactObject";
import { configurationMatches } from "./qualificationManifest";
import { isPositiveStratum } from "./qualificationPolicy";
import type {
  ExactPrice,
  FrozenTrialRecord,
  QualificationManifest,
  TrialCaptureInput,
  TrialTerminalOutcome
} from "./qualificationTypes";

const CAPTURE_KEYS = [
  "fixtureId",
  "stratum",
  "configuration",
  "device",
  "browser",
  "timings",
  "expectation",
  "focusTransitions",
  "geometry",
  "terminalOutcome"
] as const;

const RECORD_KEYS = CAPTURE_KEYS.filter(
  (key) => key !== "expectation"
) as readonly Exclude<(typeof CAPTURE_KEYS)[number], "expectation">[];

function assertExactShape<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
  description: string
): asserts value is Record<Key, unknown> {
  if (!hasExactKeys(value, keys)) {
    throw new Error(`Unknown or missing ${description} field.`);
  }
}

function isExactPrice(value: unknown): value is ExactPrice {
  return (
    hasExactKeys(value, ["sourceCurrency", "minorUnits"]) &&
    SOURCE_CURRENCIES.some(({ code }) => code === value.sourceCurrency) &&
    Number.isSafeInteger(value.minorUnits) &&
    (value.minorUnits as number) >= 0
  );
}

function metadataMatches(
  manifest: QualificationManifest,
  value: Pick<
    TrialCaptureInput,
    "configuration" | "device" | "browser"
  >
) {
  return (
    configurationMatches(value.configuration, manifest.configuration) &&
    value.device.model === manifest.device.model &&
    value.device.osName === manifest.device.osName &&
    value.device.osVersion === manifest.device.osVersion &&
    value.device.releaseStatus === manifest.device.releaseStatus &&
    value.browser.name === manifest.browser.name &&
    value.browser.version === manifest.browser.version &&
    value.browser.releaseStatus === manifest.browser.releaseStatus
  );
}

function assertCommonTrialValues(
  manifest: QualificationManifest,
  value: Omit<TrialCaptureInput, "expectation" | "focusTransitions"> & {
    readonly focusTransitions: readonly {
      readonly atMs: number;
    }[];
  }
) {
  const fixture = manifest.fixtures.find(({ id }) => id === value.fixtureId);
  if (!fixture) {
    throw new Error(`Fixture ${value.fixtureId} is not declared by the manifest.`);
  }
  if (fixture.stratum !== value.stratum) {
    throw new Error(`Fixture ${value.fixtureId} has a mismatched declared stratum.`);
  }
  if (!metadataMatches(manifest, value)) {
    throw new Error(
      "Trial configuration, device and browser do not match the frozen manifest."
    );
  }
  const validOutcomes: readonly TrialTerminalOutcome[] = [
    "completed",
    "crash",
    "timeout",
    "missing-telemetry",
    "excluded"
  ];
  if (!validOutcomes.includes(value.terminalOutcome)) {
    throw new Error(`Unknown terminal outcome: ${String(value.terminalOutcome)}.`);
  }
  if (
    !Number.isFinite(value.timings.recognitionReadyMs) ||
    value.timings.recognitionReadyMs < 0 ||
    !Number.isFinite(value.timings.observationWindowMs) ||
    value.timings.observationWindowMs < 0 ||
    (value.timings.geometryMs !== null &&
      (!Number.isFinite(value.timings.geometryMs) ||
        value.timings.geometryMs < 0))
  ) {
    throw new Error("Trial timings must be finite, non-negative milliseconds.");
  }
  if (
    value.focusTransitions.some(
      ({ atMs }) =>
        !Number.isFinite(atMs) ||
        atMs < 0 ||
        atMs > value.timings.observationWindowMs
    )
  ) {
    throw new Error("Focus transitions require valid timings.");
  }
  if (
    value.geometry !== null &&
    (!Number.isFinite(value.geometry.iou) ||
      value.geometry.iou < 0 ||
      value.geometry.iou > 1 ||
      typeof value.geometry.oneToOne !== "boolean")
  ) {
    throw new Error("Geometry score must be a one-to-one IoU from zero to one.");
  }
  if ((value.geometry === null) !== (value.timings.geometryMs === null)) {
    throw new Error(
      "Geometry timing and score must either both be present or both be absent."
    );
  }
}

function assertNestedShapes(
  value: TrialCaptureInput | FrozenTrialRecord,
  transitionKeys: readonly string[]
) {
  assertExactShape(value.configuration, [
    "sourceCurrency",
    "platform",
    "profileId",
    "profileVersion",
    "profileHash",
    "evidenceVersion",
    "acceptedMarkerClasses",
    "acceptedNumberFormatClasses"
  ], "trial configuration");
  assertExactShape(
    value.device,
    ["model", "osName", "osVersion", "releaseStatus"],
    "trial device"
  );
  assertExactShape(
    value.browser,
    ["name", "version", "releaseStatus"],
    "trial browser"
  );
  assertExactShape(
    value.timings,
    ["recognitionReadyMs", "observationWindowMs", "geometryMs"],
    "trial timing"
  );
  if (value.geometry !== null) {
    assertExactShape(value.geometry, ["oneToOne", "iou"], "trial geometry");
  }
  if (!Array.isArray(value.focusTransitions)) {
    throw new Error("Trial focus transitions must be an array.");
  }
  for (const transition of value.focusTransitions) {
    assertExactShape(transition, transitionKeys, "focus transition");
  }
}

function pricesMatch(left: ExactPrice, right: ExactPrice): boolean {
  return (
    left.sourceCurrency === right.sourceCurrency &&
    left.minorUnits === right.minorUnits
  );
}

export function createFrozenTrialRecord(
  manifest: QualificationManifest,
  input: TrialCaptureInput
): FrozenTrialRecord {
  assertExactShape(input, CAPTURE_KEYS, "trial");
  assertNestedShapes(input, ["atMs", "focusedPrice"]);
  assertCommonTrialValues(manifest, input);
  const positive = isPositiveStratum(input.stratum);
  if (
    positive &&
    (!isExactPrice(input.expectation) ||
      input.expectation.sourceCurrency !== manifest.configuration.sourceCurrency)
  ) {
    throw new Error(
      "A positive fixture requires an exact expected Source Currency and minor-unit value."
    );
  }
  if (!positive && input.expectation !== null) {
    throw new Error("A negative fixture cannot declare an expected Focused Price.");
  }
  for (const transition of input.focusTransitions) {
    if (!isExactPrice(transition.focusedPrice)) {
      throw new Error("Focused Price observations require exact currency and minor units.");
    }
  }

  const record: FrozenTrialRecord = {
    fixtureId: input.fixtureId,
    stratum: input.stratum,
    configuration: structuredClone(input.configuration),
    device: structuredClone(input.device),
    browser: structuredClone(input.browser),
    timings: structuredClone(input.timings),
    focusTransitions: input.focusTransitions.map(({ atMs, focusedPrice }) => ({
      atMs,
      classification:
        input.expectation !== null && pricesMatch(focusedPrice, input.expectation)
          ? "expected"
          : "incorrect"
    })),
    geometry: structuredClone(input.geometry),
    terminalOutcome: input.terminalOutcome
  };
  return deepFreeze(record);
}

export function validateFrozenTrialRecord(
  manifest: QualificationManifest,
  record: FrozenTrialRecord
): FrozenTrialRecord {
  assertExactShape(record, RECORD_KEYS, "trial");
  assertNestedShapes(record, ["atMs", "classification"]);
  assertCommonTrialValues(manifest, record);
  if (
    record.focusTransitions.some(
      ({ classification }) =>
        classification !== "expected" && classification !== "incorrect"
    ) ||
    (!isPositiveStratum(record.stratum) &&
      record.focusTransitions.some(
        ({ classification }) => classification === "expected"
      ))
  ) {
    throw new Error("Trial contains an invalid focus classification.");
  }
  return record;
}
