import type { RecognitionPreprocessingStep } from "./recognitionProfile";

export interface PreprocessedRecognitionFrame {
  readonly identity: string;
  readonly image: HTMLCanvasElement;
  readonly coordinateScale: number;
}

function luminance(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4;
  return Math.round(
    data[offset] * 0.299 +
      data[offset + 1] * 0.587 +
      data[offset + 2] * 0.114
  );
}

function grayscalePixels(source: ImageData): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(source.width * source.height);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = luminance(source.data, index);
  }
  return pixels;
}

function contrasted(value: number, contrast: number): number {
  return Math.max(0, Math.min(255, Math.round((value - 128) * contrast + 128)));
}

function adaptiveThreshold(
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  windowSize: number,
  bias: number
): number {
  const radius = Math.floor(windowSize / 2);
  let total = 0;
  let count = 0;
  const firstY = Math.max(0, y - radius);
  const lastY = Math.min(height - 1, y + radius);
  const firstX = Math.max(0, x - radius);
  const lastX = Math.min(width - 1, x + radius);
  for (let sampleY = firstY; sampleY <= lastY; sampleY += 1) {
    for (let sampleX = firstX; sampleX <= lastX; sampleX += 1) {
      total += grayscale[sampleY * width + sampleX];
      count += 1;
    }
  }
  return grayscale[y * width + x] > total / count - bias ? 255 : 0;
}

function transformPixels(
  source: ImageData,
  step: Exclude<RecognitionPreprocessingStep, { operation: "raw" }>
): Uint8ClampedArray {
  const grayscale = grayscalePixels(source);
  if (step.operation === "grayscale-contrast") {
    return grayscale.map((value) => contrasted(value, step.contrast));
  }

  return grayscale.map((_value, index) =>
    adaptiveThreshold(
      grayscale,
      source.width,
      source.height,
      index % source.width,
      Math.floor(index / source.width),
      step.windowSize,
      step.bias
    )
  );
}

function createProcessedCanvas(
  source: ImageData,
  step: Exclude<RecognitionPreprocessingStep, { operation: "raw" }>,
  createCanvas: () => HTMLCanvasElement
): HTMLCanvasElement {
  const scale = step.scale;
  const output = createCanvas();
  output.width = Math.round(source.width * scale);
  output.height = Math.round(source.height * scale);
  const context = output.getContext("2d", {
    alpha: false,
    willReadFrequently: true
  });
  if (!context) {
    throw new Error("Recognition preprocessing requires a 2D canvas context.");
  }
  const image = context.createImageData(output.width, output.height);
  const transformed = transformPixels(source, step);

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
      const sourceIndex = sourceY * source.width + sourceX;
      const value = transformed[sourceIndex];
      const outputOffset = (y * output.width + x) * 4;
      image.data[outputOffset] = value;
      image.data[outputOffset + 1] = value;
      image.data[outputOffset + 2] = value;
      image.data[outputOffset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return output;
}

export function preprocessRecognitionFrame(
  frame: HTMLCanvasElement,
  portfolio: readonly RecognitionPreprocessingStep[],
  {
    createCanvas = () => document.createElement("canvas")
  }: { createCanvas?: () => HTMLCanvasElement } = {}
): PreprocessedRecognitionFrame[] {
  const requiresPixels = portfolio.some(({ operation }) => operation !== "raw");
  const context = requiresPixels
    ? frame.getContext("2d", { alpha: false, willReadFrequently: true })
    : null;
  if (requiresPixels && !context) {
    throw new Error("Recognition preprocessing requires a 2D canvas context.");
  }
  const source = context?.getImageData(0, 0, frame.width, frame.height);

  return portfolio.map((step) => ({
    identity: step.id,
    coordinateScale: step.operation === "raw" ? 1 : step.scale,
    image:
      step.operation === "raw"
        ? frame
        : createProcessedCanvas(source!, step, createCanvas)
  }));
}
