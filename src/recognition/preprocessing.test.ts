import { describe, expect, it } from "vitest";

import { createTestRecognitionProfile } from "../test/recognitionProfile";
import { preprocessRecognitionFrame } from "./preprocessing";

interface TestCanvas extends Pick<HTMLCanvasElement, "width" | "height"> {
  pixels: Uint8ClampedArray;
  getContext: HTMLCanvasElement["getContext"];
}

function canvas(
  width: number,
  height: number,
  pixels = new Uint8ClampedArray(width * height * 4)
): TestCanvas {
  const testCanvas: TestCanvas = {
    width,
    height,
    pixels,
    getContext: (() => ({
      getImageData: () => ({
        data: new Uint8ClampedArray(testCanvas.pixels),
        width: testCanvas.width,
        height: testCanvas.height,
        colorSpace: "srgb"
      }),
      createImageData: (nextWidth: number, nextHeight: number) => ({
        data: new Uint8ClampedArray(nextWidth * nextHeight * 4),
        width: nextWidth,
        height: nextHeight,
        colorSpace: "srgb"
      }),
      putImageData: (image: ImageData) => {
        testCanvas.pixels = new Uint8ClampedArray(image.data);
      }
    })) as unknown as HTMLCanvasElement["getContext"]
  };
  return testCanvas;
}

describe("Recognition preprocessing", () => {
  it("builds the frozen raw, scaled grayscale/contrast, and threshold variants", () => {
    const source = canvas(
      2,
      1,
      new Uint8ClampedArray([0, 0, 0, 255, 200, 100, 50, 255])
    );
    const created: TestCanvas[] = [];
    const profile = createTestRecognitionProfile();

    const variants = preprocessRecognitionFrame(
      source as unknown as HTMLCanvasElement,
      profile.preprocessing,
      {
        createCanvas: () => {
          const createdCanvas = canvas(0, 0);
          created.push(createdCanvas);
          return createdCanvas as unknown as HTMLCanvasElement;
        }
      }
    );

    expect(variants.map(({ identity }) => identity)).toEqual([
      "raw",
      "contrast",
      "threshold"
    ]);
    expect(variants.map(({ coordinateScale }) => coordinateScale)).toEqual([
      1,
      2,
      2
    ]);
    expect(variants[0].image).toBe(source);
    expect(variants.map(({ image }) => [image.width, image.height])).toEqual([
      [2, 1],
      [4, 2],
      [4, 2]
    ]);
    expect(created[0].pixels).toEqual(
      new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255,
        122, 122, 122, 255, 122, 122, 122, 255,
        0, 0, 0, 255, 0, 0, 0, 255,
        122, 122, 122, 255, 122, 122, 122, 255
      ])
    );
    expect(created[1].pixels).toEqual(
      new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255,
        255, 255, 255, 255, 255, 255, 255, 255,
        0, 0, 0, 255, 0, 0, 0, 255,
        255, 255, 255, 255, 255, 255, 255, 255
      ])
    );
  });
});
