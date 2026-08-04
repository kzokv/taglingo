import { useCallback, useEffect, useRef, useState } from "react";

import {
  mapPreviewRegionToCamera,
  mapSampleBoxToPreview,
  type Size
} from "../camera/previewGeometry";
import type { SourceCurrencyCode } from "../domain/currencies";
import type { Rectangle } from "../domain/geometry";
import {
  createCandidateTracker,
  type CandidateTrackingSnapshot,
  type CandidateTracker,
  type DetectedPriceIdentity,
  type TrackedDetectedPrice
} from "./focusTracker";
import {
  createOcrRecognizer,
  type OcrRecognizer
} from "./ocrRecognizer";
import { recognizePriceEvidence } from "./recognitionPipeline";
import {
  createRecognitionScheduler,
  type RecognitionScheduler,
  type RecognitionSchedulerState
} from "./recognitionScheduler";
import type { RecognitionRuntimeConfiguration } from "./recognitionRuntime";

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
  detectedPrices: TrackedDetectedPrice[];
  focusedPrice: TrackedDetectedPrice | null;
  explicitlyFocusedPriceIdentity: DetectedPriceIdentity | null;
  completedPassCount: number;
  missCount: number;
  focusChangeCount: number;
  stableDetectionCount: number;
}

export interface RecognitionController extends RecognitionView {
  selectDetectedPrice(identity: DetectedPriceIdentity): void;
}

function phaseFor(
  snapshot: CandidateTrackingSnapshot
): RecognitionSchedulerState {
  return snapshot.focusedPrice
    ? "focused"
    : snapshot.hasUnstableCandidates
      ? "stabilizing"
      : "searching";
}

export const EMPTY_RECOGNITION: RecognitionView = {
  phase: "waiting",
  progress: 0,
  detectedPrices: [],
  focusedPrice: null,
  explicitlyFocusedPriceIdentity: null,
  completedPassCount: 0,
  missCount: 0,
  focusChangeCount: 0,
  stableDetectionCount: 0
};

export function applyCandidateTrackingSnapshot(
  recognition: RecognitionView,
  snapshot: CandidateTrackingSnapshot
): RecognitionView {
  return {
    ...recognition,
    detectedPrices: snapshot.detectedPrices,
    focusedPrice: snapshot.focusedPrice,
    explicitlyFocusedPriceIdentity: snapshot.explicitlyFocusedPriceIdentity
  };
}

export type CreateRecognizer = (
  runtime: RecognitionRuntimeConfiguration,
  onProgress: (progress: number, status: string) => void
) => OcrRecognizer;

export const createBrowserRecognizer: CreateRecognizer = (
  runtime,
  onProgress
) => createOcrRecognizer(runtime, { onProgress });

interface CapturedRecognitionPass {
  canvas: HTMLCanvasElement;
  sample: Rectangle;
  cameraSize: Size;
  previewSize: Size;
  guideCenter: { x: number; y: number };
  coverage: Rectangle;
}

interface CompletedRecognitionPass {
  candidates: Array<
    Pick<TrackedDetectedPrice, "box" | "confidence" | "currency" | "minorUnits">
  >;
  guideCenter: { x: number; y: number };
  coverage: Rectangle;
}

export function useCameraRecognition({
  enabled,
  runtime,
  sourceCurrency,
  video,
  preview,
  captureGuide,
  createRecognizer,
  recognitionRestartKey = 0
}: {
  enabled: boolean;
  runtime: RecognitionRuntimeConfiguration;
  sourceCurrency: SourceCurrencyCode;
  video: HTMLVideoElement | null;
  preview: HTMLElement | null;
  captureGuide: HTMLElement | null;
  createRecognizer: CreateRecognizer;
  recognitionRestartKey?: number;
}): RecognitionController {
  const [recognition, setRecognition] =
    useState<RecognitionView>(EMPTY_RECOGNITION);
  const recognizerRelease = useRef<Promise<void>>(Promise.resolve());
  const candidateTracker = useRef<CandidateTracker | null>(null);
  const selectDetectedPrice = useCallback((identity: DetectedPriceIdentity) => {
    const snapshot = candidateTracker.current?.select(identity);
    if (!snapshot) {
      return;
    }
    setRecognition((current) => {
      const focusChanged =
        snapshot.focusedPrice !== null &&
        snapshot.focusedPrice.identity !== current.focusedPrice?.identity;
      return applyCandidateTrackingSnapshot(
        {
          ...current,
          phase: phaseFor(snapshot),
          focusChangeCount:
            current.focusChangeCount + (focusChanged ? 1 : 0)
        },
        snapshot
      );
    });
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      !video ||
      !preview ||
      !captureGuide
    ) {
      candidateTracker.current = null;
      setRecognition(EMPTY_RECOGNITION);
      return;
    }

    let active = true;
    let prepared = false;
    let recognizer: OcrRecognizer | null = null;
    const previousRecognizerRelease = recognizerRelease.current;
    const initialPreviewBounds = preview.getBoundingClientRect();
    const tracker = createCandidateTracker({
      captureGuideCenter: {
        x: initialPreviewBounds.width / 2,
        y: initialPreviewBounds.height * 0.45
      },
      geometry: runtime.rules.geometry,
      stabilization: runtime.rules.stabilization
    });
    candidateTracker.current = tracker;
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
          },
          coverage: mapSampleBoxToPreview(
            { x: 0, y: 0, width: sample.width, height: sample.height },
            sample,
            cameraSize,
            previewSize
          )
        };
      },
      async runPass(captured, request) {
        if (!recognizer) {
          throw new Error("Recognition pass started before runtime preparation.");
        }
        const candidates = await recognizePriceEvidence(
          runtime,
          sourceCurrency,
          recognizer,
          captured.canvas,
          {
            kind: request.kind,
            frameIdentity: request.frameIdentity
          }
        );
        const trackedCandidates = candidates.map((price) => ({
          currency: price.currency,
          minorUnits: price.minorUnits,
          confidence: price.confidence,
          box: mapSampleBoxToPreview(
            price.box,
            captured.sample,
            captured.cameraSize,
            captured.previewSize
          )
        }));
        return {
          candidates: trackedCandidates,
          guideCenter: captured.guideCenter,
          coverage: captured.coverage
        };
      },
      onResult(completed, request) {
        if (!active) {
          return;
        }
        const snapshot = tracker.observe(
          {
            frameIdentity: request.frameIdentity,
            candidates: completed.candidates,
            coverage: completed.coverage
          },
          completed.guideCenter
        );
        const phase = phaseFor(snapshot);
        scheduler.setState(phase);
        setRecognition((current) => {
          const knownIdentities = new Set(
            current.detectedPrices.map(({ identity }) => identity)
          );
          const newlyStable = snapshot.detectedPrices.filter(
            ({ identity }) => !knownIdentities.has(identity)
          ).length;
          const focusChanged =
            snapshot.focusedPrice !== null &&
            snapshot.focusedPrice.identity !== current.focusedPrice?.identity;
          return applyCandidateTrackingSnapshot(
            {
              ...current,
              phase,
              progress: 1,
              completedPassCount: current.completedPassCount + 1,
              missCount:
                current.missCount + (completed.candidates.length === 0 ? 1 : 0),
              focusChangeCount:
                current.focusChangeCount + (focusChanged ? 1 : 0),
              stableDetectionCount:
                current.stableDetectionCount + newlyStable
            },
            snapshot
          );
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
      focusedPrice: null,
      explicitlyFocusedPriceIdentity: null,
      completedPassCount: 0,
      missCount: 0,
      focusChangeCount: 0,
      stableDetectionCount: 0
    });
    void previousRecognizerRelease
      .then(async () => {
        if (!active) {
          return;
        }
        recognizer = createRecognizer(runtime, (progress) => {
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
          `${runtime.id}:${sourceCurrency}:session-${recognitionRestartKey.toString()}`
        );
      })
      .catch(() => {
        if (active) {
          setRecognition((current) => ({ ...current, phase: "error" }));
        }
      });

    return () => {
      active = false;
      if (candidateTracker.current === tracker) {
        candidateTracker.current = null;
      }
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
    runtime,
    sourceCurrency,
    video
  ]);

  return { ...recognition, selectDetectedPrice };
}
