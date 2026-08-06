import { useCallback, useEffect, useRef, useState } from "react";

import {
  createCandidateTracker,
  type CandidateTracker,
  type CandidateTrackingSnapshot,
  type DetectedPriceIdentity
} from "./focusTracker";
import { localizePrices } from "./priceLocalization";
import {
  applyCandidateTrackingSnapshot,
  EMPTY_RECOGNITION,
  type RecognitionController,
  type RecognitionView
} from "./useCameraRecognition";

export function useDemoRecognition(enabled: boolean): RecognitionController {
  const [recognition, setRecognition] =
    useState<RecognitionView>(EMPTY_RECOGNITION);
  const candidateTracker = useRef<CandidateTracker | null>(null);
  const applyTrackerCommand = useCallback(
    (command: (tracker: CandidateTracker) => CandidateTrackingSnapshot) => {
      const tracker = candidateTracker.current;
      if (!tracker) {
        return;
      }
      const snapshot = command(tracker);
      setRecognition((current) =>
        applyCandidateTrackingSnapshot(current, snapshot)
      );
    },
    []
  );
  const selectDetectedPrice = useCallback(
    (identity: DetectedPriceIdentity) => {
      applyTrackerCommand((tracker) => tracker.select(identity));
    },
    [applyTrackerCommand]
  );
  const resumeAutomaticFocus = useCallback(() => {
    applyTrackerCommand((tracker) => tracker.resumeAutomaticFocus());
  }, [applyTrackerCommand]);
  const clearHeldPrices = useCallback(() => {
    applyTrackerCommand((tracker) => tracker.clearHeldPrices());
  }, [applyTrackerCommand]);

  useEffect(() => {
    if (!enabled) {
      candidateTracker.current = null;
      setRecognition(EMPTY_RECOGNITION);
      return;
    }

    const detectedPrices = localizePrices("JPY", [
      {
        text: "4,142円",
        confidence: 96,
        box: { x: 280, y: 389, width: 440, height: 122 }
      }
    ]);
    const tracker = createCandidateTracker({
      captureGuide: { x: 280, y: 384, width: 440, height: 132 },
      geometry: {
        rulesVersion: "demo-geometry.v1",
        maximumDisplacementInTextHeights: 1.5,
        smoothingFactor: 0.25
      },
      stabilization: {
        rulesVersion: "demo-stabilization.v1",
        requiredDistinctFrames: 2,
        coveredMissesBeforeRemoval: 3
      }
    });
    candidateTracker.current = tracker;
    const coverage = { x: 0, y: 0, width: 1000, height: 1000 };
    setRecognition({
      phase: "preparing",
      progress: 0,
      candidateOutlines: [],
      detectedPrices: [],
      focusedPrice: null,
      explicitlyFocusedPriceIdentity: null,
      completedPassCount: 0,
      missCount: 0,
      focusChangeCount: 0,
      stableDetectionCount: 0
    });

    const prepared = window.setTimeout(() => {
      const snapshot = tracker.observe({
        frameIdentity: "demo-frame-1",
        kind: "guide",
        candidates: detectedPrices,
        coverage,
        observedAtMs: 0
      });
      setRecognition((current) =>
        applyCandidateTrackingSnapshot(
          { ...current, phase: "stabilizing", progress: 1 },
          snapshot
        )
      );
    }, 80);
    const stabilized = window.setTimeout(() => {
      const snapshot = tracker.observe({
        frameIdentity: "demo-frame-2",
        kind: "guide",
        candidates: detectedPrices,
        coverage,
        observedAtMs: 80
      });
      setRecognition((current) =>
        applyCandidateTrackingSnapshot(
          { ...current, phase: "focused", progress: 1 },
          snapshot
        )
      );
    }, 160);

    return () => {
      if (candidateTracker.current === tracker) {
        candidateTracker.current = null;
      }
      window.clearTimeout(prepared);
      window.clearTimeout(stabilized);
    };
  }, [enabled]);

  return {
    ...recognition,
    selectDetectedPrice,
    resumeAutomaticFocus,
    clearHeldPrices
  };
}
