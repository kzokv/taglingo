import { useEffect, useState } from "react";

import {
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
import {
  localizePrices,
  type DetectedPrice
} from "./priceLocalization";
import { createNewestOnlyPipeline } from "./newestOnlyPipeline";
import { nextRecognitionDelay } from "./recognitionCadence";
import type { RecognitionProfile } from "./recognitionProfile";

export type RecognitionPhase =
  | "waiting"
  | "preparing"
  | "searching"
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

function centralSample(camera: Size): Rectangle | null {
  if (camera.width <= 0 || camera.height <= 0) {
    return null;
  }

  const width = Math.round(camera.width * 0.7);
  const height = Math.round(camera.height * 0.28);
  return {
    x: Math.round((camera.width - width) / 2),
    y: Math.max(
      0,
      Math.round(camera.height * 0.45 - height / 2)
    ),
    width,
    height
  };
}

export function useCameraRecognition({
  enabled,
  profile,
  video,
  preview,
  createRecognizer,
  recognitionRestartKey = 0
}: {
  enabled: boolean;
  profile: RecognitionProfile;
  video: HTMLVideoElement | null;
  preview: HTMLElement | null;
  createRecognizer: CreateRecognizer;
  recognitionRestartKey?: number;
}): RecognitionView {
  const [recognition, setRecognition] =
    useState<RecognitionView>(EMPTY_RECOGNITION);

  useEffect(() => {
    const sourceCurrency = profile.sourceCurrency;
    if (
      !enabled ||
      !video ||
      !preview ||
      !hasRecognizerAdapter(sourceCurrency)
    ) {
      setRecognition(EMPTY_RECOGNITION);
      return;
    }

    let active = true;
    let prepared = false;
    let nextSubmission: number | undefined;
    let recognitionDelay = 350;
    let completedPasses = 0;
    let discoveryDetectedPrices: DetectedPrice[] = [];
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true
    });
    const previewRect = preview.getBoundingClientRect();
    const tracker = createFocusTracker({
      reticle: { x: previewRect.width / 2, y: previewRect.height * 0.45 }
    });
    const recognizer = createRecognizer(
      profile,
      (progress) => {
        if (active && !prepared) {
          setRecognition((current) => ({
            ...current,
            phase: "preparing",
            progress: Math.max(current.progress, progress)
          }));
        }
      }
    );

    const pipeline = createNewestOnlyPipeline<
      number,
      {
        displayedDetectedPrices: DetectedPrice[];
        currentPassDetectedPrices: DetectedPrice[];
        ocrDurationMs: number;
        reticle: { x: number; y: number };
      }
    >({
      async recognize() {
        const startedAt = performance.now();
        completedPasses += 1;
        const passKind =
          completedPasses % 4 === 0 ? "discovery" : "guide";
        const cameraSize = {
          width: video.videoWidth,
          height: video.videoHeight
        };
        const previewBounds = preview.getBoundingClientRect();
        const previewSize = {
          width: previewBounds.width,
          height: previewBounds.height
        };
        const sample =
          passKind === "discovery"
            ? {
                x: 0,
                y: 0,
                width: cameraSize.width,
                height: cameraSize.height
              }
            : centralSample(cameraSize);
        if (!sample || !context) {
          return {
            displayedDetectedPrices: [],
            currentPassDetectedPrices: [],
            ocrDurationMs: performance.now() - startedAt,
            reticle: {
              x: previewSize.width / 2,
              y: previewSize.height * 0.45
            }
          };
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

        const frameIdentity = `${profile.id}:frame-${completedPasses}`;
        const tokens = await recognizer.recognize(canvas, {
          kind: passKind,
          frameIdentity,
          preprocessingIdentity: profile.preprocessing[0].id
        });
        const currentPassDetectedPrices = localizePrices(
          sourceCurrency,
          tokens
        )
          .filter(
            ({ confidence }) =>
              confidence >= profile.thresholds.candidateConfidence
          )
          .map((price) => ({
            ...price,
            box: mapSampleBoxToPreview(
              price.box,
              sample,
              cameraSize,
              previewSize
            )
          }));
        if (passKind === "discovery") {
          discoveryDetectedPrices = currentPassDetectedPrices;
        }

        return {
          displayedDetectedPrices:
            discoveryDetectedPrices.length > 0
              ? discoveryDetectedPrices
              : currentPassDetectedPrices,
          currentPassDetectedPrices,
          ocrDurationMs: performance.now() - startedAt,
          reticle: {
            x: previewSize.width / 2,
            y: previewSize.height * 0.45
          }
        };
      },
      onResult({
        displayedDetectedPrices,
        currentPassDetectedPrices,
        ocrDurationMs,
        reticle
      }) {
        if (!active) {
          return;
        }
        recognitionDelay = nextRecognitionDelay(ocrDurationMs);
        const focusedPrice = tracker.observe(
          currentPassDetectedPrices,
          reticle
        );
        const displayedDetectedPricesWithFocus = focusedPrice
          ? displayedDetectedPrices.map((price) =>
              areDetectedPricesAssociated(price, focusedPrice)
                ? focusedPrice
                : price
            )
          : displayedDetectedPrices;
        if (
          focusedPrice &&
          !displayedDetectedPricesWithFocus.includes(focusedPrice)
        ) {
          displayedDetectedPricesWithFocus.push(focusedPrice);
        }
        setRecognition({
          phase: focusedPrice ? "focused" : "searching",
          progress: 1,
          detectedPrices: displayedDetectedPricesWithFocus,
          focusedPrice
        });
      },
      onError() {
        if (active) {
          setRecognition((current) => ({ ...current, phase: "error" }));
        }
      }
    });
    const scheduleNextSubmission = () => {
      nextSubmission = window.setTimeout(() => {
        pipeline.submit(performance.now());
        scheduleNextSubmission();
      }, recognitionDelay);
    };

    setRecognition({
      phase: "preparing",
      progress: 0,
      detectedPrices: [],
      focusedPrice: null
    });
    void recognizer
      .prepare()
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
        pipeline.submit(performance.now());
        scheduleNextSubmission();
      })
      .catch(() => {
        if (active) {
          setRecognition((current) => ({ ...current, phase: "error" }));
        }
      });

    return () => {
      active = false;
      if (nextSubmission !== undefined) {
        window.clearTimeout(nextSubmission);
      }
      pipeline.dispose();
      void recognizer.terminate();
    };
  }, [
    createRecognizer,
    enabled,
    preview,
    recognitionRestartKey,
    profile,
    video
  ]);

  return recognition;
}
