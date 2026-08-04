import { expect, test } from "@playwright/test";

import type { RecognitionFixtureContract } from "../src/recognition/recognitionFixtureManifest";

function assertDetectedPrices(
  fixtureId: string,
  actual: readonly {
    currency: string;
    minorUnits: number;
    box: { x: number; y: number; width: number; height: number };
  }[],
  expected: RecognitionFixtureContract["expectation"]["detectedPrices"]
): void {
  const identity = ({ currency, minorUnits }: { currency: string; minorUnits: number }) =>
    `${currency}:${minorUnits.toString()}`;
  expect(actual.map(identity).sort(), fixtureId).toEqual(
    expected.map(identity).sort()
  );
  for (const expectedPrice of expected) {
    const detected = actual.find(
      ({ currency, minorUnits }) =>
        currency === expectedPrice.currency &&
        minorUnits === expectedPrice.minorUnits
    );
    expect(
      detected,
      `${fixtureId}: ${identity(expectedPrice)}`
    ).toBeDefined();
    const center = {
      x: detected!.box.x + detected!.box.width / 2,
      y: detected!.box.y + detected!.box.height / 2
    };
    expect(center.x).toBeGreaterThanOrEqual(expectedPrice.region.x);
    expect(center.x).toBeLessThanOrEqual(
      expectedPrice.region.x + expectedPrice.region.width
    );
    expect(center.y).toBeGreaterThanOrEqual(expectedPrice.region.y);
    expect(center.y).toBeLessThanOrEqual(
      expectedPrice.region.y + expectedPrice.region.height
    );
  }
}

test("checked-in generated and real-world bytes produce declared browser-local Recognition Runtime outcomes", async ({
  page
}, testInfo) => {
  test.setTimeout(180_000);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173") {
      externalRequests.push(request.url());
    }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) =>
    route.abort("blockedbyclient")
  );
  await page.goto("/e2e/recognition-fixtures.html");

  const contracts = await page.evaluate(() => window.recognitionFixtures.list());
  expect(new Set(contracts.map(({ origin }) => origin))).toEqual(
    new Set(["generated", "real-world"])
  );
  const report: Array<{
    fixtureId: string;
    origin: RecognitionFixtureContract["origin"];
    status: RecognitionFixtureContract["expectation"]["status"];
    detectedPrices: Array<{ currency: string; minorUnits: number }>;
  }> = [];

  for (const contract of contracts) {
    const result = await page.evaluate(
      (fixtureId) => window.recognitionFixtures.run(fixtureId),
      contract.id
    );
    expect(result).toMatchObject({
      fixtureId: contract.id,
      origin: contract.origin,
      runtimeId: "taglingo-universal-tesseract.2026-08-04",
      image: {
        width: contract.asset.width,
        height: contract.asset.height
      }
    });

    if (contract.expectation.status === "pass") {
      assertDetectedPrices(
        contract.id,
        result.detectedPrices,
        contract.expectation.detectedPrices
      );
    } else {
      expect(contract.expectation.knownGap?.trim(), contract.id).not.toBe("");
      assertDetectedPrices(
        contract.id,
        result.detectedPrices,
        contract.expectation.observedDetectedPrices!
      );
    }

    report.push({
      fixtureId: contract.id,
      origin: contract.origin,
      status: contract.expectation.status,
      detectedPrices: result.detectedPrices.map(({ currency, minorUnits }) => ({
        currency,
        minorUnits
      }))
    });
  }

  await page.evaluate(() => window.recognitionFixtures.terminate());
  expect(externalRequests).toEqual([]);
  await testInfo.attach("recognition-fixture-report", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json"
  });
});
