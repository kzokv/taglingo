import { useEffect, useRef, useState } from "react";

import {
  mapPreviewRegionToCamera,
  mapSampleBoxToPreview,
  type Size
} from "../camera/previewGeometry";
import { hasRecognizerAdapter } from "../domain/currencies";
import type { Rectangle } from "../domain/geometry";
import {
  areDetectedPricesAssociated,
  createFocusTracker
} from "./focusTracker";
import {
  createOcrRecognizer,
  type OcrRecognizer
} from "./ocrRecognizer";
import type { DetectedPrice } from "./priceLocalization";
import { recognizePriceEvidence } from "./recognitionPipeline";
import {
  createRecognitionScheduler,
  type RecognitionScheduler
} from "./recognitionScheduler";
import type { RecognitionProfile } from "./recognitionProfile";

export type RecognitionPhase =
  | "waiting"
  | "preparing"
  | "searching"
  | "stabilizing"
  | "focused"
  | "error";

export interface RecognitionView {
  phase: RecognitionPhase;
  progress: number;
  detectedPrices: DetectedPrice[];
  focusedPrice: DetectedPrice | null;
}

export const EMPTY_RECOGNITION: RecognitionView = {
  phase: "waiting",
  progress: 0,
  detectedPrices: [],
  focusedPrice: null
};

export type CreateRecognizer = (
  profile: RecognitionProfile,
  onProgress: (progress: number, status: string) => void
) => OcrRecognizer;

export const createBrowserRecognizer: CreateRecognizer = (
  profile,
  onProgress
) => createOcrRecognizer(profile, { onProgress });

interface CapturedRecognitionPass {
  canvas: HTMLCanvasElement;
  sample: Rectangle;
  cameraSize: Size;
  previewSize: Size;
  guideCenter: { x: number; y: number };
}

interface CompletedRecognitionPass {
  detectedPrices: DetectedPrice[];
  guideCenter: { x: number; y: number };
}

export function useCameraRecognition({
  enabled,
  profile,
  video,
  preview,
  captureGuide,
  createRecognizer,
  recognitionRestartKey = 0
}: {
  enabled: boolean;
  profile: RecognitionProfile;
  video: HTMLVideoElement | null;
  preview: HTMLElement | null;
  captureGuide: HTMLElement | null;
  createRecognizer: CreateRecognizer;
  recognitionRestartKey?: number;
}): RecognitionView {
  const [recognition, setRecognition] =
    useState<RecognitionView>(EMPTY_RECOGNITION);
  const recognizerRelease = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const sourceCurrency = profile.sourceCurrency;
    if (
      !enabled ||
      !video ||
      !preview ||
      !captureGuide ||
      !hasRecognizerAdapter(sourceCurrency)
    ) {
      setRecognition(EMPTY_RECOGNITION);
      return;
    }

    let active = true;
    let prepared = false;
    let discoveryDetectedPrices: DetectedPrice[] = [];
    let recognizer: OcrRecognizer | null = null;
    const previousRecognizerRelease = recognizerRelease.current;
    const initialPreviewBounds = preview.getBoundingClientRect();
    const tracker = createFocusTracker({
      captureGuideCenter: {
        x: initialPreviewBounds.width / 2,
        y: initialPreviewBounds.height * 0.45
      }
    });
    let scheduler: RecognitionScheduler;
    scheduler = createRecognitionScheduler<
      CapturedRecognitionPass,
      CompletedRecognitionPass
    >({
      capturePass(request) {
        const cameraSize = {
          width: video.videoWidth,
          height: video.videoHeight
        };
        const previewBounds = preview.getBoundingClientRect();
        const guideBounds = captureGuide.getBoundingClientRect();
        const previewSize = {
          width: previewBounds.width,
          height: previewBounds.height
        };
        if (
          cameraSize.width <= 0 ||
          cameraSize.height <= 0 ||
          previewSize.width <= 0 ||
          previewSize.height <= 0
        ) {
          return null;
        }

        const guideRegion = {
          x: guideBounds.left - previewBounds.left,
          y: guideBounds.top - previewBounds.top,
          width: guideBounds.width,
          height: guideBounds.height
        };
        const previewRegion =
          request.kind === "guide"
            ? guideRegion
            : {
                x: 0,
                y: 0,
                width: previewSize.width,
                height: previewSize.height
              };
        const sample = mapPreviewRegionToCamera(
          previewRegion,
          cameraSize,
          previewSize
        );
        if (!sample) {
          return null;
        }

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: true
        });
        if (!context) {
          return null;
        }
        canvas.width = sample.width;
        canvas.height = sample.height;
        context.drawImage(
          video,
          sample.x,
          sample.y,
          sample.width,
          sample.height,
          0,
          0,
          sample.width,
          sample.height
        );

        return {
          canvas,
          sample,
          cameraSize,
          previewSize,
          guideCenter: {
            x: guideRegion.x + guideRegion.width / 2,
            y: guideRegion.y + guideRegion.height / 2
          }
        };
      },
      async runPass(captured, request) {
        if (!recognizer) {
          throw new Error("Recognition pass started before profile preparation.");
        }
        const candidates = await recognizePriceEvidence(
          profile,
          recognizer,
          captured.canvas,
          {
            kind: request.kind,
            frameIdentity: request.frameIdentity
          }
        );
        const detectedPrices = candidates.map((price) => ({
          ...price,
          box: mapSampleBoxToPreview(
            price.box,
            captured.sample,
            captured.cameraSize,
            captured.previewSize
          )
        }));
        return {
          detectedPrices,
          guideCenter: captured.guideCenter
        };
      },
      onResult(completed, request) {
        if (!active) {
          return;
        }
        if (request.kind === "discovery") {
          discoveryDetectedPrices = completed.detectedPrices;
        }
        const displayedDetectedPrices =
          discoveryDetectedPrices.length > 0
            ? [...discoveryDetectedPrices]
            : [...completed.detectedPrices];
        const focusedPrice = tracker.observe(
          completed.detectedPrices,
          completed.guideCenter
        );
        const displayedWithFocus = focusedPrice
          ? displayedDetectedPrices.map((price) =>
              areDetectedPricesAssociated(price, focusedPrice)
                ? focusedPrice
                : price
            )
          : displayedDetectedPrices;
        if (focusedPrice && !displayedWithFocus.includes(focusedPrice)) {
          displayedWithFocus.push(focusedPrice);
        }
        const phase = focusedPrice
          ? "focused"
          : completed.detectedPrices.length > 0
            ? "stabilizing"
            : "searching";
        scheduler.setState(phase);
        setRecognition({
          phase,
          progress: 1,
          detectedPrices: displayedWithFocus,
          focusedPrice
        });
      },
      onError() {
        if (active) {
          setRecognition((current) => ({ ...current, phase: "error" }));
        }
      }
    });

    setRecognition({
      phase: "preparing",
      progress: 0,
      detectedPrices: [],
      focusedPrice: null
    });
    void previousRecognizerRelease
      .then(async () => {
        if (!active) {
          return;
        }
        recognizer = createRecognizer(profile, (progress) => {
          if (active && !prepared) {
            setRecognition((current) => ({
              ...current,
              phase: "preparing",
              progress: Math.max(current.progress, progress)
            }));
          }
        });
        await recognizer.prepare();
      })
      .then(() => {
        if (!active) {
          return;
        }
        prepared = true;
        setRecognition((current) => ({
          ...current,
          phase: "searching",
          progress: 1
        }));
        scheduler.start(
          `${profile.id}:session-${recognitionRestartKey.toString()}`
        );
      })
      .catch(() => {
        if (active) {
          setRecognition((current) => ({ ...current, phase: "error" }));
        }
      });

    return () => {
      active = false;
      scheduler.dispose();
      const release = previousRecognizerRelease.then(async () => {
        await recognizer?.terminate();
      });
      recognizerRelease.current = release.catch(() => undefined);
    };
  }, [
    captureGuide,
    createRecognizer,
    enabled,
    preview,
    recognitionRestartKey,
    profile,
    video
  ]);

  return recognition;
}
