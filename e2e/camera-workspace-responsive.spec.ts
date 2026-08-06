import { expect, test, type Page } from "@playwright/test";

type MutableVisualViewport = {
  setViewport(next: { height: number; offsetTop: number; width?: number }): void;
};

async function installDeterministicCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 1920;
          canvas.height = 1080;
          const context = canvas.getContext("2d");
          context?.fillRect(0, 0, canvas.width, canvas.height);
          return canvas.captureStream(5);
        }
      }
    });
  });
}

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

async function expectNoInternalHorizontalOverflow(
  locator: ReturnType<Page["locator"]>
) {
  await expect
    .poll(() =>
      locator.evaluate((element) => element.scrollWidth - element.clientWidth)
    )
    .toBeLessThanOrEqual(0);
}

async function expectCenterOwnedBy(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  owner: ReturnType<Page["locator"]>
) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const owned = await owner.evaluate(
    (element, point) => {
      const topmost = document.elementFromPoint(point.x, point.y);
      return topmost !== null && element.contains(topmost);
    },
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  );
  expect(owned).toBe(true);
}

function overlapArea(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
) {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x)
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y)
  );
  return width * height;
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
  await expectNoInternalHorizontalOverflow(rail);
  const dragHandle = rail.locator("[data-detected-prices-drag-handle]");
  const collapseRail = rail.getByRole("button", {
    name: /collapse detected prices rail/i
  });
  await expect(dragHandle).toBeVisible();
  await expect(collapseRail).toBeVisible();
  await collapseRail.click();
  const showRail = rail.getByRole("button", {
    name: /show detected price controls/i
  });
  await expect(showRail).toHaveAttribute("aria-expanded", "false");
  await showRail.click();
  await expect(
    preview.getByRole("region", { name: /focused price conversion/i })
  ).toContainText("USD 27.80");
  await expect(
    preview.getByRole("button", { name: /current state: .*show recognition details/i })
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

test("mobile keeps every selected Target conversion behind the compact +N detail surface", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/harness.html?workspace=currencies");
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();

  const currencies = page.getByRole("group", {
    name: /source and target currencies/i
  });
  await currencies
    .getByRole("button", { name: /target currencies: 1 selected/i })
    .click();
  await currencies
    .getByRole("searchbox", { name: /search target currencies/i })
    .fill("Taiwan");
  await currencies
    .getByRole("option", { name: /twd.*new taiwan dollar/i })
    .click();
  await currencies.getByRole("button", { name: /done/i }).click();

  const conversion = page.getByRole("region", {
    name: /focused price conversion/i
  });
  const moreConversions = conversion.getByText(
    /\+1 more target currency conversion/i
  );
  await expect(moreConversions).toBeVisible();
  await expect(moreConversions).toHaveAttribute(
    "aria-label",
    "Toggle all 2 Target Currency conversions"
  );
  const moreBox = await moreConversions.boundingBox();
  expect(moreBox).not.toBeNull();
  expect(moreBox!.height).toBeGreaterThanOrEqual(43);
  const [compactConversionBox, compactGuideBox] = await Promise.all([
    conversion.boundingBox(),
    page.getByRole("region", { name: /^capture guide$/i }).boundingBox()
  ]);
  expect(compactConversionBox).not.toBeNull();
  expect(compactGuideBox).not.toBeNull();
  expect(overlapArea(compactConversionBox!, compactGuideBox!)).toBe(0);

  await page
    .getByRole("button", { name: /open manual price entry/i })
    .click();
  await page.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await page
    .getByRole("button", { name: /close manual price entry/i })
    .click();
  const enteredPriceConversion = page.getByRole("region", {
    name: /entered price conversion/i
  });
  const useFocusedPrice = enteredPriceConversion.getByRole("button", {
    name: /use focused price/i
  });
  await expect(useFocusedPrice).toBeVisible();
  const [switchBox, disclosureBox] = await Promise.all([
    useFocusedPrice.boundingBox(),
    enteredPriceConversion
      .getByText(/\+1 more target currency conversion/i)
      .boundingBox()
  ]);
  expect(switchBox).not.toBeNull();
  expect(disclosureBox).not.toBeNull();
  expect(overlapArea(switchBox!, disclosureBox!)).toBe(0);
  await useFocusedPrice.click();
  const focusedPriceConversion = page.getByRole("region", {
    name: /focused price conversion/i
  });
  await expect(
    focusedPriceConversion.getByRole("status", {
      name: /price used for conversion/i
    })
  ).toContainText(/focused price in use/i);
  const focusedMoreConversions = focusedPriceConversion.getByText(
    /\+1 more target currency conversion/i
  );
  await focusedMoreConversions.click();
  await expect(focusedPriceConversion.getByText("TWD 911.24")).toBeVisible();
  await expectInsideViewport(page, focusedPriceConversion);
  await focusedMoreConversions.click();

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(moreConversions).toBeVisible();
  await moreConversions.click();
  await expect(conversion.getByText("TWD 911.24")).toBeVisible();
  await expectInsideViewport(page, conversion);
  await expectNoDocumentOverflow(page);
});

test("compact mobile keeps the camera recovery action visible and touchable", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/e2e/harness.html?workspace=journey");

  await page
    .getByRole("button", { name: /current state: .*show recognition details/i })
    .click();
  const recognitionStatus = page.getByRole("status", {
    name: /recognition status/i
  });
  const resumeCamera = recognitionStatus.getByRole("button", {
    name: /resume camera/i
  });

  await expect(recognitionStatus).toBeVisible();
  await expect(resumeCamera).toBeVisible();
  await expectInsideViewport(page, recognitionStatus);
  const buttonBox = await resumeCamera.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.height).toBeGreaterThanOrEqual(43);
  await resumeCamera.click();
  await page
    .getByRole("button", { name: /close recognition details/i })
    .click();
  await expect(
    page.getByRole("button", {
      name: /current state: price observation stabilized.*show recognition details/i
    })
  ).toContainText("Stable");
  await expectNoDocumentOverflow(page);
});

test("compact status truthfully distinguishes held evidence from camera preparation", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const [workspace, accessibleState, visibleState] of [
    ["responsive-held", /focused price is held/i, "Held"],
    ["responsive-requesting", /preparing rear camera/i, "Preparing"]
  ] as const) {
    await page.goto(`/e2e/harness.html?workspace=${workspace}`);
    const trigger = page.getByRole("button", {
      name: new RegExp(
        `current state: .*${accessibleState.source}.*show recognition details`,
        "i"
      )
    });
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(visibleState);
  }
});

test("390×844 uses the approved Edge-controls composition without covering the Capture Guide", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/harness.html?workspace=responsive");

  const workspace = page.getByRole("main", { name: /camera workspace/i });
  const preview = workspace.getByRole("region", { name: /price camera/i });
  const currencies = preview.getByRole("group", {
    name: /source and target currencies/i
  });
  const rail = preview.getByRole("region", {
    name: /detected prices rail/i
  });
  const recognitionStatus = preview.getByRole("button", {
    name: /current state: .*show recognition details/i
  });
  const conversion = preview.getByRole("region", {
    name: /focused price conversion/i
  });
  const manualEntry = workspace.getByRole("button", {
    name: /open manual price entry/i
  });
  const guide = preview.getByRole("region", { name: /^capture guide$/i });
  const focusTarget = preview.locator("[data-focus-target]");

  const [
    previewBox,
    currenciesBox,
    railBox,
    recognitionBox,
    conversionBox,
    manualBox,
    guideBox,
    targetBox
  ] = await Promise.all([
    preview.boundingBox(),
    currencies.boundingBox(),
    rail.boundingBox(),
    recognitionStatus.boundingBox(),
    conversion.boundingBox(),
    manualEntry.boundingBox(),
    guide.boundingBox(),
    focusTarget.boundingBox()
  ]);

  for (const box of [
    previewBox,
    currenciesBox,
    railBox,
    recognitionBox,
    conversionBox,
    manualBox,
    guideBox,
    targetBox
  ]) {
    expect(box).not.toBeNull();
  }

  expect(currenciesBox!.height).toBeLessThanOrEqual(76);
  expect(railBox!.x).toBeLessThanOrEqual(20);
  expect(railBox!.width).toBeLessThanOrEqual(96);
  expect(railBox!.height).toBeGreaterThan(railBox!.width * 1.5);
  await expectNoInternalHorizontalOverflow(rail);
  expect(recognitionBox!.width).toBeLessThanOrEqual(190);
  expect(recognitionBox!.height).toBeLessThanOrEqual(72);
  expect(manualBox!.height).toBeGreaterThanOrEqual(44);
  expect(manualBox!.height).toBeLessThanOrEqual(64);
  expect(conversionBox!.y + conversionBox!.height).toBeLessThanOrEqual(
    manualBox!.y
  );

  const guideArea = guideBox!.width * guideBox!.height;
  expect(overlapArea(guideBox!, railBox!)).toBeLessThanOrEqual(
    guideArea * 0.15
  );
  for (const overlay of [
    currenciesBox!,
    railBox!,
    recognitionBox!,
    conversionBox!,
    manualBox!
  ]) {
    const centerX = guideBox!.x + guideBox!.width / 2;
    const centerY = guideBox!.y + guideBox!.height / 2;
    expect(
      centerX >= overlay.x &&
        centerX <= overlay.x + overlay.width &&
        centerY >= overlay.y &&
        centerY <= overlay.y + overlay.height
    ).toBe(false);
  }

  expect(targetBox!.x + targetBox!.width / 2).toBeCloseTo(
    guideBox!.x + guideBox!.width / 2,
    0
  );
  expect(targetBox!.y + targetBox!.height / 2).toBeCloseTo(
    guideBox!.y + guideBox!.height / 2,
    0
  );
  await expect(
    guide.getByText(/capture guide · recognition region/i)
  ).toBeHidden();
  await expect(
    guide.getByText(/explicit selection stays focused/i)
  ).toBeHidden();
  expect(previewBox!.height).toBeGreaterThanOrEqual(844 * 0.75);
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
    preview.getByRole("button", {
      name: /current state: .*show recognition details/i
    }),
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
    const recognitionStatus = page.getByRole("button", {
      name: /current state: .*show recognition details/i
    });
    const conversion = page.getByRole("region", {
      name: /focused price conversion/i
    });
    await expectInsideViewport(page, recognitionStatus);
    await expectInsideViewport(page, conversion);
    const [statusBox, conversionBox] = await Promise.all([
      recognitionStatus.boundingBox(),
      conversion.boundingBox()
    ]);
    expect(statusBox).not.toBeNull();
    expect(conversionBox).not.toBeNull();
    expect(overlapArea(statusBox!, conversionBox!)).toBe(0);
    if (size.width > size.height) {
      const closeCamera = page.getByRole("button", { name: /close camera/i });
      const closeBox = await closeCamera.boundingBox();
      expect(closeBox).not.toBeNull();
      expect(overlapArea(statusBox!, closeBox!)).toBe(0);
      await expectCenterOwnedBy(page, recognitionStatus, recognitionStatus);
    }
    const guide = page.getByRole("region", { name: /^capture guide$/i });
    if (await guide.isVisible()) {
      const guideBox = await guide.boundingBox();
      expect(guideBox).not.toBeNull();
      expect(overlapArea(statusBox!, guideBox!)).toBe(0);
      expect(overlapArea(conversionBox!, guideBox!)).toBe(0);
    }
    const rail = page.getByRole("region", { name: /detected prices rail/i });
    await expect(
      rail.getByRole("button", { name: /collapse detected prices rail/i })
    ).toBeVisible();
    await expect(
      rail.locator("[data-detected-prices-drag-handle]")
    ).toBeVisible();
    await expectCenterOwnedBy(
      page,
      rail.getByText("2 Detected Prices", { exact: true }),
      rail
    );
    await expectCenterOwnedBy(page, rail.getByText(/focused.*jpy.*4,142/i), rail);
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
  await page
    .getByRole("button", { name: /open manual price entry/i })
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
  const [currencyBounds, conversionBounds, manualBounds] = await Promise.all([
    currencies.boundingBox(),
    page
      .getByRole("region", { name: /entered price conversion/i })
      .boundingBox(),
    page
      .getByRole("group", { name: /manual price entry sheet/i })
      .boundingBox()
  ]);
  const unobscuredTop = currencyBounds!.y + currencyBounds!.height;
  const unobscuredBottom = Math.min(conversionBounds!.y, manualBounds!.y);
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
    page.getByRole("button", {
      name: /current state: recorded observation stabilized.*show recognition details/i
    })
  ).toBeVisible();
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
  const recognitionToggle = page.getByRole("button", {
    name: /current state: .*show recognition details/i
  });
  await expect(recognitionToggle).toBeVisible();
  const conversion = page.getByRole("region", {
    name: /focused price conversion/i
  });
  const collapsedManual = page.getByRole("button", {
    name: /open manual price entry/i
  });
  const rail = page.getByRole("region", { name: /detected prices rail/i });
  const [toggleBox, guideBox, focusBox] = await Promise.all([
    recognitionToggle.boundingBox(),
    page.getByRole("region", { name: /^capture guide$/i }).boundingBox(),
    page.locator("[data-focus-target]").boundingBox()
  ]);
  expect(toggleBox).not.toBeNull();
  expect(guideBox).not.toBeNull();
  expect(focusBox).not.toBeNull();
  expect(overlapArea(toggleBox!, guideBox!)).toBe(0);
  expect(overlapArea(toggleBox!, focusBox!)).toBe(0);
  const conversionDimensions = await conversion.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(conversionDimensions.scrollHeight).toBeLessThanOrEqual(
    conversionDimensions.clientHeight + 1
  );
  await recognitionToggle.click();
  const recognitionStatus = page.getByRole("status", {
    name: /recognition status/i
  });
  const recognitionTitle = recognitionStatus.locator("strong").first();
  await expect(recognitionTitle).toHaveText("Recorded observation stabilized");
  await page
    .getByRole("button", { name: /close recognition details/i })
    .click();
  const [conversionBox, manualBox] = await Promise.all([
    conversion.boundingBox(),
    collapsedManual.boundingBox()
  ]);
  expect(conversionBox).not.toBeNull();
  expect(manualBox).not.toBeNull();
  expect(overlapArea(conversionBox!, manualBox!)).toBe(0);
  await expectNoInternalHorizontalOverflow(rail);
  await expect(rail).toContainText(/2 detected prices/i);
  await expect(rail).toContainText(/focused.*jpy.*4,142/i);
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
  expect(sheetOverflow.scrollHeight).toBeGreaterThanOrEqual(
    sheetOverflow.clientHeight
  );
  expect(sheetOverflow.overflowY).toBe("auto");
  await expect(
    page.getByRole("button", { name: /convert entered price/i })
  ).toHaveCount(0);
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

test("recognition failure stays compact and keeps Manual Price Entry opt-in", async ({
  page
}) => {
  await installDeterministicCamera(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/harness.html?preparation=failed");
  await page.getByRole("button", { name: /open camera/i }).click();

  const manualToggle = page.getByRole("button", {
    name: /open manual price entry/i
  });
  await expect(manualToggle).toBeVisible();
  await expect(manualToggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", {
      name: /current state: recognition could not start.*show recognition details/i
    })
  ).toBeVisible();
  await expect(
    page.getByRole("alert", { name: /compact status update/i })
  ).toContainText(/recognition could not start/i);
  await expect(
    page.getByRole("region", { name: /detected prices rail/i })
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: /focused price conversion/i })
  ).toHaveCount(0);

  await manualToggle.click();
  await expect(page.getByRole("textbox", { name: /jpy amount/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /convert entered price/i })
  ).toHaveCount(0);
});

test("currency search owns the keyboard-reduced viewport above Manual Price Entry", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMutableVisualViewport(page);
  await page.goto("/e2e/harness.html?workspace=responsive");
  await setVisualViewport(page, { height: 430, offsetTop: 0, width: 390 });

  await page
    .getByRole("button", { name: /target currencies:/i })
    .click();
  const search = page.getByRole("searchbox", {
    name: /search target currencies/i
  });
  await expect(search).toBeVisible();
  await expectCenterOwnedBy(page, search, search);
  await expect(
    page.getByRole("button", { name: /open manual price entry/i })
  ).toHaveAttribute("aria-expanded", "false");
});

test("mobile detail surfaces arbitrate one expanded workspace at a time", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e2e/harness.html?workspace=responsive");

  const manualOpen = page.getByRole("button", {
    name: /open manual price entry/i
  });
  await manualOpen.click();
  const recognition = page.getByRole("button", {
    name: /current state: .*show recognition details/i
  });
  await recognition.click();
  await expect(manualOpen).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: /close recognition details/i })
  ).toHaveAttribute("aria-expanded", "true");

  await manualOpen.click();
  await expect(recognition).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /target currencies:/i }).click();
  await expect(manualOpen).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("searchbox", { name: /search target currencies/i })
  ).toBeVisible();

  await page.getByRole("button", { name: /done/i }).click();
  await recognition.click();
  await manualOpen.click();
  await expect(recognition).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("textbox", { name: /jpy amount/i })
  ).toBeVisible();
});
