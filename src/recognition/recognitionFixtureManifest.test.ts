import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createRecognitionFixtureContracts,
  validateGeneratedRecognitionCorpusManifest,
  validateRealWorldRecognitionCorpusManifest
} from "./recognitionFixtureManifest";

const json = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
const generated = () =>
  json("test-fixtures/recognition/generated/manifest.json");
const realWorld = () =>
  json("test-fixtures/recognition/real-world/manifest.json");

describe("recognition fixture manifest contract", () => {
  it("normalizes validated generated and real-world manifests without currency casts", () => {
    const generatedManifest = validateGeneratedRecognitionCorpusManifest(
      generated()
    );
    const realWorldManifest = validateRealWorldRecognitionCorpusManifest(
      realWorld()
    );
    const contracts = createRecognitionFixtureContracts(
      generatedManifest,
      realWorldManifest
    );

    expect(new Set(contracts.map(({ origin }) => origin))).toEqual(
      new Set(["generated", "real-world"])
    );
    expect(
      contracts.find(({ id }) => id === "generated-cny-simplified")
    ).toMatchObject({
      sourceCurrency: "CNY",
      challenges: [
        "non-guest-camera-source-currency",
        "multilingual-label"
      ]
    });
    expect(
      contracts.flatMap(({ id, file }) => [id, file]).some((value) =>
        value.includes("member")
      )
    ).toBe(false);
  });

  it("rejects unknown currencies and host-dependent generated image formats", () => {
    const unknownCurrency = structuredClone(generated()) as {
      fixtures: Array<Record<string, unknown>>;
    };
    unknownCurrency.fixtures[0].sourceCurrency = "BTC";
    expect(() =>
      validateGeneratedRecognitionCorpusManifest(unknownCurrency)
    ).toThrow(/Source Currency/u);

    const svg = structuredClone(generated()) as {
      fixtures: Array<Record<string, unknown>>;
    };
    svg.fixtures[0].file = "images/host-font.svg";
    expect(() => validateGeneratedRecognitionCorpusManifest(svg)).toThrow(
      /PNG/u
    );
  });

  it.each([
    ["manifest", (manifest: any) => (manifest.deprecated = true)],
    ["fixture", (manifest: any) => (manifest.fixtures[0].deprecated = true)],
    ["asset", (manifest: any) => (manifest.fixtures[0].asset.format = "png")],
    [
      "expectation",
      (manifest: any) => (manifest.fixtures[0].expectation.knownGap = "none")
    ],
    [
      "Detected Price",
      (manifest: any) =>
        (manifest.fixtures[0].expectation.detectedPrices[0].currency = "USD")
    ],
    [
      "region",
      (manifest: any) =>
        (manifest.fixtures[0].expectation.detectedPrices[0].region.right = 650)
    ]
  ])("rejects an unexpected generated %s field", (_layer, change) => {
    const manifest = structuredClone(generated());
    change(manifest);

    expect(() => validateGeneratedRecognitionCorpusManifest(manifest)).toThrow(
      /unexpected or missing fields/u
    );
  });

  it("requires known gaps to declare exact observed currency and regions or explicit absence", () => {
    const manifest = structuredClone(realWorld()) as {
      fixtures: Array<Record<string, unknown>>;
    };
    const fixture = manifest.fixtures[0];
    const expectation = fixture.browserExpectation as Record<string, unknown>;
    delete expectation.observedDetectedPrices;
    expect(() => validateRealWorldRecognitionCorpusManifest(manifest)).toThrow(
      /observed Detected Prices/u
    );

    expectation.observedDetectedPrices = [
      {
        currency: "USD",
        minorUnits: 698,
        region: { x: 0, y: 0, width: 10, height: 10 }
      }
    ];
    expect(() => validateRealWorldRecognitionCorpusManifest(manifest)).toThrow(
      /Source Currency/u
    );
  });

  it.each([
    ["manifest", (manifest: any) => (manifest.deprecated = true)],
    ["fixture", (manifest: any) => (manifest.fixtures[0].deprecated = true)],
    ["asset", (manifest: any) => (manifest.fixtures[0].asset.format = "jpeg")],
    [
      "annotation",
      (manifest: any) => (manifest.fixtures[0].expectedPrices[0].deprecated = true)
    ],
    [
      "browser expectation",
      (manifest: any) => (manifest.fixtures[0].browserExpectation.deprecated = true)
    ],
    [
      "sample",
      (manifest: any) =>
        (manifest.fixtures[0].browserExpectation.samples[0].right = 350)
    ],
    [
      "observed Detected Price",
      (manifest: any) =>
        (manifest.fixtures[0].browserExpectation.observedDetectedPrices[0].text =
          "$6.98")
    ],
    [
      "source",
      (manifest: any) => {
        manifest.fixtures[0].source.licenseName =
          manifest.fixtures[0].source.license;
        delete manifest.fixtures[0].source.license;
      }
    ]
  ])("rejects an unexpected real-world %s field", (_layer, change) => {
    const manifest = structuredClone(realWorld());
    change(manifest);

    expect(() => validateRealWorldRecognitionCorpusManifest(manifest)).toThrow(
      /unexpected or missing fields/u
    );
  });

  it("rejects contradictory fields on a passing browser expectation", () => {
    const manifest = structuredClone(realWorld()) as {
      fixtures: Array<Record<string, any>>;
    };
    manifest.fixtures[0].browserExpectation.status = "pass";

    expect(() => validateRealWorldRecognitionCorpusManifest(manifest)).toThrow(
      /unexpected or missing fields/u
    );
  });
});
