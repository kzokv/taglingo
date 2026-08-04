import { isCurrencyCode, type SourceCurrencyCode } from "../domain/currencies";
import { hasExactKeys } from "../domain/exactObject";
import type { Rectangle } from "../domain/geometry";

export interface RecognitionFixtureAsset {
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

export interface ExpectedRecognitionFixturePrice {
  readonly currency: SourceCurrencyCode;
  readonly minorUnits: number;
  readonly region: Rectangle;
}

interface RecognitionFixtureBase {
  readonly id: string;
  readonly file: string;
  readonly sourceCurrency: SourceCurrencyCode;
  readonly challenges: readonly string[];
  readonly asset: RecognitionFixtureAsset;
}

export interface GeneratedRecognitionFixture extends RecognitionFixtureBase {
  readonly origin: "generated";
  readonly scripts: readonly string[];
  readonly expectation: {
    readonly status: "pass";
    readonly detectedPrices: readonly Omit<
      ExpectedRecognitionFixturePrice,
      "currency"
    >[];
  };
}

export interface GeneratedRecognitionCorpusManifest {
  readonly version: "generated-recognition-corpus.v1";
  readonly license: "CC0-1.0";
  readonly fixtures: readonly GeneratedRecognitionFixture[];
}

export interface RealWorldRecognitionFixture extends RecognitionFixtureBase {
  readonly kind: "real-world";
  readonly expectedPrices: readonly (Omit<
    ExpectedRecognitionFixturePrice,
    "currency"
  > & { readonly text: string })[];
  readonly browserExpectation: {
    readonly status: "pass" | "known-gap";
    readonly samples: readonly Rectangle[];
    readonly knownGap?: string;
    readonly observedDetectedPrices?: readonly ExpectedRecognitionFixturePrice[];
  };
  readonly parserAssertion: "required" | "pending";
  readonly knownGap?: string;
  readonly source: {
    readonly provider: "Wikimedia Commons";
    readonly title: string;
    readonly descriptionUrl: string;
    readonly downloadUrl: string;
    readonly author: string;
    readonly license: "CC BY 4.0" | "CC BY-SA 2.0" | "CC BY-SA 4.0";
    readonly licenseUrl: string;
    readonly originalSha1: string;
  };
}

export interface RealWorldRecognitionCorpusManifest {
  readonly version: "real-world-recognition-corpus.v1";
  readonly fixtures: readonly RealWorldRecognitionFixture[];
}

export interface RecognitionFixtureContract extends RecognitionFixtureBase {
  readonly origin: "generated" | "real-world";
  readonly expectation: {
    readonly status: "pass" | "known-gap";
    readonly knownGap?: string;
    readonly detectedPrices: readonly ExpectedRecognitionFixturePrice[];
    readonly observedDetectedPrices?: readonly ExpectedRecognitionFixturePrice[];
  };
  readonly samples?: readonly Rectangle[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactRecord<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
  label: string
): Record<Key, unknown> {
  if (!hasExactKeys(value, keys)) {
    throw new Error(`${label} has unexpected or missing fields.`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function sourceCurrency(value: unknown, label: string): SourceCurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new Error(`${label} has an unknown Source Currency.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
}

function rectangle(
  value: unknown,
  asset: RecognitionFixtureAsset,
  label: string
): Rectangle {
  const candidate = exactRecord(
    value,
    ["x", "y", "width", "height"],
    label
  );
  const result = {
    x: nonNegativeInteger(candidate.x, `${label} x`),
    y: nonNegativeInteger(candidate.y, `${label} y`),
    width: positiveInteger(candidate.width, `${label} width`),
    height: positiveInteger(candidate.height, `${label} height`)
  };
  if (
    result.x + result.width > asset.width ||
    result.y + result.height > asset.height
  ) {
    throw new Error(`${label} lies outside the declared image dimensions.`);
  }
  return result;
}

function asset(value: unknown, label: string): RecognitionFixtureAsset {
  const candidate = exactRecord(
    value,
    ["sha256", "width", "height"],
    label
  );
  const sha256 = nonEmptyString(candidate.sha256, `${label} SHA-256`);
  if (!/^[a-f\d]{64}$/u.test(sha256)) {
    throw new Error(`${label} SHA-256 is invalid.`);
  }
  return {
    sha256,
    width: positiveInteger(candidate.width, `${label} width`),
    height: positiveInteger(candidate.height, `${label} height`)
  };
}

function stringArray(value: unknown, label: string): readonly string[] {
  const values = array(value, label).map((entry) =>
    nonEmptyString(entry, `${label} entry`)
  );
  if (values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return values;
}

function commonFixture(
  candidate: Record<string, unknown>,
  label: string
) {
  const fixtureAsset = asset(candidate.asset, `${label} asset`);
  return {
    candidate,
    common: {
      id: nonEmptyString(candidate.id, `${label} id`),
      file: nonEmptyString(candidate.file, `${label} file`),
      sourceCurrency: sourceCurrency(candidate.sourceCurrency, label),
      challenges: stringArray(candidate.challenges, `${label} challenges`),
      asset: fixtureAsset
    }
  };
}

function expectedPrice(
  value: unknown,
  currency: SourceCurrencyCode,
  fixtureAsset: RecognitionFixtureAsset,
  label: string,
  keys: readonly string[]
): ExpectedRecognitionFixturePrice {
  const candidate = exactRecord(value, keys, label);
  const declaredCurrency =
    candidate.currency === undefined
      ? currency
      : sourceCurrency(candidate.currency, label);
  if (declaredCurrency !== currency) {
    throw new Error(`${label} currency must match its Source Currency.`);
  }
  return {
    currency: declaredCurrency,
    minorUnits: nonNegativeInteger(candidate.minorUnits, `${label} minor units`),
    region: rectangle(candidate.region, fixtureAsset, `${label} region`)
  };
}

function uniqueFixtureIds(fixtures: readonly RecognitionFixtureBase[]): void {
  if (new Set(fixtures.map(({ id }) => id)).size !== fixtures.length) {
    throw new Error("Recognition fixture ids must be unique.");
  }
}

export function validateGeneratedRecognitionCorpusManifest(
  value: unknown
): GeneratedRecognitionCorpusManifest {
  const manifest = exactRecord(
    value,
    ["version", "license", "fixtures"],
    "Generated recognition corpus"
  );
  if (
    manifest.version !== "generated-recognition-corpus.v1" ||
    manifest.license !== "CC0-1.0"
  ) {
    throw new Error("Generated recognition corpus metadata is invalid.");
  }
  const fixtures = array(manifest.fixtures, "Generated fixtures").map(
    (value, index): GeneratedRecognitionFixture => {
      const label = `Generated fixture ${index.toString()}`;
      const candidate = exactRecord(
        value,
        [
          "id",
          "file",
          "origin",
          "sourceCurrency",
          "scripts",
          "challenges",
          "asset",
          "expectation"
        ],
        label
      );
      const { common } = commonFixture(candidate, label);
      if (candidate.origin !== "generated") {
        throw new Error(`${label} origin must be generated.`);
      }
      if (!common.file.startsWith("images/") || !common.file.endsWith(".png")) {
        throw new Error(`${label} must reference checked-in PNG bytes.`);
      }
      const expectation = exactRecord(
        candidate.expectation,
        ["status", "detectedPrices"],
        `${label} expectation`
      );
      if (expectation.status !== "pass") {
        throw new Error(`${label} generated expectation must be pass.`);
      }
      const detectedPrices = array(
        expectation.detectedPrices,
        `${label} expected Detected Prices`
      ).map((price, priceIndex) => {
        const parsed = expectedPrice(
          price,
          common.sourceCurrency,
          common.asset,
          `${label} expected price ${priceIndex.toString()}`,
          ["minorUnits", "region"]
        );
        return { minorUnits: parsed.minorUnits, region: parsed.region };
      });
      return {
        ...common,
        origin: "generated",
        scripts: stringArray(candidate.scripts, `${label} scripts`),
        expectation: {
          status: "pass",
          detectedPrices
        }
      };
    }
  );
  uniqueFixtureIds(fixtures);
  return {
    version: "generated-recognition-corpus.v1",
    license: "CC0-1.0",
    fixtures
  };
}

export function validateRealWorldRecognitionCorpusManifest(
  value: unknown
): RealWorldRecognitionCorpusManifest {
  const manifest = exactRecord(
    value,
    ["version", "fixtures"],
    "Real-world recognition corpus"
  );
  if (manifest.version !== "real-world-recognition-corpus.v1") {
    throw new Error("Real-world recognition corpus version is invalid.");
  }
  const fixtures = array(manifest.fixtures, "Real-world fixtures").map(
    (value, index): RealWorldRecognitionFixture => {
      const label = `Real-world fixture ${index.toString()}`;
      const rawCandidate = record(value, label);
      const candidate = exactRecord(
        value,
        [
          "id",
          "file",
          "sourceCurrency",
          "kind",
          "expectedPrices",
          "browserExpectation",
          "parserAssertion",
          "challenges",
          "asset",
          "source",
          ...(rawCandidate.knownGap === undefined ? [] : ["knownGap"] as const)
        ],
        label
      );
      const { common } = commonFixture(candidate, label);
      if (candidate.kind !== "real-world") {
        throw new Error(`${label} kind must be real-world.`);
      }
      const expectedPrices = array(
        candidate.expectedPrices,
        `${label} expected prices`
      ).map((value, priceIndex) => {
        const raw = record(value, `${label} annotation`);
        const parsed = expectedPrice(
          raw,
          common.sourceCurrency,
          common.asset,
          `${label} expected price ${priceIndex.toString()}`,
          ["text", "minorUnits", "region"]
        );
        return {
          text: nonEmptyString(raw.text, `${label} annotation text`),
          minorUnits: parsed.minorUnits,
          region: parsed.region
        };
      });
      const rawExpectation = record(
        candidate.browserExpectation,
        `${label} browser expectation`
      );
      if (
        rawExpectation.status === "known-gap" &&
        !Array.isArray(rawExpectation.observedDetectedPrices)
      ) {
        throw new Error(
          `${label} must declare observed Detected Prices or explicit absence.`
        );
      }
      const expectation = exactRecord(
        candidate.browserExpectation,
        rawExpectation.status === "known-gap"
          ? ["status", "knownGap", "observedDetectedPrices", "samples"]
          : ["status", "samples"],
        `${label} browser expectation`
      );
      if (expectation.status !== "pass" && expectation.status !== "known-gap") {
        throw new Error(`${label} browser status is invalid.`);
      }
      const samples = array(expectation.samples, `${label} samples`).map(
        (sample, sampleIndex) =>
          rectangle(
            sample,
            common.asset,
            `${label} sample ${sampleIndex.toString()}`
          )
      );
      if (samples.length === 0) {
        throw new Error(`${label} samples must not be empty.`);
      }
      let observedDetectedPrices:
        | readonly ExpectedRecognitionFixturePrice[]
        | undefined;
      let browserKnownGap: string | undefined;
      if (expectation.status === "known-gap") {
        browserKnownGap = nonEmptyString(
          expectation.knownGap,
          `${label} browser known gap`
        );
        if (!Array.isArray(expectation.observedDetectedPrices)) {
          throw new Error(`${label} must declare observed Detected Prices or explicit absence.`);
        }
        observedDetectedPrices = expectation.observedDetectedPrices.map(
          (price, priceIndex) =>
            expectedPrice(
              price,
              common.sourceCurrency,
              common.asset,
              `${label} observed Detected Price ${priceIndex.toString()}`,
              ["currency", "minorUnits", "region"]
            )
        );
      }
      const parserAssertion = candidate.parserAssertion;
      if (parserAssertion !== "required" && parserAssertion !== "pending") {
        throw new Error(`${label} parser assertion is invalid.`);
      }
      const source = exactRecord(
        candidate.source,
        [
          "provider",
          "title",
          "descriptionUrl",
          "downloadUrl",
          "author",
          "license",
          "licenseUrl",
          "originalSha1"
        ],
        `${label} source`
      );
      if (source.provider !== "Wikimedia Commons") {
        throw new Error(`${label} source provider is invalid.`);
      }
      if (
        source.license !== "CC BY 4.0" &&
        source.license !== "CC BY-SA 2.0" &&
        source.license !== "CC BY-SA 4.0"
      ) {
        throw new Error(`${label} source license is invalid.`);
      }
      return {
        ...common,
        kind: "real-world",
        expectedPrices,
        browserExpectation: {
          status: expectation.status,
          samples,
          knownGap: browserKnownGap,
          observedDetectedPrices
        },
        parserAssertion,
        knownGap:
          candidate.knownGap === undefined
            ? undefined
            : nonEmptyString(candidate.knownGap, `${label} known gap`),
        source: {
          provider: source.provider,
          title: nonEmptyString(source.title, `${label} title`),
          descriptionUrl: nonEmptyString(source.descriptionUrl, `${label} description URL`),
          downloadUrl: nonEmptyString(source.downloadUrl, `${label} download URL`),
          author: nonEmptyString(source.author, `${label} author`),
          license: source.license,
          licenseUrl: nonEmptyString(source.licenseUrl, `${label} license URL`),
          originalSha1: nonEmptyString(source.originalSha1, `${label} original SHA-1`)
        }
      };
    }
  );
  uniqueFixtureIds(fixtures);
  return { version: "real-world-recognition-corpus.v1", fixtures };
}

export function createRecognitionFixtureContracts(
  generated: GeneratedRecognitionCorpusManifest,
  realWorld: RealWorldRecognitionCorpusManifest
): readonly RecognitionFixtureContract[] {
  return [
    ...generated.fixtures.map((fixture) => ({
      id: fixture.id,
      file: fixture.file,
      origin: fixture.origin,
      sourceCurrency: fixture.sourceCurrency,
      challenges: fixture.challenges,
      asset: fixture.asset,
      expectation: {
        status: fixture.expectation.status,
        detectedPrices: fixture.expectation.detectedPrices.map((price) => ({
          ...price,
          currency: fixture.sourceCurrency
        }))
      }
    })),
    ...realWorld.fixtures.map((fixture) => ({
      id: fixture.id,
      file: fixture.file,
      origin: "real-world" as const,
      sourceCurrency: fixture.sourceCurrency,
      challenges: fixture.challenges,
      asset: fixture.asset,
      expectation: {
        status: fixture.browserExpectation.status,
        knownGap: fixture.browserExpectation.knownGap,
        detectedPrices: fixture.expectedPrices.map((price) => ({
          currency: fixture.sourceCurrency,
          minorUnits: price.minorUnits,
          region: price.region
        })),
        observedDetectedPrices:
          fixture.browserExpectation.observedDetectedPrices
      },
      samples: fixture.browserExpectation.samples
    }))
  ];
}
