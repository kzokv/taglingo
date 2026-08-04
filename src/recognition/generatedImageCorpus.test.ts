import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  validateGeneratedRecognitionCorpusManifest,
  validateRealWorldRecognitionCorpusManifest
} from "./recognitionFixtureManifest";

const ROOT = resolve(process.cwd(), "test-fixtures/recognition/generated");
const manifest = validateGeneratedRecognitionCorpusManifest(
  JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"))
);

describe("generated recognition image corpus", () => {
  it("pins systematic generated coverage separately from real-world provenance", () => {
    expect(manifest.version).toBe("generated-recognition-corpus.v1");
    expect(manifest.license).toBe("CC0-1.0");
    expect(new Set(manifest.fixtures.map(({ id }) => id)).size).toBe(
      manifest.fixtures.length
    );
    expect(readdirSync(resolve(ROOT, "images")).sort()).toEqual(
      manifest.fixtures.map(({ file }) => file.replace("images/", "")).sort()
    );
    const currencies = new Set(
      manifest.fixtures.map(({ sourceCurrency }) => sourceCurrency)
    );
    for (const code of [
      "AUD",
      "EUR",
      "JPY",
      "TWD",
      "USD",
      "CNY",
      "KRW"
    ] as const) {
      expect(currencies.has(code), code).toBe(true);
    }

    const challenges = new Set(
      manifest.fixtures.flatMap(({ challenges: values }) => values)
    );
    for (const required of [
      "currency-code-marker",
      "period-decimal",
      "comma-decimal",
      "multilingual-label",
      "multiline-layout",
      "item-number-negative-evidence",
      "wrong-currency",
      "multiple-prices"
    ]) {
      expect(challenges.has(required), required).toBe(true);
    }
  });

  it("matches retained hashes, dimensions and declared regions", async () => {
    for (const fixture of manifest.fixtures) {
      expect(fixture.origin).toBe("generated");
      expect(fixture.scripts.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.challenges.length, fixture.id).toBeGreaterThan(0);
      const bytes = readFileSync(resolve(ROOT, fixture.file));
      expect(createHash("sha256").update(bytes).digest("hex"), fixture.id).toBe(
        fixture.asset.sha256
      );
      const metadata = await sharp(bytes).metadata();
      expect(
        { width: metadata.width, height: metadata.height },
        fixture.id
      ).toEqual({ width: fixture.asset.width, height: fixture.asset.height });
      for (const { region } of fixture.expectation.detectedPrices) {
        expect(region.x + region.width, fixture.id).toBeLessThanOrEqual(
          fixture.asset.width
        );
        expect(region.y + region.height, fixture.id).toBeLessThanOrEqual(
          fixture.asset.height
        );
      }
    }
  });

  it("keeps real-world challenge coverage explicit in its separate contract", () => {
    const realWorld = validateRealWorldRecognitionCorpusManifest(
      JSON.parse(
        readFileSync(
          resolve(
            process.cwd(),
            "test-fixtures/recognition/real-world/manifest.json"
          ),
          "utf8"
        )
      )
    );
    const challenges = new Set(
      realWorld.fixtures.flatMap(({ challenges: values }) => values)
    );
    for (const required of [
      "blur",
      "glare",
      "rotation",
      "low-light",
      "multiple-prices",
      "wrong-or-secondary-currency",
      "nearby-non-price-numerals"
    ]) {
      expect(challenges.has(required), required).toBe(true);
    }
  });
});
