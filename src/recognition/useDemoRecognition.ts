import { useEffect, useState } from "react";

import { createFocusTracker } from "./focusTracker";
import { localizeJpyPrices } from "./jpyPriceLocalization";
import {
  EMPTY_RECOGNITION,
  type RecognitionView
} from "./useCameraRecognition";

export function useDemoRecognition(enabled: boolean): RecognitionView {
  const [recognition, setRecognition] =
    useState<RecognitionView>(EMPTY_RECOGNITION);

  useEffect(() => {
    if (!enabled) {
      setRecognition(EMPTY_RECOGNITION);
      return;
    }

    const detectedPrices = localizeJpyPrices([
      {
        text: "4,142円",
        confidence: 96,
        box: { x: 280, y: 274, width: 440, height: 122 }
      }
    ]);
    const tracker = createFocusTracker({ reticle: { x: 500, y: 450 } });
    setRecognition({
      phase: "preparing",
      progress: 0,
      detectedPrices: [],
      focusedPrice: null
    });

    const prepared = window.setTimeout(() => {
      setRecognition({
        phase: "searching",
        progress: 1,
        detectedPrices,
        focusedPrice: tracker.observe(detectedPrices)
      });
    }, 80);
    const stabilized = window.setTimeout(() => {
      setRecognition({
        phase: "focused",
        progress: 1,
        detectedPrices,
        focusedPrice: tracker.observe(detectedPrices)
      });
    }, 160);

    return () => {
      window.clearTimeout(prepared);
      window.clearTimeout(stabilized);
    };
  }, [enabled]);

  return recognition;
}
