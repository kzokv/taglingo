import { expect, test, type Page } from "@playwright/test";

import {
  CAMERA_WORKSPACE_RESPONSIVENESS_BUDGETS as BUDGETS
} from "../src/camera/cameraWorkspacePerformance";

// Timing trials share one worker so CPU contention between synthetic cameras
// does not become part of the browser-local responsiveness measurement.
test.describe.configure({ mode: "serial" });

interface DomLatencyObserverOptions {
  action: () => void;
  inspect: () => NonNullable<unknown> | null;
  timeoutMs: number;
  timeoutMessage: string;
}

type PerformanceTestWindow = typeof window & {
  __cameraPermissionGrantedAt?: number;
  __observeDomLatency(
    options: DomLatencyObserverOptions
  ): Promise<{ elapsedMs: number; milestone: NonNullable<unknown> }>;
};

async function installFreshDeterministicCamera(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as PerformanceTestWindow).__observeDomLatency = ({
      action,
      inspect,
      timeoutMs,
      timeoutMessage
    }: DomLatencyObserverOptions) =>
      new Promise((resolve, reject) => {
        const actionStartedAt = performance.now();
        let settled = false;
        let observer: MutationObserver | null = null;
        const cleanup = () => {
          settled = true;
          observer?.disconnect();
          window.clearTimeout(timeout);
        };
        const inspectForMilestone = () => {
          if (settled) return;
          const milestone = inspect();
          if (milestone !== null) {
            cleanup();
            resolve({
              elapsedMs: performance.now() - actionStartedAt,
              milestone
            });
          }
        };
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error(timeoutMessage));
        }, timeoutMs);
        observer = new MutationObserver(inspectForMilestone);
        observer.observe(document.body, { childList: true, subtree: true });
        try {
          action();
          inspectForMilestone();
        } catch (error) {
          cleanup();
          reject(error);
        }
      });

    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 1920;
          canvas.height = 1080;
          canvas.getContext("2d")?.fillRect(0, 0, canvas.width, canvas.height);
          const stream = canvas.captureStream(5);
          (window as typeof window & { __cameraPermissionGrantedAt?: number })
            .__cameraPermissionGrantedAt = performance.now();
          return stream;
        }
      }
    });
  });
}

interface WorkspaceTiming {
  statusElapsedFromWorkspaceOpenMs: number;
  previewElapsedFromPermissionMs: number;
  candidateOutlineElapsedFromPreviewMs: number;
  freshDetectedPriceElapsedFromPreviewMs: number;
  automaticFocusAndConversionElapsedFromFreshDetectionMs: number;
  shopperSelectionAndConversionElapsedFromSelectionMs: number;
}

async function measureWarmWorkspace(page: Page): Promise<WorkspaceTiming> {
  return page.evaluate(async () => {
    let workspaceOpenedAt = 0;
    let statusAt: number | null = null;
    let previewAt: number | null = null;
    let candidateAt: number | null = null;
    let freshDetectedPriceAt: number | null = null;
    let automaticConversionAt: number | null = null;
    const { milestone: observedMilestone } = await (
      window as unknown as PerformanceTestWindow
    ).__observeDomLatency({
      action: () => {
        const open = [...document.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Open camera")
        );
        if (!(open instanceof HTMLButtonElement)) {
          throw new Error("Open camera control is unavailable.");
        }
        workspaceOpenedAt = performance.now();
        open.click();
      },
      inspect: () => {
        const now = performance.now();
        statusAt ??= document.querySelector(
          '[aria-label="Recognition status"] strong'
        )
          ? now
          : null;
        previewAt ??= document.querySelector("video.camera-video") ? now : null;
        candidateAt ??= document.querySelector("[data-candidate-outline]")
          ? now
          : null;
        freshDetectedPriceAt ??= document.querySelector(
          '[data-detected-price][data-evidence-state="fresh"]'
        )
          ? now
          : null;
        automaticConversionAt ??=
          document
            .querySelector('[aria-label="Focused Price conversion"]')
            ?.textContent?.includes("USD 27.80") &&
          document.body.textContent?.includes("Focused Price · JPY 4,142")
            ? now
            : null;
        return statusAt !== null &&
          previewAt !== null &&
          candidateAt !== null &&
          freshDetectedPriceAt !== null &&
          automaticConversionAt !== null
          ? true
          : null;
      },
      timeoutMs: 3_500,
      timeoutMessage: "Warm Camera Workspace trial missed a milestone."
    });
    void observedMilestone;
    const permissionAt = (window as unknown as PerformanceTestWindow)
      .__cameraPermissionGrantedAt;
    if (
      permissionAt === undefined ||
      statusAt === null ||
      previewAt === null ||
      candidateAt === null ||
      freshDetectedPriceAt === null ||
      automaticConversionAt === null
    ) {
      throw new Error("Warm Camera Workspace timing origin is unavailable.");
    }
    const { milestone: alternateDetectedPrice } = await (
      window as unknown as PerformanceTestWindow
    ).__observeDomLatency({
      action: () => undefined,
      inspect: () =>
        document.querySelector(
          '[data-detected-price="JPY-980"][data-evidence-state="fresh"]'
        ),
      timeoutMs: 6_000,
      timeoutMessage: "A second Fresh Detected Price did not appear."
    });
    const selection = await (
      window as unknown as PerformanceTestWindow
    ).__observeDomLatency({
      action: () => {
        const outline = alternateDetectedPrice as HTMLElement;
        const bounds = outline.getBoundingClientRect();
        outline.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2
          })
        );
      },
      inspect: () =>
        document.body.textContent?.includes("Focused Price · JPY 980") &&
        document
          .querySelector('[aria-label="Focused Price conversion"]')
          ?.textContent?.includes("USD 6.58")
          ? true
          : null,
      timeoutMs: 500,
      timeoutMessage:
        "Shopper-selected Detected Price conversion did not appear."
    });
    return {
      statusElapsedFromWorkspaceOpenMs: statusAt - workspaceOpenedAt,
      previewElapsedFromPermissionMs: previewAt - permissionAt,
      candidateOutlineElapsedFromPreviewMs: candidateAt - previewAt,
      freshDetectedPriceElapsedFromPreviewMs:
        freshDetectedPriceAt - previewAt,
      automaticFocusAndConversionElapsedFromFreshDetectionMs:
        automaticConversionAt - freshDetectedPriceAt,
      shopperSelectionAndConversionElapsedFromSelectionMs: selection.elapsedMs
    };
  });
}

for (
  let trial = 1;
  trial <= BUDGETS.requiredWarmCachedTrials;
  trial += 1
) {
  test(`warm cached Camera Workspace trial ${trial.toString().padStart(2, "0")} meets every Fresh Detected Price budget`, async ({
    page
  }) => {
    await installFreshDeterministicCamera(page);
    await page.goto("/e2e/harness.html?performance=warm");

    await page.getByRole("button", { name: /open camera/i }).click();
    await expect(
      page.getByRole("region", { name: /recognition summary/i }).locator("strong")
    ).toHaveText("Focused Price · JPY 4,142", { timeout: 3_000 });
    await page.getByRole("button", { name: /close camera/i }).click();

    const timing = await measureWarmWorkspace(page);
    expect(
      timing.statusElapsedFromWorkspaceOpenMs,
      `trial ${trial}: truthful status from workspace open`
    ).toBeLessThanOrEqual(BUDGETS.truthfulStatusElapsedFromWorkspaceOpenMs);
    expect(
      timing.previewElapsedFromPermissionMs,
      `trial ${trial}: preview after permission`
    ).toBeLessThanOrEqual(BUDGETS.previewElapsedFromPermissionMs);
    expect(
      timing.candidateOutlineElapsedFromPreviewMs,
      `trial ${trial}: deterministic Candidate Outline from preview`
    ).toBeLessThanOrEqual(BUDGETS.warmCandidateOutlineElapsedFromPreviewP95Ms);
    expect(
      timing.freshDetectedPriceElapsedFromPreviewMs,
      `trial ${trial}: Fresh Detected Price from preview`
    ).toBeLessThanOrEqual(BUDGETS.freshDetectedPriceElapsedFromPreviewP95Ms);
    expect(
      timing.automaticFocusAndConversionElapsedFromFreshDetectionMs,
      `trial ${trial}: automatic Focused Price conversion from fresh detection`
    ).toBeLessThanOrEqual(
      BUDGETS.focusedPriceAndConversionElapsedFromEligibilityP95Ms
    );
    expect(
      timing.shopperSelectionAndConversionElapsedFromSelectionMs,
      `trial ${trial}: shopper-selected Focused Price conversion`
    ).toBeLessThanOrEqual(
      BUDGETS.focusedPriceAndConversionElapsedFromEligibilityP95Ms
    );
  });
}

test("delayed preparation keeps preview, progress, and Manual Price Entry usable", async ({
  page
}) => {
  await installFreshDeterministicCamera(page);
  await page.goto("/e2e/harness.html?preparation=delayed");
  await page.getByRole("button", { name: /open camera/i }).click();

  await expect(
    page.getByRole("progressbar", { name: /preparing recognition/i })
  ).toBeVisible();
  await expect(page.getByLabel(/rear camera preview/i)).toBeVisible();
  await expect(page.getByText(/looking for prices/i)).toHaveCount(0);
  const manual = page.getByRole("region", { name: /manual price entry/i });
  await manual.getByRole("button", { name: /open manual price entry/i }).click();
  await manual.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await expect(manual.getByRole("textbox", { name: /jpy amount/i })).toHaveValue(
    "5,000"
  );

  await expect(
    page.getByText(/looking for prices inside the capture guide/i)
  ).toBeVisible();
});

test("real first-use preparation meets its controlled budget and reuses assets in a fresh app session", async ({
  page
}) => {
  // This deterministic browser seam covers real same-origin asset hashing,
  // model loading, and engine initialization under the approved connection.
  // Release p95 still requires repeated reference-device measurements: local
  // CDP throttling cannot model device CPU or public-network variance credibly.
  test.setTimeout(90_000);
  await installFreshDeterministicCamera(page);
  await page.goto("/e2e/harness.html?preparation=first-use");
  const developmentTools = await page.context().newCDPSession(page);
  await developmentTools.send("Network.enable");
  await developmentTools.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: 1_250_000,
    uploadThroughput: 1_250_000
  });

  const workspaceOpenedAt = await page.evaluate(() => {
    const open = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Open camera")
    );
    if (!(open instanceof HTMLButtonElement)) {
      throw new Error("Open camera control is unavailable.");
    }
    const startedAt = performance.now();
    open.click();
    return startedAt;
  });

  await expect(
    page.getByRole("progressbar", { name: /preparing recognition/i })
  ).toBeVisible();
  await expect(page.getByLabel(/rear camera preview/i)).toBeVisible();
  const manual = page.getByRole("region", { name: /manual price entry/i });
  await manual.getByRole("button", { name: /open manual price entry/i }).click();
  await manual.getByRole("textbox", { name: /jpy amount/i }).fill("5,000");
  await expect(manual.getByRole("textbox", { name: /jpy amount/i })).toHaveValue(
    "5,000"
  );

  await expect(
    page.locator('[data-recognition-phase="searching"]')
  ).toBeVisible({ timeout: 30_000 });
  const preparationElapsedFromWorkspaceOpenMs = await page.evaluate(
    (startedAt) => performance.now() - startedAt,
    workspaceOpenedAt
  );
  expect(preparationElapsedFromWorkspaceOpenMs).toBeLessThanOrEqual(
    BUDGETS.coldPreparationElapsedFromWorkspaceOpenP95Ms
  );

  await page.getByRole("button", { name: /close camera/i }).click();
  await page.reload();
  const freshSessionOpenedAt = await page.evaluate(() => {
    const open = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Open camera")
    );
    if (!(open instanceof HTMLButtonElement)) {
      throw new Error("Open camera control is unavailable after reload.");
    }
    const startedAt = performance.now();
    open.click();
    return startedAt;
  });
  await expect(
    page.getByRole("progressbar", { name: /preparing recognition/i })
  ).toBeVisible();
  await expect(
    page.locator('[data-recognition-phase="searching"]')
  ).toBeVisible({ timeout: 30_000 });
  const freshSessionPreparation = await page.evaluate((startedAt) => {
    const recognitionAssetTransferSizes = performance
      .getEntriesByType("resource")
      .filter(({ name }) => new URL(name).pathname.startsWith("/ocr/"))
      .map((entry) => (entry as PerformanceResourceTiming).transferSize);
    return {
      elapsedFromWorkspaceOpenMs: performance.now() - startedAt,
      recognitionAssetTransferSizes
    };
  }, freshSessionOpenedAt);
  expect(freshSessionPreparation.elapsedFromWorkspaceOpenMs).toBeLessThanOrEqual(
    BUDGETS.coldPreparationElapsedFromWorkspaceOpenP95Ms
  );
  expect(freshSessionPreparation.recognitionAssetTransferSizes.length).toBeGreaterThan(
    0
  );
  expect(
    freshSessionPreparation.recognitionAssetTransferSizes.some(
      (transferSize) => transferSize === 0
    )
  ).toBe(true);
  await page.getByRole("button", { name: /close camera/i }).click();
  await developmentTools.detach();
});

test("a missing newly selected Reference Rate responds without hiding the Focused Price", async ({
  page
}) => {
  await installFreshDeterministicCamera(page);
  await page.goto("/e2e/harness.html?performance=warm&rate=missing");
  await page.getByRole("button", { name: /open camera/i }).click();
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142", { timeout: 3_000 });

  const currencies = page.getByRole("group", {
    name: /source and target currencies/i
  });
  await currencies
    .getByRole("button", { name: /target currencies: 1 selected/i })
    .click();
  await currencies
    .getByRole("searchbox", { name: /search target currencies/i })
    .fill("Euro");
  const loadingFeedbackElapsedFromSelectionMs = await page.evaluate(() =>
    (window as unknown as PerformanceTestWindow).__observeDomLatency({
      action: () => {
      const option = [...document.querySelectorAll('[role="option"]')].find(
        (element) => element.textContent?.includes("EUR")
      );
      if (!(option instanceof HTMLElement)) {
          throw new Error("EUR Target Currency is unavailable.");
      }
      option.click();
      },
      inspect: () => {
        const conversion = document.querySelector(
          '[aria-label="Focused Price conversion"]'
        );
        return conversion?.textContent?.includes("Loading Reference Rate") &&
          document.body.textContent?.includes("Focused Price · JPY 4,142")
          ? true
          : null;
      },
      timeoutMs: 500,
      timeoutMessage: "Missing rate loading feedback did not appear."
    })
      .then(({ elapsedMs }) => elapsedMs)
  );

  expect(loadingFeedbackElapsedFromSelectionMs).toBeLessThanOrEqual(
    BUDGETS.missingRateFeedbackElapsedFromSelectionMs
  );
  await expect(
    page.getByRole("region", { name: /recognition summary/i }).locator("strong")
  ).toHaveText("Focused Price · JPY 4,142");
  await expect(
    page
      .getByRole("region", { name: /focused price conversion/i })
      .getByRole("alert")
  ).toContainText("Conversion unavailable");
});
