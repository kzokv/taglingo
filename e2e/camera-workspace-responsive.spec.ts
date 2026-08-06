import { expect, test, type Page } from "@playwright/test";

type MutableVisualViewport = {
  setViewport(next: { height: number; offsetTop: number; width?: number }): void;
};

async function installMutableVisualViewport(page: Page) {
  await page.addInitScript(() => {
    const events = new EventTarget();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
      setViewport(next: {
        height: number;
        offsetTop: number;
        width?: number;
      }) {
        this.height = next.height;
        this.offsetTop = next.offsetTop;
        this.width = next.width ?? window.innerWidth;
        events.dispatchEvent(new Event("resize"));
        events.dispatchEvent(new Event("scroll"));
      }
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport
    });
  });
}

async function setVisualViewport(
  page: Page,
  next: { height: number; offsetTop: number; width?: number }
) {
  await page.evaluate((value) => {
    (
      window.visualViewport as unknown as MutableVisualViewport
    ).setViewport(value);
  }, next);
}

async function expectNoDocumentOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        horizontal:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        vertical:
          document.documentElement.scrollHeight - window.innerHeight
      }))
    )
    .toEqual({ horizontal: 0, vertical: 0 });
}

async function expectInsideViewport(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test("320×568 resting workspace exposes every primary edge control without document scrolling", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/e2e/harness.html?workspace=responsive");

  const workspace = page.getByRole("main", { name: /camera workspace/i });
  const preview = workspace.getByRole("region", { name: /price camera/i });
  const currencies = preview.getByRole("group", {
    name: /source and target currencies/i
  });
  const rail = preview.getByRole("region", { name: /detected prices rail/i });

  await expectNoDocumentOverflow(page);
  await expect(preview).toBeVisible();
  await expect(preview.locator("[data-focus-target]")).toBeVisible();
  await expect(currencies.getByRole("button", { name: /source currency/i })).toBeVisible();
  await expect(currencies.getByRole("button", { name: /swap source/i })).toBeVisible();
  await expect(currencies.getByRole("button", { name: /target currencies/i })).toBeVisible();
  await expect(rail).toContainText(/2 detected prices/i);
  await expect(rail).toContainText(/focused.*jpy.*4,142/i);
  await expect(
    preview.getByRole("region", { name: /focused price conversion/i })
  ).toContainText("USD 27.80");
  await expect(
    preview.getByRole("status", { name: /recognition status/i })
  ).toBeVisible();
  await expect(
    workspace.getByRole("button", { name: /open manual price entry/i })
  ).toBeVisible();
  await expect(
    workspace.getByRole("button", { name: /close camera/i })
  ).toBeVisible();

  for (const control of [
    currencies.getByRole("button", { name: /source currency/i }),
    currencies.getByRole("button", { name: /swap source/i }),
    currencies.getByRole("button", { name: /target currencies/i }),
    rail.getByRole("button", { name: /expand detected prices/i }),
    workspace.getByRole("button", { name: /open manual price entry/i }),
    workspace.getByRole("button", { name: /close camera/i })
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(43);
  }

  await workspace.evaluate((element) => {
    element.style.setProperty("--camera-safe-area-top", "24px");
    element.style.setProperty("--camera-safe-area-right", "16px");
    element.style.setProperty("--camera-safe-area-bottom", "20px");
    element.style.setProperty("--camera-safe-area-left", "12px");
  });
  const sourceBox = await currencies
    .getByRole("button", { name: /source currency/i })
    .boundingBox();
  const closeBox = await workspace
    .getByRole("button", { name: /close camera/i })
    .boundingBox();
  const manualBox = await workspace
    .getByRole("button", { name: /open manual price entry/i })
    .boundingBox();
  expect(sourceBox!.x).toBeGreaterThanOrEqual(12);
  expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(304);
  expect(manualBox!.y + manualBox!.height).toBeLessThanOrEqual(548);
  await expectNoDocumentOverflow(page);
});

test("modern portrait remains preview-dominant while compact portrait and landscape expose single-purpose sheets", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/harness.html?workspace=responsive");

  const workspace = page.getByRole("main", { name: /camera workspace/i });
  const preview = page.getByRole("region", { name: /price camera/i });
  const previewBox = await preview.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.height).toBeGreaterThan(844 * 0.75);
  const edgeControls = [
    preview.getByRole("group", { name: /source and target currencies/i }),
    preview.getByRole("region", { name: /detected prices rail/i }),
    preview.getByRole("status", { name: /recognition status/i }),
    preview.getByRole("region", { name: /focused price conversion/i }),
    workspace.getByRole("button", { name: /open manual price entry/i }),
    workspace.getByRole("button", { name: /close camera/i })
  ];
  for (const control of edgeControls) {
    await expect(control).toBeVisible();
    await expectInsideViewport(page, control);
  }
  const currenciesBox = await edgeControls[0].boundingBox();
  const railBox = await edgeControls[1].boundingBox();
  const conversionBox = await edgeControls[3].boundingBox();
  expect(currenciesBox!.y).toBeLessThan(previewBox!.height / 3);
  expect(railBox!.x).toBeLessThan(previewBox!.width / 2);
  expect(conversionBox!.y).toBeGreaterThan(previewBox!.height / 2);
  await expectNoDocumentOverflow(page);

  await page.setViewportSize({ width: 360, height: 700 });
  await expect(
    page.getByRole("button", { name: /privacy settings/i })
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: /source currency: jpy/i })
  ).toContainText("Japanese Yen");
  await expect(
    page.getByRole("list", { name: /detected prices/i })
  ).toBeVisible();
  await expect(page.getByText(/about this estimate/i)).toBeHidden();
  await expect(page.getByText("USD 27.80")).toBeVisible();

  for (const size of [
    { width: 568, height: 320 },
    { width: 280, height: 568 }
  ]) {
    await page.setViewportSize(size);
    await expectNoDocumentOverflow(page);
    const rail = page.getByRole("region", { name: /detected prices rail/i });
    const expandPrices = rail.getByRole("button", {
      name: /expand detected prices/i
    });
    await expect(expandPrices).toBeVisible();
    await expectInsideViewport(page, expandPrices);
    await expandPrices.click();
    const pricesSheet = page.getByRole("dialog", {
      name: /all detected prices/i
    });
    await expect(pricesSheet).toBeVisible();
    await expectInsideViewport(page, pricesSheet);
    await pricesSheet
      .getByRole("button", { name: /close detected prices/i })
      .click();

    const manualTrigger = page.getByRole("button", {
      name: /open manual price entry/i
    });
    await expect(manualTrigger).toBeVisible();
    await expectInsideViewport(page, manualTrigger);
    await manualTrigger.click();
    const amount = page.getByRole("textbox", { name: /jpy amount/i });
    await expect(amount).toBeVisible();
    await amount.scrollIntoViewIfNeeded();
    await expectInsideViewport(page, amount);
    await page
      .getByRole("button", { name: /close manual price entry/i })
      .click();
  }
});

test("visual viewport, browser chrome, and rotation recenter the guide without resetting shopper state", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMutableVisualViewport(page);
  await page.goto("/e2e/harness.html?workspace=currencies");

  const rail = page.getByRole("region", { name: /detected prices rail/i });
  await rail
    .getByRole("button", { name: /price 2 of 2, jpy 980/i })
    .click();
  const currencies = page.getByRole("group", {
    name: /source and target currencies/i
  });
  await currencies.getByRole("button", { name: /source currency: jpy/i }).click();
  await currencies
    .getByRole("searchbox", { name: /search source currencies/i })
    .fill("Australian");
  await currencies
    .getByRole("option", { name: /aud.*australian dollar/i })
    .click();
  const amount = page.getByRole("textbox", { name: /aud amount/i });
  await amount.fill("50");
  await expect(
    page.getByRole("status", { name: /price used for conversion/i })
  ).toContainText("Entered Price in use");
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();

  const guide = page.getByRole("region", { name: /^capture guide$/i });
  const originalGuide = await guide.boundingBox();
  await setVisualViewport(page, { height: 620, offsetTop: 72, width: 390 });
  const reducedGuide = await guide.boundingBox();
  expect(originalGuide).not.toBeNull();
  expect(reducedGuide).not.toBeNull();
  expect(reducedGuide!.y).not.toBe(originalGuide!.y);
  expect(reducedGuide!.y).toBeGreaterThanOrEqual(72);
  expect(reducedGuide!.y + reducedGuide!.height).toBeLessThanOrEqual(692);
  const [currencyBounds, statusBounds, conversionBounds, manualBounds] =
    await Promise.all([
      currencies.boundingBox(),
      page
        .getByRole("status", { name: /recognition status/i })
        .boundingBox(),
      page
        .getByRole("region", { name: /focused price conversion/i })
        .boundingBox(),
      page
        .getByRole("button", { name: /open manual price entry/i })
        .boundingBox()
    ]);
  const unobscuredTop = currencyBounds!.y + currencyBounds!.height;
  const unobscuredBottom = Math.min(
    statusBounds!.y,
    conversionBounds!.y,
    manualBounds!.y
  );
  const guideCenter = reducedGuide!.y + reducedGuide!.height / 2;
  expect(guideCenter).toBeCloseTo(
    (unobscuredTop + unobscuredBottom) / 2,
    0
  );
  await page
    .getByRole("button", { name: /open manual price entry/i })
    .click();
  await expect(guide).toBeHidden();
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();

  await page.setViewportSize({ width: 568, height: 320 });
  await setVisualViewport(page, { height: 320, offsetTop: 0, width: 568 });
  await page.setViewportSize({ width: 390, height: 844 });
  await setVisualViewport(page, { height: 844, offsetTop: 0, width: 390 });

  await expect(
    page.getByRole("status", { name: /recognition status/i })
  ).toContainText(/recorded observation stabilized/i);
  await expect(currencies.getByRole("button", { name: /source currency: aud/i })).toBeVisible();
  await expect(
    currencies.getByRole("button", { name: /target currencies/i })
  ).toContainText("USD");
  await page
    .getByRole("button", { name: /open manual price entry/i })
    .click();
  await expect(amount).toHaveValue("50");
  await expect(
    rail.getByRole("button", { name: /price 2 of 2, aud 9\.80/i })
  ).toHaveAttribute("aria-current", "true");
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();
  await expect(
    page.getByRole("button", { name: /resume automatic focus/i })
  ).toBeVisible();
});

test("200% text and software-keyboard reduction keep the focused manual field reachable without horizontal overflow", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installMutableVisualViewport(page);
  await page.goto("/e2e/harness.html?workspace=responsive");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page
    .getByRole("button", { name: /open manual price entry/i })
    .click();
  const amount = page.getByRole("textbox", { name: /jpy amount/i });
  await amount.focus();
  await setVisualViewport(page, { height: 310, offsetTop: 0, width: 320 });
  await amount.scrollIntoViewIfNeeded();

  await expect(amount).toBeFocused();
  await expectInsideViewport(page, amount);
  await expectNoDocumentOverflow(page);
  await expect(
    page.getByRole("button", { name: /close manual price entry/i })
  ).toBeVisible();
  const sheet = page.getByRole("group", {
    name: /manual price entry sheet/i
  });
  const sheetOverflow = await sheet.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight
  }));
  expect(sheetOverflow.scrollHeight).toBeGreaterThan(sheetOverflow.clientHeight);
  expect(sheetOverflow.overflowY).toBe("auto");
  const convert = page.getByRole("button", {
    name: /convert entered price/i
  });
  await convert.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, convert);
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();
  for (const control of [
    page.getByRole("button", { name: /source currency/i }),
    page.getByRole("button", { name: /target currencies/i }),
    page.getByRole("button", { name: /open manual price entry/i }),
    page.getByRole("button", { name: /close camera/i })
  ]) {
    await expect(control).toBeVisible();
    await expectInsideViewport(page, control);
  }
});
