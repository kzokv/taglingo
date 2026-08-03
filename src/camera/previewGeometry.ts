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

export function mapPreviewRegionToCamera(
  previewRegion: Rectangle,
  camera: Size,
  preview: Size
): Rectangle | null {
  const geometry = calculateCoverGeometry(camera, preview);
  const visibleLeft = Math.max(0, previewRegion.x);
  const visibleTop = Math.max(0, previewRegion.y);
  const visibleRight = Math.min(
    preview.width,
    previewRegion.x + previewRegion.width
  );
  const visibleBottom = Math.min(
    preview.height,
    previewRegion.y + previewRegion.height
  );
  if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
    return null;
  }

  const cameraLeft = Math.max(
    0,
    Math.floor((visibleLeft - geometry.offsetX) / geometry.scale)
  );
  const cameraTop = Math.max(
    0,
    Math.floor((visibleTop - geometry.offsetY) / geometry.scale)
  );
  const cameraRight = Math.min(
    camera.width,
    Math.ceil((visibleRight - geometry.offsetX) / geometry.scale)
  );
  const cameraBottom = Math.min(
    camera.height,
    Math.ceil((visibleBottom - geometry.offsetY) / geometry.scale)
  );

  if (cameraRight <= cameraLeft || cameraBottom <= cameraTop) {
    return null;
  }
  return {
    x: cameraLeft,
    y: cameraTop,
    width: cameraRight - cameraLeft,
    height: cameraBottom - cameraTop
  };
}
