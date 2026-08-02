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

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("Guest converts an Entered Price for a manual-only Source Currency", async ({
  page
}) => {
  const recognitionAssetRequests: string[] = [];
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
    page.getByText(/camera recognition is unavailable on this device/i)
  ).toBeVisible();
  await page.getByRole("textbox", { name: /brl amount/i }).fill("12.34");
  await page
    .getByRole("button", { name: /convert entered price/i })
    .click();

  const enteredPrice = page.getByRole("region", { name: /entered price/i });
  await expect(enteredPrice).toContainText("BRL 12.34");
  await expect(enteredPrice).toContainText("not camera-derived");
  await expect(page.getByText("USD 0.08")).toBeVisible();
  expect(recognitionAssetRequests).toEqual([]);
});

test("Guest recovers from deterministic camera denial and completes the demo", async ({
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
    page.getByText(/physical-device qualification applies to this camera path/i)
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
  await page.getByRole("button", { name: /close camera/i }).click();
  await page.getByRole("button", { name: /try without camera/i }).click();

  const recognitionSummary = page.getByRole("region", {
    name: /recognition summary/i
  });
  await expect(recognitionSummary.locator("strong")).toHaveText(
    "Focused Price · JPY 4,142"
  );
  await expect(page.getByText("USD 27.80")).toBeVisible();
  await page.getByText("View 1 Detected Price").click();
  await expect(recognitionSummary.getByRole("listitem")).toHaveText(
    "Focused detection · JPY 4,142"
  );
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
