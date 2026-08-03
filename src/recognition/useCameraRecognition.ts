import { useCallback, useEffect, useRef, useState } from "react";

import {
  mapPreviewRegionToCamera,
  mapSampleBoxToPreview,
  type Size
} from "../camera/previewGeometry";
import { hasRecognizerAdapter } from "../domain/currencies";
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
  detectedPrices: TrackedDetectedPrice[];
  focusedPrice: TrackedDetectedPrice | null;
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
    setRecognition((current) => ({
      ...current,
      phase: phaseFor(snapshot),
      detectedPrices: snapshot.detectedPrices,
      focusedPrice: snapshot.focusedPrice
    }));
  }, []);

  useEffect(() => {
    const sourceCurrency = profile.sourceCurrency;
    if (
      !enabled ||
      !video ||
      !preview ||
      !captureGuide ||
      !hasRecognizerAdapter(sourceCurrency)
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
      geometry: profile.geometry,
      stabilization: profile.stabilization
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
        setRecognition({
          phase,
          progress: 1,
          detectedPrices: snapshot.detectedPrices,
          focusedPrice: snapshot.focusedPrice
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
    profile,
    video
  ]);

  return { ...recognition, selectDetectedPrice };
}
