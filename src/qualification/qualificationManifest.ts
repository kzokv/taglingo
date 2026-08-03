import { SOURCE_CURRENCIES } from "../domain/currencies";
import { deepFreeze, hasExactKeys } from "../domain/exactObject";
import { QUALIFICATION_POLICY, isPositiveStratum } from "./qualificationPolicy";
import type {
  FixtureManifestEntry,
  QualificationChallenge,
  QualificationManifest,
  QualificationStratum
} from "./qualificationTypes";

function assertNonEmpty(value: string, description: string) {
  if (value.trim().length === 0) {
    throw new Error(`${description} must not be empty.`);
  }
}

function assertPlatformBlock(manifest: QualificationManifest) {
  const { platform } = manifest.configuration;
  const { device, browser } = manifest;
  if (
    device.releaseStatus !== "current" ||
    browser.releaseStatus !== "current"
  ) {
    throw new Error("Qualification requires current device and browser versions.");
  }
  if (
    platform === "ios" &&
    (device.model !== "iPhone 16 Pro" ||
      device.osName !== "iOS" ||
      browser.name !== "Safari")
  ) {
    throw new Error(
      "The iOS qualification block requires iPhone 16 Pro and current iOS Safari."
    );
  }
  if (
    platform === "android" &&
    (device.osName !== "Android" ||
      browser.name !== "Chrome" ||
      /^(android|unknown|generic)$/iu.test(device.model.trim()))
  ) {
    throw new Error(
      "The Android qualification block requires current Android Chrome on a named representative device."
    );
  }
}

function assertCoverage(manifest: QualificationManifest) {
  const positives = manifest.fixtures.filter(({ stratum }) =>
    isPositiveStratum(stratum)
  );
  for (const markerClass of manifest.configuration.acceptedMarkerClasses) {
    const count = positives.filter((fixture) => fixture.markerClass === markerClass)
      .length;
    if (count < QUALIFICATION_POLICY.minimumScenesPerAcceptedClass) {
      throw new Error(
        `Accepted marker class ${markerClass} requires at least 10 positive scenes.`
      );
    }
  }
  for (const formatClass of manifest.configuration.acceptedNumberFormatClasses) {
    const count = positives.filter(
      (fixture) => fixture.numberFormatClass === formatClass
    ).length;
    if (count < QUALIFICATION_POLICY.minimumScenesPerAcceptedClass) {
      throw new Error(
        `Accepted number-format class ${formatClass} requires at least 10 positive scenes.`
      );
    }
  }
  const coveredChallenges = new Set(
    manifest.fixtures.flatMap(({ challenges }) => challenges)
  );
  for (const challenge of QUALIFICATION_POLICY.requiredChallenges) {
    if (!coveredChallenges.has(challenge)) {
      throw new Error(`Qualification corpus does not cover ${challenge}.`);
    }
  }
}

export function validateQualificationManifest(manifest: QualificationManifest) {
  if (manifest.version !== "qualification-manifest.v1") {
    throw new Error(`Unknown qualification manifest version: ${String(manifest.version)}.`);
  }
  if (
    !SOURCE_CURRENCIES.some(
      ({ code }) => code === manifest.configuration.sourceCurrency
    ) ||
    !["ios", "android"].includes(manifest.configuration.platform)
  ) {
    throw new Error("Qualification configuration requires a known currency and platform.");
  }
  assertPlatformBlock(manifest);
  assertNonEmpty(manifest.configuration.profileId, "Profile identity");
  assertNonEmpty(manifest.configuration.profileVersion, "Profile version");
  assertNonEmpty(manifest.configuration.evidenceVersion, "Evidence version");
  if (!/^sha256:[a-f\d]{64}$/u.test(manifest.configuration.profileHash)) {
    throw new Error("Qualification configuration requires a SHA-256 profile hash.");
  }
  if (
    manifest.configuration.acceptedMarkerClasses.length === 0 ||
    manifest.configuration.acceptedNumberFormatClasses.length === 0 ||
    new Set(manifest.configuration.acceptedMarkerClasses).size !==
      manifest.configuration.acceptedMarkerClasses.length ||
    new Set(manifest.configuration.acceptedNumberFormatClasses).size !==
      manifest.configuration.acceptedNumberFormatClasses.length ||
    manifest.configuration.acceptedMarkerClasses.some((value) => !value.trim()) ||
    manifest.configuration.acceptedNumberFormatClasses.some((value) => !value.trim())
  ) {
    throw new Error("Qualification configuration requires accepted marker and number-format classes.");
  }
  assertNonEmpty(manifest.device.osVersion, "Device OS version");
  assertNonEmpty(manifest.browser.version, "Browser version");

  const identities = new Set<string>();
  const counts = new Map<QualificationStratum, number>();
  for (const entry of manifest.fixtures) {
    assertNonEmpty(entry.id, "Fixture identity");
    if (identities.has(entry.id)) {
      throw new Error(`Qualification requires a unique fixture identity: ${entry.id}.`);
    }
    identities.add(entry.id);
    if (!(entry.stratum in QUALIFICATION_POLICY.requiredStratumCounts)) {
      throw new Error(`Unknown qualification stratum: ${String(entry.stratum)}.`);
    }
    if (entry.inventory !== "held-out") {
      throw new Error(`Qualification fixture ${entry.id} is not held-out.`);
    }
    if (
      !["consented", "licensed"].includes(entry.provenance.kind) ||
      entry.provenance.reference.trim().length === 0
    ) {
      throw new Error(`Fixture ${entry.id} requires consent or license provenance.`);
    }
    if (
      isPositiveStratum(entry.stratum) &&
      (!entry.markerClass ||
        !manifest.configuration.acceptedMarkerClasses.includes(entry.markerClass) ||
        !entry.numberFormatClass ||
        !manifest.configuration.acceptedNumberFormatClasses.includes(
          entry.numberFormatClass
        ))
    ) {
      throw new Error(
        `Positive fixture ${entry.id} requires declared accepted marker and number-format classes.`
      );
    }
    if (
      entry.challenges.some(
        (challenge) =>
          !QUALIFICATION_POLICY.requiredChallenges.includes(
            challenge as QualificationChallenge
          )
      )
    ) {
      throw new Error(`Fixture ${entry.id} declares an unknown coverage challenge.`);
    }
    counts.set(entry.stratum, (counts.get(entry.stratum) ?? 0) + 1);
  }

  for (const [stratum, required] of Object.entries(
    QUALIFICATION_POLICY.requiredStratumCounts
  )) {
    const actual = counts.get(stratum as QualificationStratum) ?? 0;
    if (actual !== required) {
      throw new Error(
        `Qualification requires exactly ${required} ${stratum} fixtures; received ${actual}.`
      );
    }
  }
  assertCoverage(manifest);
}

export function createQualificationManifest(
  input: QualificationManifest
): QualificationManifest {
  const manifest = structuredClone(input);
  validateQualificationManifest(manifest);
  return deepFreeze(manifest);
}

export function retireHeldOutFixture(
  manifest: QualificationManifest,
  fixtureId: string,
  replacement: FixtureManifestEntry
): {
  readonly manifest: QualificationManifest;
  readonly retiredFixture: FixtureManifestEntry;
} {
  const index = manifest.fixtures.findIndex(({ id }) => id === fixtureId);
  if (index < 0) {
    throw new Error(`Fixture ${fixtureId} is not in the held-out inventory.`);
  }
  const current = manifest.fixtures[index];
  if (replacement.stratum !== current.stratum) {
    throw new Error("A held-out replacement must use the same stratum.");
  }
  if (
    replacement.id === current.id ||
    manifest.fixtures.some(({ id }) => id === replacement.id)
  ) {
    throw new Error("A held-out replacement requires a fresh fixture identity.");
  }
  if (replacement.inventory !== "held-out") {
    throw new Error("A replacement must enter the held-out inventory.");
  }

  const fixtures = manifest.fixtures.map((entry, entryIndex) =>
    entryIndex === index ? replacement : entry
  );
  return deepFreeze({
    manifest: createQualificationManifest({ ...manifest, fixtures }),
    retiredFixture: {
      ...structuredClone(current),
      inventory: "development" as const
    }
  });
}

export function configurationMatches(
  actual: QualificationManifest["configuration"],
  expected: QualificationManifest["configuration"]
): boolean {
  const sameStrings = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
  return (
    hasExactKeys(actual, [
      "sourceCurrency",
      "platform",
      "profileId",
      "profileVersion",
      "profileHash",
      "evidenceVersion",
      "acceptedMarkerClasses",
      "acceptedNumberFormatClasses"
    ]) &&
    actual.sourceCurrency === expected.sourceCurrency &&
    actual.platform === expected.platform &&
    actual.profileId === expected.profileId &&
    actual.profileVersion === expected.profileVersion &&
    actual.profileHash === expected.profileHash &&
    actual.evidenceVersion === expected.evidenceVersion &&
    Array.isArray(actual.acceptedMarkerClasses) &&
    sameStrings(
      actual.acceptedMarkerClasses as readonly string[],
      expected.acceptedMarkerClasses
    ) &&
    Array.isArray(actual.acceptedNumberFormatClasses) &&
    sameStrings(
      actual.acceptedNumberFormatClasses as readonly string[],
      expected.acceptedNumberFormatClasses
    )
  );
}
