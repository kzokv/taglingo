import type { Rectangle } from "../domain/geometry";
import type { DetectedPrice } from "./priceLocalization";

interface Point {
  x: number;
  y: number;
}

export interface FocusTracker {
  observe(
    candidates: DetectedPrice[],
    currentReticle?: Point
  ): DetectedPrice | null;
}

function center(box: Rectangle): Point {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function overlaps(left: Rectangle, right: Rectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export function areDetectedPricesAssociated(
  left: DetectedPrice,
  right: DetectedPrice
): boolean {
  if (
    left.currency !== right.currency ||
    left.minorUnits !== right.minorUnits
  ) {
    return false;
  }

  const maximumCenterShift =
    Math.max(left.box.width, left.box.height, right.box.width, right.box.height) /
    2;
  return (
    overlaps(left.box, right.box) ||
    distance(center(left.box), center(right.box)) <= maximumCenterShift
  );
}

function nearestTo(
  candidates: DetectedPrice[],
  point: Point,
  preferred: DetectedPrice | null
): DetectedPrice | undefined {
  const stableTieKey = (price: DetectedPrice) =>
    [
      price.box.x,
      price.box.y,
      price.box.width,
      price.box.height,
      price.currency,
      price.minorUnits
    ].join(":");
  const nearest = candidates.reduce<DetectedPrice | undefined>(
    (current, candidate) => {
      if (!current) {
        return candidate;
      }
      const distanceDifference =
        distance(center(candidate.box), point) -
        distance(center(current.box), point);
      if (Math.abs(distanceDifference) <= 0.001) {
        return stableTieKey(candidate) < stableTieKey(current)
          ? candidate
          : current;
      }
      return distanceDifference < 0 ? candidate : current;
    },
    undefined
  );
  const preferredCandidate =
    preferred &&
    candidates.find((candidate) =>
      areDetectedPricesAssociated(preferred, candidate)
    );
  if (!nearest || !preferredCandidate) {
    return nearest;
  }

  const hysteresis =
    Math.max(preferredCandidate.box.width, preferredCandidate.box.height) * 0.1;
  return distance(center(preferredCandidate.box), point) <=
    distance(center(nearest.box), point) + hysteresis
    ? preferredCandidate
    : nearest;
}

export function createFocusTracker({
  reticle
}: {
  reticle: Point;
}): FocusTracker {
  let pending: { candidate: DetectedPrice; observations: number } | null = null;
  let focusedPrice: DetectedPrice | null = null;
  let consecutiveMisses = 0;

  return {
    observe(candidates, currentReticle = reticle) {
      const selected = nearestTo(
        candidates,
        currentReticle,
        focusedPrice ?? pending?.candidate ?? null
      );
      if (!selected) {
        pending = null;
        consecutiveMisses += 1;
        if (consecutiveMisses > 2) {
          focusedPrice = null;
        }
        return focusedPrice;
      }
      consecutiveMisses = 0;

      if (
        focusedPrice &&
        areDetectedPricesAssociated(focusedPrice, selected)
      ) {
        focusedPrice = selected;
        pending = null;
        return focusedPrice;
      }

      if (
        pending &&
        areDetectedPricesAssociated(pending.candidate, selected)
      ) {
        pending = {
          candidate: selected,
          observations: pending.observations + 1
        };
      } else {
        pending = { candidate: selected, observations: 1 };
      }

      if (pending.observations >= 2) {
        focusedPrice = selected;
        pending = null;
      }

      return focusedPrice;
    }
  };
}
