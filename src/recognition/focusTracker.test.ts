import { describe, expect, it } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import { createCandidateTracker } from "./focusTracker";
import type { DetectedPrice } from "./priceLocalization";

const profile = createTestRecognitionProfile();
const fullPreview = { x: 0, y: 0, width: 400, height: 800 };
const captureGuideCenter = { x: 200, y: 400 };

function candidate({
  minorUnits = 4142,
  box = { x: 170, y: 370, width: 80, height: 32 }
}: {
  minorUnits?: number;
  box?: DetectedPrice["box"];
} = {}): DetectedPrice {
  return {
    currency: "JPY",
    minorUnits,
    confidence: 94,
    box
  };
}

function createTracker() {
  return createCandidateTracker({
    captureGuideCenter,
    geometry: profile.geometry,
    stabilization: profile.stabilization
  });
}

function pass(
  frameIdentity: string,
  candidates: readonly DetectedPrice[],
  coverage = fullPreview
) {
  return { frameIdentity, candidates, coverage };
}

describe("Candidate tracking", () => {
  it("stabilizes compatible evidence only after two distinct camera frames", () => {
    const tracker = createTracker();
    const price = candidate();

    expect(tracker.observe(pass("frame-1", [price])).detectedPrices).toEqual(
      []
    );
    expect(tracker.observe(pass("frame-1", [price])).detectedPrices).toEqual(
      []
    );

    expect(tracker.observe(pass("frame-2", [price]))).toEqual({
      detectedPrices: [{ ...price, identity: "detected-price-1" }],
      focusedPrice: { ...price, identity: "detected-price-1" },
      hasUnstableCandidates: false
    });
  });

  it("expires a stable discovery track only on its third covered miss", () => {
    const tracker = createTracker();
    const offGuidePrice = candidate({
      box: { x: 300, y: 100, width: 60, height: 30 }
    });
    const guideCoverage = { x: 100, y: 300, width: 200, height: 200 };
    tracker.observe(pass("frame-1", [offGuidePrice]));
    tracker.observe(pass("frame-2", [offGuidePrice]));

    for (const frameIdentity of ["frame-3", "frame-4", "frame-5"]) {
      expect(
        tracker.observe(pass(frameIdentity, [], guideCoverage)).detectedPrices
      ).toHaveLength(1);
    }
    expect(
      tracker.observe(pass("frame-6", [], fullPreview)).detectedPrices
    ).toHaveLength(1);
    expect(
      tracker.observe(pass("frame-7", [], fullPreview)).detectedPrices
    ).toHaveLength(1);
    expect(
      tracker.observe(pass("frame-8", [], fullPreview)).detectedPrices
    ).toEqual([]);
  });

  it("smooths compatible geometry and keeps the outline fixed during misses", () => {
    const tracker = createTracker();
    const initial = candidate({
      box: { x: 100, y: 100, width: 80, height: 40 }
    });
    const jittered = candidate({
      box: { x: 120, y: 108, width: 88, height: 44 }
    });
    tracker.observe(pass("frame-1", [initial]));

    const stable = tracker.observe(pass("frame-2", [jittered]));
    expect(stable.detectedPrices[0].box).toEqual({
      x: 105,
      y: 102,
      width: 82,
      height: 41
    });

    expect(
      tracker.observe(pass("frame-3", [], fullPreview)).detectedPrices[0].box
    ).toEqual(stable.detectedPrices[0].box);
  });

  it("starts a new track for materially displaced evidence instead of moving an outline", () => {
    const tracker = createTracker();
    const original = candidate({
      box: { x: 40, y: 100, width: 60, height: 30 }
    });
    const displaced = candidate({
      box: { x: 240, y: 100, width: 60, height: 30 }
    });
    tracker.observe(pass("frame-1", [original]));
    const originalStable = tracker.observe(pass("frame-2", [original]));

    const displacedPending = tracker.observe(pass("frame-3", [displaced]));
    expect(displacedPending.detectedPrices).toEqual(
      originalStable.detectedPrices
    );
    expect(displacedPending.hasUnstableCandidates).toBe(true);

    const bothStable = tracker.observe(pass("frame-4", [displaced]));
    expect(bothStable.detectedPrices).toHaveLength(2);
    expect(new Set(bothStable.detectedPrices.map(({ box }) => box.x))).toEqual(
      new Set([40, 240])
    );
  });

  it("maintains separate identities for duplicate amounts at distinct positions", () => {
    const tracker = createTracker();
    const left = candidate({
      box: { x: 100, y: 200, width: 40, height: 40 }
    });
    const right = candidate({
      box: { x: 150, y: 200, width: 40, height: 40 }
    });
    tracker.observe(pass("frame-1", [right, left]));

    const stable = tracker.observe(pass("frame-2", [left, right]));

    expect(stable.detectedPrices).toHaveLength(2);
    expect(
      stable.detectedPrices.map(({ box }) => box.x).sort((a, b) => a - b)
    ).toEqual([100, 150]);
    expect(new Set(stable.detectedPrices.map(({ identity }) => identity)).size).toBe(
      2
    );
  });

  it("uses the lowest-displacement assignment when duplicate tracks move ambiguously", () => {
    const tracker = createTracker();
    const left = candidate({
      box: { x: 0, y: 200, width: 40, height: 50 }
    });
    const right = candidate({
      box: { x: 100, y: 200, width: 40, height: 50 }
    });
    tracker.observe(pass("frame-1", [left, right]));
    const stable = tracker.observe(pass("frame-2", [left, right]));
    const leftIdentity = stable.detectedPrices.find(
      ({ box }) => box.x === 0
    )!.identity;
    const rightIdentity = stable.detectedPrices.find(
      ({ box }) => box.x === 100
    )!.identity;

    const moved = tracker.observe(
      pass("frame-3", [
        candidate({ box: { x: 60, y: 200, width: 40, height: 50 } }),
        candidate({ box: { x: 105, y: 200, width: 40, height: 50 } })
      ])
    );

    expect(
      moved.detectedPrices.find(({ identity }) => identity === leftIdentity)?.box
        .x
    ).toBe(15);
    expect(
      moved.detectedPrices.find(({ identity }) => identity === rightIdentity)
        ?.box.x
    ).toBe(101.25);
    expect(moved.hasUnstableCandidates).toBe(false);
  });

  it("preserves the maximum number of compatible duplicate-track identities", () => {
    const tracker = createTracker();
    const first = candidate({
      box: { x: 50, y: 200, width: 40, height: 40 }
    });
    const second = candidate({
      box: { x: 100, y: 200, width: 40, height: 40 }
    });
    tracker.observe(pass("frame-1", [first, second]));
    const stable = tracker.observe(pass("frame-2", [first, second]));
    const firstIdentity = stable.detectedPrices.find(
      ({ box }) => box.x === 50
    )!.identity;
    const secondIdentity = stable.detectedPrices.find(
      ({ box }) => box.x === 100
    )!.identity;

    const moved = tracker.observe(
      pass("frame-3", [
        candidate({ box: { x: 74, y: 200, width: 40, height: 40 } }),
        candidate({ box: { x: 20, y: 200, width: 40, height: 40 } })
      ])
    );

    expect(
      moved.detectedPrices.find(({ identity }) => identity === firstIdentity)
        ?.box.x
    ).toBe(42.5);
    expect(
      moved.detectedPrices.find(({ identity }) => identity === secondIdentity)
        ?.box.x
    ).toBe(93.5);
    expect(moved.hasUnstableCandidates).toBe(false);
  });

  it("preserves explicit focus until another track is selected or it expires", () => {
    const tracker = createTracker();
    const nearCenter = candidate({
      minorUnits: 1000,
      box: { x: 180, y: 380, width: 40, height: 40 }
    });
    const farFromCenter = candidate({
      minorUnits: 2000,
      box: { x: 20, y: 80, width: 40, height: 40 }
    });
    tracker.observe(pass("frame-1", [nearCenter, farFromCenter]));
    const automatic = tracker.observe(
      pass("frame-2", [nearCenter, farFromCenter])
    );
    const nearIdentity = automatic.detectedPrices.find(
      ({ minorUnits }) => minorUnits === 1000
    )!.identity;
    const farIdentity = automatic.detectedPrices.find(
      ({ minorUnits }) => minorUnits === 2000
    )!.identity;
    expect(automatic.focusedPrice?.identity).toBe(nearIdentity);

    expect(tracker.select(farIdentity).focusedPrice?.identity).toBe(
      farIdentity
    );
    expect(
      tracker.observe(pass("frame-3", [nearCenter, farFromCenter]))
        .focusedPrice?.identity
    ).toBe(farIdentity);
    expect(tracker.select(nearIdentity).focusedPrice?.identity).toBe(
      nearIdentity
    );

    tracker.select(farIdentity);
    tracker.observe(pass("frame-4", [nearCenter]));
    tracker.observe(pass("frame-5", [nearCenter]));
    const afterExpiry = tracker.observe(pass("frame-6", [nearCenter]));
    expect(afterExpiry.focusedPrice?.identity).toBe(nearIdentity);
  });

  it("breaks automatic-focus distance ties top-to-bottom then left-to-right", () => {
    const tracker = createTracker();
    const above = candidate({
      minorUnits: 1000,
      box: { x: 180, y: 60, width: 40, height: 40 }
    });
    const below = candidate({
      minorUnits: 2000,
      box: { x: 180, y: 100, width: 40, height: 40 }
    });
    const tieCenter = { x: 200, y: 100 };
    tracker.observe(pass("frame-1", [below, above]), tieCenter);

    const stable = tracker.observe(
      pass("frame-2", [above, below]),
      tieCenter
    );

    expect(stable.focusedPrice?.minorUnits).toBe(1000);
  });
});
