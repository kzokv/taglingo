import type { Rectangle } from "../domain/geometry";

export interface Size {
  width: number;
  height: number;
}

export interface CoverGeometry {
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
}

export function calculateCoverGeometry(
  camera: Size,
  preview: Size
): CoverGeometry {
  if (
    camera.width <= 0 ||
    camera.height <= 0 ||
    preview.width <= 0 ||
    preview.height <= 0
  ) {
    throw new RangeError("Camera and preview dimensions must be positive.");
  }

  const scale = Math.max(
    preview.width / camera.width,
    preview.height / camera.height
  );
  const renderedWidth = camera.width * scale;
  const renderedHeight = camera.height * scale;

  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (preview.width - renderedWidth) / 2,
    offsetY: (preview.height - renderedHeight) / 2
  };
}

export function mapSampleBoxToPreview(
  tokenBox: Rectangle,
  sampleRegion: Rectangle,
  camera: Size,
  preview: Size
): Rectangle {
  const geometry = calculateCoverGeometry(camera, preview);

  return {
    x: geometry.offsetX + (sampleRegion.x + tokenBox.x) * geometry.scale,
    y: geometry.offsetY + (sampleRegion.y + tokenBox.y) * geometry.scale,
    width: tokenBox.width * geometry.scale,
    height: tokenBox.height * geometry.scale
  };
}
