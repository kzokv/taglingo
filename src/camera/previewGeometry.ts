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
