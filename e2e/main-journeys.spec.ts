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
  await expect(page.getByText("USD 27.80")).toBeVisible();
  await expect(page.getByText("TWD 911.24")).toBeVisible();
  await expect(page.getByText("EUR 24.02")).toBeVisible();
  await expect(
    page.getByRole("region", { name: /approved member conversions/i })
  ).toContainText("Reference estimate; your payment rate may differ.");
});
