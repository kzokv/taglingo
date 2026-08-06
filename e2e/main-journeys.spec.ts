import { expect, test, type Page } from "@playwright/test";

async function installDeniedCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Deterministic denial", "NotAllowedError");
        }
      }
    });
  });
}

async function installDeterministicCamera(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const context = canvas.getContext("2d");
    context?.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(5);
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => stream }
    });
  });
}

function observeRequestsAfterStart(page: Page) {
  const requests: string[] = [];
  let observing = false;
  page.on("request", (request) => {
    if (observing) {
      requests.push(
        `${request.method()} ${request.url()} ${request.postData() ?? ""}`
      );
    }
  });
  return {
    requests,
    start: () => {
      observing = true;
    }
  };
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("deterministic harness injects Camera Workspace state without recognition internals", async ({
  page
}) => {
  const recognitionAssetRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/ocr/")) {
      recognitionAssetRequests.push(request.url());
    }
  });

  await page.goto("/e2e/harness.html?workspace=focused");

  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");
  await expect(page.getByText("USD 27.80")).toBeVisible();

  await page
    .getByRole("button", { name: /price 2 of 2, jpy 980/i })
    .click();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 980");
  await expect(page.getByText("USD 6.58")).toBeVisible();

  const composer = page.getByRole("region", { name: /manual price entry/i });
  await composer.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await composer.getByRole("textbox", { name: /jpy amount/i }).press("Enter");
  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("Entered Price in use");
  await expect(page.getByText("USD 33.56")).toBeVisible();
  expect(recognitionAssetRequests).toEqual([]);
});

test("Camera Workspace keeps primary controls on the dominant preview surface", async ({
  page
}) => {
  await page.goto("/e2e/harness.html?workspace=journey");

  const workspace = page.getByRole("main", { name: /camera workspace/i });
  const preview = workspace.getByRole("region", { name: /price camera/i });
  const currencies = preview.getByRole("group", {
    name: /source and target currencies/i
  });
  const sourceCurrency = currencies.getByRole("button", {
    name: /source currency: jpy/i
  });
  const targetCurrency = currencies.getByRole("button", {
    name: /target currencies/i
  });

  await expect(preview).toBeVisible();
  await expect(sourceCurrency).toBeVisible();
  await expect(targetCurrency).toBeVisible();
  await expect(
    preview.getByText(/capture guide · recognition region/i)
  ).toBeVisible();

  const previewBounds = await preview.boundingBox();
  const sourceBounds = await sourceCurrency.boundingBox();
  expect(previewBounds).not.toBeNull();
  expect(sourceBounds).not.toBeNull();
  expect(sourceBounds!.y).toBeLessThan(
    previewBounds!.y + previewBounds!.height / 3
  );

  await expect(
    preview.getByRole("status", { name: /recognition status/i })
  ).toContainText("Camera paused");
  await preview.getByRole("button", { name: /resume camera/i }).click();

  await expect(
    preview.getByRole("status", { name: /recognition status/i })
  ).toContainText("Camera ready");
  await expect(
    preview.getByRole("region", { name: /recognition summary/i })
  ).toContainText("Focused Price · JPY 4,142");
  await expect(
    preview.getByRole("list", { name: /detected prices/i })
  ).toBeVisible();
  await expect(
    preview.getByRole("region", { name: /focused price conversion/i })
  ).toContainText("USD 27.80");
  await preview
    .getByRole("button", { name: /price 2 of 2, jpy 980/i })
    .click();
  await expect(
    preview.getByRole("region", { name: /focused price conversion/i })
  ).toContainText("USD 6.58");

  const manualEntry = workspace.getByRole("region", {
    name: /manual price entry/i
  });
  await expect(
    manualEntry.getByRole("textbox", { name: /jpy amount/i })
  ).toBeVisible();

  await workspace.getByRole("button", { name: /close camera/i }).click();
  await expect(
    page.getByRole("heading", { name: /camera workspace left/i })
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Camera stopped");
});

test("Camera Workspace supports matched currency search, multi-selection, swap, and truthful rates", async ({
  page
}) => {
  await page.goto("/e2e/harness.html?workspace=currencies");
  const workspace = page.getByRole("main", { name: /camera workspace/i });
  const preview = workspace.getByRole("region", { name: /price camera/i });
  const currencies = preview.getByRole("group", {
    name: /source and target currencies/i
  });

  await currencies
    .getByRole("button", { name: /target currencies: 1 selected/i })
    .click();
  const targetSearch = currencies.getByRole("searchbox", {
    name: /search target currencies/i
  });
  await targetSearch.fill("Taiwan");
  await currencies
    .getByRole("option", { name: /twd.*new taiwan dollar/i })
    .click();
  await expect(
    currencies.getByRole("button", { name: /target currencies: 2 selected/i })
  ).toContainText("USD · TWD");

  await currencies
    .getByRole("option", { name: /twd.*new taiwan dollar/i })
    .click();
  await expect(
    currencies.getByRole("button", { name: /target currencies: 1 selected/i })
  ).toContainText("USD");
  await currencies
    .getByRole("option", { name: /twd.*new taiwan dollar/i })
    .click();

  await targetSearch.fill("Japanese Yen");
  await expect(currencies.getByRole("option", { name: /jpy/i })).toHaveCount(0);
  await expect(currencies.getByText("No matching currency")).toBeVisible();
  await currencies.getByRole("button", { name: /done/i }).click();

  const conversions = preview.getByRole("region", {
    name: /focused price conversion/i
  });
  await expect(conversions.getByText("USD 27.80")).toBeVisible();
  await conversions
    .getByText(/all 2 target currency conversions/i)
    .click();
  await expect(conversions.getByText("TWD 911.24")).toBeVisible();

  await currencies
    .getByRole("button", { name: /source currency: jpy/i })
    .click();
  const sourceSearch = currencies.getByRole("searchbox", {
    name: /search source currencies/i
  });
  await sourceSearch.fill("Swiss");
  await currencies
    .getByRole("option", { name: /chf.*swiss franc/i })
    .click();
  await expect(
    currencies.getByRole("button", { name: /source currency: chf/i })
  ).toBeVisible();

  await currencies
    .getByRole("button", { name: /source currency: chf/i })
    .click();
  await currencies
    .getByRole("searchbox", { name: /search source currencies/i })
    .fill("Japanese Yen");
  await currencies
    .getByRole("option", { name: /jpy.*japanese yen/i })
    .click();

  await currencies
    .getByRole("button", {
      name: /swap source jpy with primary target usd/i
    })
    .click();
  await expect(
    currencies.getByRole("button", { name: /source currency: usd/i })
  ).toBeVisible();
  await expect(
    currencies.getByRole("button", { name: /target currencies: 2 selected/i })
  ).toContainText("JPY · TWD");
  await expect(
    conversions.getByText("Loading Reference Rate…").first()
  ).toBeVisible();
  await expect(conversions.getByRole("alert")).toContainText(
    "Conversion unavailable"
  );
  await expect(
    preview.getByRole("region", { name: /recognition summary/i })
  ).toContainText("Focused Price · USD");
});

test("Camera Workspace shows the truthful Candidate, Detected, Held, reacquired, and removed journey", async ({
  page
}) => {
  await page.goto("/e2e/harness.html?workspace=lifecycle");
  const controls = page.getByRole("complementary", {
    name: /evidence fixture controls/i
  });
  const summary = page
    .getByRole("region", { name: /recognition summary/i })
    .locator("strong");

  await controls.getByRole("button", { name: /observe credible evidence/i }).click();
  const candidate = page.locator("[data-candidate-outline]");
  await expect(candidate).toHaveCount(1);
  await expect(candidate).toContainText("Possible price");
  await expect(candidate).toHaveAttribute("aria-hidden", "true");
  expect(await candidate.evaluate((element) => element.tagName)).toBe("DIV");
  expect(
    await candidate.evaluate((element) => getComputedStyle(element).borderStyle)
  ).toBe("dotted");
  await expect(page.locator("[data-detected-price]")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /detected prices — none available/i })
  ).toBeVisible();
  await expect(page.getByRole("list", { name: /detected prices/i })).toHaveCount(0);
  await expect(summary).toHaveText("No Focused Price yet");
  await expect(page.getByText("USD 27.80")).toHaveCount(0);

  await controls.getByRole("button", { name: /corroborate or reacquire/i }).click();
  await expect(candidate).toHaveCount(0);
  const detection = page.locator('[data-detected-price="JPY-4142"]');
  await expect(detection).toHaveAttribute("data-evidence-state", "fresh");
  const identity = await detection.getAttribute("data-detected-price-identity");
  const freshGeometry = await detection.getAttribute("style");
  await expect(
    page.getByRole("list", { name: /detected prices/i }).getByRole("button")
  ).toHaveCount(1);
  await expect(summary).toHaveText("Focused Price · JPY 4,142");
  await expect(page.getByText("USD 27.80")).toBeVisible();

  await controls.getByRole("button", { name: /covered miss/i }).click();
  await expect(detection).toHaveAttribute("data-evidence-state", "held");
  await expect(detection).toHaveClass(/held-detection/);
  await expect(detection).toContainText("Held");
  await expect(detection).toHaveAttribute("style", freshGeometry ?? "");

  await controls.getByRole("button", { name: /corroborate or reacquire/i }).click();
  await expect(detection).toHaveAttribute("data-evidence-state", "fresh");
  await expect(detection).toHaveAttribute(
    "data-detected-price-identity",
    identity ?? ""
  );

  await controls.getByRole("button", { name: /covered miss/i }).click();
  await controls.getByRole("button", { name: /covered miss/i }).click();
  await expect(detection).toHaveCount(1);
  await controls.getByRole("button", { name: /covered miss/i }).click();
  await expect(detection).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /detected prices — none available/i })
  ).toBeVisible();
  await expect(summary).toHaveText("No Focused Price yet");
  await expect(page.getByText("USD 27.80")).toHaveCount(0);
});

test("Guest camera policy keeps five currencies available and promotes all others to manual", async ({
  page
}) => {
  await page.goto("/e2e/harness.html");
  const sourceCurrency = page.getByRole("combobox", {
    name: /source currency/i
  });

  for (const currency of ["USD", "AUD", "JPY", "TWD", "EUR"]) {
    await sourceCurrency.selectOption(currency);
    await expect(page.getByRole("button", { name: /open camera/i })).toBeEnabled();
  }

  await sourceCurrency.selectOption("CAD");
  await expect(
    page.getByRole("heading", { name: /manual price entry/i })
  ).toBeVisible();
  await expect(page.getByText(/CAD remains available through unlimited/i)).toBeVisible();
});

test("Guest camera exhaustion shows its rolling refresh while manual stays unlimited", async ({
  page
}) => {
  await page.addInitScript(() => {
    const nowMs = Date.now();
    window.localStorage.setItem(
      "taglingo.guest-camera-allowance.v1",
      JSON.stringify({
        version: 1,
        successfulUsageTimestamps: Array.from(
          { length: 10 },
          (_, index) => nowMs - index * 1_000
        )
      })
    );
  });
  await page.goto("/e2e/harness.html");

  await expect(
    page.getByRole("button", { name: /open camera · allowance used/i })
  ).toBeDisabled();
  await expect(
    page.getByRole("complementary", { name: /guest camera allowance/i })
  ).toContainText("Camera refreshes at");
  const manual = page.getByRole("button", {
    name: /enter price manually · unlimited/i
  });
  await expect(manual).toBeEnabled();
  await manual.click();
  await expect(
    page.getByRole("heading", { name: /manual price entry/i })
  ).toBeVisible();
});

test("Guest converts an Entered Price for a manual-only Source Currency", async ({
  page
}) => {
  const recognitionAssetRequests: string[] = [];
  const enteredPriceTraffic = observeRequestsAfterStart(page);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/ocr/")) {
      recognitionAssetRequests.push(request.url());
    }
  });
  await page.goto("/e2e/harness.html");

  await page
    .getByRole("combobox", { name: /source currency/i })
    .selectOption("BRL");

  await expect(
    page.getByRole("heading", { name: /manual price entry/i })
  ).toBeVisible();
  await expect(
    page.getByText(/camera recognition is unavailable for this access mode/i)
  ).toBeVisible();
  enteredPriceTraffic.start();
  await page.getByRole("textbox", { name: /brl amount/i }).fill("R$ 12,34");
  await page
    .getByRole("button", { name: /convert entered price/i })
    .click();

  const enteredPrice = page.getByRole("region", { name: /entered price/i });
  await expect(enteredPrice).toContainText("BRL 12,34");
  await expect(enteredPrice).toContainText("not camera-derived");
  await expect(page.getByText("USD 0.08")).toBeVisible();
  expect(recognitionAssetRequests).toEqual([]);
  expect(enteredPriceTraffic.requests).toEqual([]);
  expect(
    await page.evaluate(() => JSON.stringify(window.localStorage))
  ).not.toContain("12,34");
});

test("Guest explicitly switches the camera-sheet price used for conversion", async ({
  page
}) => {
  const enteredPriceTraffic = observeRequestsAfterStart(page);
  await page.goto("/e2e/harness.html");
  await page.getByRole("button", { name: /try without camera/i }).click();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");

  const composer = page.getByRole("region", { name: /manual price entry/i });
  await composer
    .getByRole("button", { name: /open manual price entry/i })
    .click();
  enteredPriceTraffic.start();
  await composer.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await composer.getByRole("textbox", { name: /jpy amount/i }).press("Enter");

  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("Entered Price in use");
  await expect(page.getByText("USD 33.56")).toBeVisible();
  await page
    .getByRole("button", { name: /use focused price · jpy 4,142/i })
    .press("Enter");
  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("Focused Price in use");
  await expect(page.getByText("USD 27.80")).toBeVisible();
  expect(enteredPriceTraffic.requests).toEqual([]);
});

test("Guest recovers from deterministic camera denial with Manual Price Entry", async ({
  page
}) => {
  await installDeniedCamera(page);
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) {
      apiRequests.push(request.url());
    }
  });
  await page.goto("/e2e/harness.html");

  await expect(
    page.getByText(/one shared, browser-local runtime/i)
  ).toBeVisible();
  const targetTrigger = page.getByRole("button", {
    name: /target currencies: 1 selected · usd/i
  });
  await targetTrigger.click();
  await page.keyboard.press("Escape");
  await expect(targetTrigger).toBeFocused();

  await page.getByRole("button", { name: /open camera/i }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera access was denied"
  );
  await expect(
    page.getByRole("button", { name: /use no-camera demo/i })
  ).toHaveCount(0);
  const composer = page.getByRole("region", { name: /manual price entry/i });
  await expect(
    composer.getByRole("textbox", { name: /jpy amount/i })
  ).toBeVisible();
  await composer.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await composer.getByRole("textbox", { name: /jpy amount/i }).press("Enter");

  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("Entered Price in use");
  await expect(page.getByText("USD 33.56")).toBeVisible();
  await expect(page.locator("[data-detected-price]")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("No Detected Price yet");
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("taglingo.guest-camera-allowance.v1")
    )
  ).toBeNull();
  expect(apiRequests).toEqual([]);
});

test("Guest completes recognition with deterministic media and OCR", async ({
  page
}) => {
  await installDeterministicCamera(page);
  await page.goto("/e2e/harness.html");

  await page.getByRole("button", { name: /open camera/i }).click();
  await expect(page.getByText("Camera ready")).toBeVisible();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");
  await expect(page.locator('[data-detected-price="JPY-4142"]')).toHaveClass(
    /focused-detection/
  );
  await expect(page.getByText("USD 27.80")).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("taglingo.guest-camera-allowance.v1") ??
          "null"
      )?.successfulUsageTimestamps.length
    )
  ).toBe(1);

  const detectedPriceList = page.getByRole("list", {
    name: /detected prices/i
  });
  await expect(detectedPriceList.getByRole("button")).toHaveCount(2, {
    timeout: 12_000
  });
  await detectedPriceList
    .getByRole("button", { name: /price 2 of 2, jpy 980/i })
    .click();
  await expect(page.locator('[data-detected-price="JPY-980"]')).toHaveClass(
    /focused-detection/
  );
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 980");
  await expect(page.getByText("USD 6.58")).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("taglingo.guest-camera-allowance.v1") ??
          "null"
      )?.successfulUsageTimestamps.length
    )
  ).toBe(1);

  await page
    .getByRole("button", { name: /resume automatic focus/i })
    .click();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");
  await expect(
    page.getByRole("button", { name: /resume automatic focus/i })
  ).toHaveCount(0);
});

test("anonymous recognition health stays silent until a future opted-in camera session", async ({
  page,
  context
}) => {
  await installDeterministicCamera(page);
  await context.addCookies([
    {
      name: "account-session",
      value: "must-not-be-sent",
      domain: "127.0.0.1",
      path: "/"
    }
  ]);
  const healthRequests: Array<{
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  await page.route("**/api/recognition-health", async (route) => {
    const request = route.request();
    healthRequests.push({
      body: JSON.parse(request.postData() ?? "null") as Record<string, unknown>,
      headers: request.headers()
    });
    await route.fulfill({ status: 204 });
  });

  await page.goto("/e2e/harness.html");
  await page.getByRole("button", { name: /open camera/i }).click();
  await expect(page.getByText("Camera ready")).toBeVisible();
  await page.getByRole("button", { name: /close camera/i }).click();

  await expect(
    page.getByRole("region", {
      name: /anonymous recognition health invitation/i
    })
  ).toBeVisible();
  expect(healthRequests).toEqual([]);
  await page
    .getByRole("button", { name: /share future summaries/i })
    .click();

  await page.getByRole("button", { name: /open camera/i }).click();
  await expect(page.getByText("Camera ready")).toBeVisible();
  await page.getByRole("button", { name: /close camera/i }).click();
  await expect.poll(() => healthRequests.length).toBe(1);

  const [{ body, headers }] = healthRequests;
  expect(Object.keys(body).sort()).toEqual(
    [
      "schemaVersion",
      "release",
      "platform",
      "sourceCurrency",
      "timeToReady",
      "timeToFirstDetectedPrice",
      "timeToFirstFocusedPrice",
      "recognitionPassCount",
      "missCount",
      "focusChangeCount",
      "stableDetectionCount",
      "terminalOutcome",
      "errorFamily"
    ].sort()
  );
  expect(body).toMatchObject({
    schemaVersion: 1,
    release: "0.1.0",
    platform: "other",
    sourceCurrency: "JPY"
  });
  expect(headers.cookie).toBeUndefined();
  expect(headers.authorization).toBeUndefined();
  expect(headers.referer).toBeUndefined();
  expect(JSON.stringify(body)).not.toMatch(
    /target|member|priceAmount|coordinate|locale|message|stack|identifier/i
  );
});

test("Approved Member completes a deterministic three-currency journey", async ({
  page
}) => {
  await installDeterministicCamera(page);
  await page.goto("/e2e/harness.html?mode=member");

  await expect(page.getByText("Approved Member mode")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /target currencies: 3 selected · usd · twd · eur/i
    })
  ).toBeVisible();
  await page.getByRole("button", { name: /open camera/i }).click();

  await expect(page.getByText("Camera ready")).toBeVisible();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");
  const conversions = page.getByRole("region", {
    name: /approved member conversions/i
  });
  await expect(conversions.getByText("USD 27.80")).toBeVisible();
  await expect(conversions.getByText("TWD 911.24")).toBeHidden();
  await conversions
    .getByText(/all 3 target currency conversions/i)
    .click();
  await expect(conversions.getByText("TWD 911.24")).toBeVisible();
  await expect(conversions.getByText("EUR 24.02")).toBeVisible();
  await expect(conversions).toContainText(
    "Reference estimate; your payment rate may differ."
  );
});

test("Approved Member keeps all-currency camera access and confirms a Focused Price when synchronized", async ({
  page
}) => {
  await page.addInitScript(() => {
    const nowMs = Date.now();
    window.localStorage.setItem(
      "taglingo.guest-camera-allowance.v1",
      JSON.stringify({
        version: 1,
        successfulUsageTimestamps: Array.from(
          { length: 10 },
          (_, index) => nowMs - index * 1_000
        )
      })
    );
  });
  await page.goto("/e2e/harness.html?mode=member");

  await expect(page.getByText("Approved Member mode")).toBeVisible();
  const sourceCurrency = page.getByRole("combobox", {
    name: /source currency/i
  });
  await sourceCurrency.selectOption("CAD");
  await expect(page.getByRole("button", { name: /open camera/i })).toBeEnabled();
  await expect(
    page.getByRole("complementary", { name: /guest camera allowance/i })
  ).toHaveCount(0);

  await sourceCurrency.selectOption("JPY");
  const settings = page.getByRole("region", {
    name: /recognition experience settings/i
  });
  await settings
    .getByRole("combobox", { name: /when a focused price appears/i })
    .selectOption("confirm");
  await page.getByRole("button", { name: /try without camera/i }).click();

  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("waiting for confirmation");
  await expect(page.getByText("USD 27.80")).toHaveCount(0);
  await page
    .getByRole("button", { name: /confirm focused price · jpy 4,142/i })
    .click();
  await expect(page.getByText("USD 27.80")).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(
        window.localStorage.getItem("taglingo.guest-camera-allowance.v1") ??
          "null"
      )?.successfulUsageTimestamps.length
    )
  ).toBe(10);
});
