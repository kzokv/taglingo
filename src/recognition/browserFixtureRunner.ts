import type { SourceCurrencyCode } from "../domain/currencies";
import type { Rectangle } from "../domain/geometry";
import {
  createOcrRecognizer,
  type OcrRecognizer,
  type RecognizerObservation
} from "./ocrRecognizer";
import { recognizePriceEvidence } from "./recognitionPipeline";
import {
  UNIVERSAL_RECOGNITION_RUNTIME,
  type RecognitionRuntimeConfiguration
} from "./recognitionRuntime";

export interface BrowserRecognitionFixture {
  readonly id: string;
  readonly origin: "generated" | "real-world";
  readonly imageUrl: string;
  readonly sourceCurrency: SourceCurrencyCode;
  readonly samples?: readonly Rectangle[];
}

export interface BrowserRecognitionFixtureResult {
  readonly fixtureId: string;
  readonly origin: BrowserRecognitionFixture["origin"];
  readonly runtimeId: string;
  readonly image: { readonly width: number; readonly height: number };
  readonly observations: readonly RecognizerObservation[];
  readonly detectedPrices: Awaited<
    ReturnType<typeof recognizePriceEvidence>
  >;
}

async function decodeFixtureImage(
  imageUrl: string,
  createImage: () => HTMLImageElement
): Promise<HTMLImageElement> {
  const image = createImage();
  image.decoding = "sync";
  image.src = imageUrl;
  await image.decode();
  return image;
}

function imageCanvas(
  image: HTMLImageElement,
  sample: Rectangle,
  createCanvas: () => HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = createCanvas();
  canvas.width = sample.width;
  canvas.height = sample.height;
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });
  if (!context) {
    throw new Error("Recognition fixture runner requires a 2D canvas context.");
  }
  context.drawImage(
    image,
    sample.x,
    sample.y,
    sample.width,
    sample.height,
    0,
    0,
    sample.width,
    sample.height
  );
  return canvas;
}

function assertSampleInsideImage(
  sample: Rectangle,
  image: HTMLImageElement
): void {
  if (
    sample.x < 0 ||
    sample.y < 0 ||
    sample.width <= 0 ||
    sample.height <= 0 ||
    sample.x + sample.width > image.naturalWidth ||
    sample.y + sample.height > image.naturalHeight
  ) {
    throw new Error("Recognition fixture sample lies outside its image.");
  }
}

function translateDetectedPrice<
  Candidate extends Awaited<ReturnType<typeof recognizePriceEvidence>>[number]
>(candidate: Candidate, sample: Rectangle): Candidate {
  const translatePoint = ({ x, y }: Candidate["polygon"][number]) => ({
    x: x + sample.x,
    y: y + sample.y
  });
  return {
    ...candidate,
    box: {
      ...candidate.box,
      x: candidate.box.x + sample.x,
      y: candidate.box.y + sample.y
    },
    polygon: candidate.polygon.map(translatePoint)
  };
}

export function createBrowserRecognitionFixtureRunner({
  runtime = UNIVERSAL_RECOGNITION_RUNTIME,
  recognizer = createOcrRecognizer(runtime),
  createImage = () => new Image(),
  createCanvas = () => document.createElement("canvas")
}: {
  runtime?: RecognitionRuntimeConfiguration;
  recognizer?: OcrRecognizer;
  createImage?: () => HTMLImageElement;
  createCanvas?: () => HTMLCanvasElement;
} = {}) {
  let prepared = false;
  const observations: RecognizerObservation[] = [];
  const observingRecognizer: OcrRecognizer = {
    prepare: () => recognizer.prepare(),
    async recognize(image, passIdentity) {
      const recognized = await recognizer.recognize(image, passIdentity);
      observations.push(...recognized);
      return recognized;
    },
    terminate: () => recognizer.terminate()
  };

  return {
    async run(
      fixture: BrowserRecognitionFixture
    ): Promise<BrowserRecognitionFixtureResult> {
      if (!prepared) {
        await recognizer.prepare();
        prepared = true;
      }
      const image = await decodeFixtureImage(fixture.imageUrl, createImage);
      observations.length = 0;
      const samples = fixture.samples ?? [
        {
          x: 0,
          y: 0,
          width: image.naturalWidth,
          height: image.naturalHeight
        }
      ];
      const detectedPrices = [] as Awaited<
        ReturnType<typeof recognizePriceEvidence>
      >;
      for (const [index, sample] of samples.entries()) {
        assertSampleInsideImage(sample, image);
        const frame = imageCanvas(image, sample, createCanvas);
        const samplePrices = await recognizePriceEvidence(
          runtime,
          fixture.sourceCurrency,
          observingRecognizer,
          frame,
          {
            kind: "discovery",
            frameIdentity: `${fixture.id}:sample-${index.toString()}`
          }
        );
        detectedPrices.push(
          ...samplePrices.map((candidate) =>
            translateDetectedPrice(candidate, sample)
          )
        );
      }

      return {
        fixtureId: fixture.id,
        origin: fixture.origin,
        runtimeId: runtime.id,
        image: { width: image.naturalWidth, height: image.naturalHeight },
        observations: [...observations],
        detectedPrices
      };
    },

    async terminate(): Promise<void> {
      prepared = false;
      await recognizer.terminate();
    }
  };
}
