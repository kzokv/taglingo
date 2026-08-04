import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { hasRecognizerAdapter } from "../domain/currencies";
import { localizePrices, type OcrToken } from "./priceLocalization";
import { validateRealWorldRecognitionCorpusManifest } from "./recognitionFixtureManifest";

const CORPUS_ROOT = resolve(
  process.cwd(),
  "test-fixtures/recognition/real-world"
);
const manifest = validateRealWorldRecognitionCorpusManifest(
  JSON.parse(readFileSync(resolve(CORPUS_ROOT, "manifest.json"), "utf8"))
);
const annotationToken = (text: string): OcrToken => ({
  text,
  confidence: 100,
  box: { x: 0, y: 0, width: 100, height: 30 }
});

describe("real-world recognition image corpus", () => {
  it("pins a licensed real-world fixture for every Guest Camera Currency", () => {
    expect(manifest.version).toBe("real-world-recognition-corpus.v1");
    expect(new Set(manifest.fixtures.map(({ id }) => id)).size).toBe(
      manifest.fixtures.length
    );
    expect(
      [...new Set(manifest.fixtures.map(({ sourceCurrency }) => sourceCurrency))].sort()
    ).toEqual(["AUD", "EUR", "JPY", "TWD", "USD"]);
    expect(readdirSync(resolve(CORPUS_ROOT, "images")).sort()).toEqual(
      manifest.fixtures.map(({ file }) => file.replace("images/", "")).sort()
    );

    const attribution = readFileSync(
      resolve(CORPUS_ROOT, "ATTRIBUTION.md"),
      "utf8"
    );

    for (const fixture of manifest.fixtures) {
      expect(fixture.kind).toBe("real-world");
      expect(fixture.expectedPrices.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.browserExpectation.samples.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.challenges.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.source.provider).toBe("Wikimedia Commons");
      expect(fixture.source.author.trim(), fixture.id).not.toBe("");
      expect(fixture.source.descriptionUrl).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u
      );
      expect(fixture.source.downloadUrl).toMatch(
        /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//u
      );
      expect(fixture.source.licenseUrl).toMatch(
        /^https:\/\/creativecommons\.org\/licenses\/(?:by|by-sa)\//u
      );
      expect(fixture.source.originalSha1).toMatch(/^[a-f\d]{40}$/u);
      expect(fixture.asset.sha256).toMatch(/^[a-f\d]{64}$/u);
      expect(attribution, fixture.id).toContain(
        fixture.file.replace("images/", "")
      );
      if (fixture.parserAssertion === "pending") {
        expect(fixture.knownGap?.trim(), fixture.id).not.toBe("");
      }
      if (fixture.browserExpectation.status === "known-gap") {
        expect(fixture.browserExpectation.knownGap?.trim(), fixture.id).not.toBe("");
        expect(
          fixture.browserExpectation.observedDetectedPrices,
          fixture.id
        ).toBeDefined();
      }
      for (const sample of fixture.browserExpectation.samples) {
        expect(sample.x + sample.width, fixture.id).toBeLessThanOrEqual(
          fixture.asset.width
        );
        expect(sample.y + sample.height, fixture.id).toBeLessThanOrEqual(
          fixture.asset.height
        );
      }
      for (const { region } of fixture.expectedPrices) {
        expect(region.x, fixture.id).toBeGreaterThanOrEqual(0);
        expect(region.y, fixture.id).toBeGreaterThanOrEqual(0);
        expect(region.width, fixture.id).toBeGreaterThan(0);
        expect(region.height, fixture.id).toBeGreaterThan(0);
        expect(region.x + region.width, fixture.id).toBeLessThanOrEqual(
          fixture.asset.width
        );
        expect(region.y + region.height, fixture.id).toBeLessThanOrEqual(
          fixture.asset.height
        );
      }
    }
  });

  it("matches retained bytes and declared image dimensions", async () => {
    for (const fixture of manifest.fixtures) {
      const bytes = readFileSync(resolve(CORPUS_ROOT, fixture.file));
      expect(
        createHash("sha256").update(bytes).digest("hex"),
        fixture.id
      ).toBe(fixture.asset.sha256);
      const metadata = await sharp(bytes).metadata();
      expect(
        { width: metadata.width, height: metadata.height },
        fixture.id
      ).toEqual({
        width: fixture.asset.width,
        height: fixture.asset.height
      });
    }
  });

  it("keeps supported image annotations aligned with Currency Notation Rules", () => {
    const requiredAnnotations = manifest.fixtures.flatMap((fixture) =>
      fixture.parserAssertion === "required"
        ? fixture.expectedPrices.map((price) => ({ fixture, price }))
        : []
    );

    for (const { fixture, price } of requiredAnnotations) {
      expect(hasRecognizerAdapter(fixture.sourceCurrency), fixture.id).toBe(true);
      if (!hasRecognizerAdapter(fixture.sourceCurrency)) continue;
      expect(
        localizePrices(fixture.sourceCurrency, [annotationToken(price.text)])[0]
          ?.minorUnits,
        `${fixture.id}: ${price.text}`
      ).toBe(price.minorUnits);
    }
  });
});
