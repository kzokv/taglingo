import type { Rectangle } from "../domain/geometry";
import type { DetectedPrice } from "./priceLocalization";
import type { RecognitionProfile } from "./recognitionProfile";

interface Point {
  x: number;
  y: number;
}

declare const detectedPriceIdentityBrand: unique symbol;

export type DetectedPriceIdentity = string & {
  readonly [detectedPriceIdentityBrand]: true;
};

export interface TrackedDetectedPrice extends DetectedPrice {
  readonly identity: DetectedPriceIdentity;
}

export interface CandidateTrackingPass {
  readonly frameIdentity: string;
  readonly candidates: readonly DetectedPrice[];
  readonly coverage: Rectangle;
}

export interface CandidateTrackingSnapshot {
  readonly detectedPrices: TrackedDetectedPrice[];
  readonly focusedPrice: TrackedDetectedPrice | null;
  readonly explicitlyFocusedPriceIdentity: DetectedPriceIdentity | null;
  readonly hasUnstableCandidates: boolean;
}

export interface CandidateTracker {
  observe(
    pass: CandidateTrackingPass,
    currentCaptureGuideCenter?: Point
  ): CandidateTrackingSnapshot;
  select(identity: DetectedPriceIdentity): CandidateTrackingSnapshot;
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

function nearestTo(
  candidates: TrackedDetectedPrice[],
  point: Point
): TrackedDetectedPrice | undefined {
  const compareTie = (left: DetectedPrice, right: DetectedPrice) =>
    left.box.y - right.box.y ||
    left.box.x - right.box.x ||
    left.box.width - right.box.width ||
    left.box.height - right.box.height ||
    left.currency.localeCompare(right.currency) ||
    left.minorUnits - right.minorUnits;
  return candidates.reduce<TrackedDetectedPrice | undefined>(
    (current, candidate) => {
      if (!current) {
        return candidate;
      }
      const distanceDifference =
        distance(center(candidate.box), point) -
        distance(center(current.box), point);
      if (Math.abs(distanceDifference) <= 0.001) {
        return compareTie(candidate, current) < 0 ? candidate : current;
      }
      return distanceDifference < 0 ? candidate : current;
    },
    undefined
  );
}

interface CandidateTrack {
  readonly identity: DetectedPriceIdentity;
  readonly sequence: number;
  price: DetectedPrice;
  readonly observedFrames: Set<string>;
  coveredMisses: number;
}

function containsRegion(coverage: Rectangle, region: Rectangle): boolean {
  return (
    region.x >= coverage.x &&
    region.y >= coverage.y &&
    region.x + region.width <= coverage.x + coverage.width &&
    region.y + region.height <= coverage.y + coverage.height
  );
}

function areCandidatesCompatible(
  track: DetectedPrice,
  candidate: DetectedPrice,
  maximumDisplacementInTextHeights: number
): boolean {
  if (
    track.currency !== candidate.currency ||
    track.minorUnits !== candidate.minorUnits
  ) {
    return false;
  }
  const textHeight = Math.max(track.box.height, candidate.box.height);
  return (
    textHeight > 0 &&
    distance(center(track.box), center(candidate.box)) <=
      maximumDisplacementInTextHeights * textHeight
  );
}

function smoothRectangle(
  current: Rectangle,
  observed: Rectangle,
  smoothingFactor: number
): Rectangle {
  const smooth = (previous: number, next: number) =>
    previous + (next - previous) * smoothingFactor;
  return {
    x: smooth(current.x, observed.x),
    y: smooth(current.y, observed.y),
    width: smooth(current.width, observed.width),
    height: smooth(current.height, observed.height)
  };
}

export function createCandidateTracker(options: {
  captureGuideCenter: Point;
  geometry: RecognitionProfile["geometry"];
  stabilization: RecognitionProfile["stabilization"];
}): CandidateTracker {
  const tracks: CandidateTrack[] = [];
  let nextIdentity = 1;
  let explicitFocusIdentity: DetectedPriceIdentity | null = null;
  let lastGuideCenter = options.captureGuideCenter;

  const snapshot = (guideCenter: Point): CandidateTrackingSnapshot => {
    const detectedPrices = tracks
      .filter(
        ({ observedFrames }) =>
          observedFrames.size >=
          options.stabilization.requiredDistinctFrames
      )
      .map(({ identity, price }) => ({ ...price, identity }));
    const explicitlyFocused = detectedPrices.find(
      ({ identity }) => identity === explicitFocusIdentity
    );
    if (explicitFocusIdentity && !explicitlyFocused) {
      explicitFocusIdentity = null;
    }
    const focusedPrice =
      explicitlyFocused ?? nearestTo(detectedPrices, guideCenter);
    return {
      detectedPrices,
      focusedPrice: focusedPrice ?? null,
      explicitlyFocusedPriceIdentity: explicitFocusIdentity,
      hasUnstableCandidates: tracks.length > detectedPrices.length
    };
  };

  return {
    observe(pass, currentCaptureGuideCenter = options.captureGuideCenter) {
      lastGuideCenter = currentCaptureGuideCenter;
      const matchedTracks = new Set<CandidateTrack>();
      const matchedCandidateIndexes = new Set<number>();
      const compatibleTracksByCandidate = pass.candidates.map((candidate) =>
        tracks
          .filter((track) =>
            areCandidatesCompatible(
              track.price,
              candidate,
              options.geometry.maximumDisplacementInTextHeights
            )
          )
          .sort(
            (left, right) =>
              distance(center(left.price.box), center(candidate.box)) -
                distance(center(right.price.box), center(candidate.box)) ||
              left.sequence - right.sequence
          )
      );
      const matchedCandidateByTrack = new Map<CandidateTrack, number>();
      const assignCandidate = (
        candidateIndex: number,
        visitedTracks: Set<CandidateTrack>
      ): boolean => {
        for (const track of compatibleTracksByCandidate[candidateIndex]) {
          if (visitedTracks.has(track)) {
            continue;
          }
          visitedTracks.add(track);
          const previousCandidateIndex = matchedCandidateByTrack.get(track);
          if (
            previousCandidateIndex === undefined ||
            assignCandidate(previousCandidateIndex, visitedTracks)
          ) {
            matchedCandidateByTrack.set(track, candidateIndex);
            return true;
          }
        }
        return false;
      };
      const candidateOrder = pass.candidates
        .map((_candidate, candidateIndex) => candidateIndex)
        .sort(
          (leftIndex, rightIndex) =>
            compatibleTracksByCandidate[leftIndex].length -
              compatibleTracksByCandidate[rightIndex].length ||
            pass.candidates[leftIndex].box.y -
              pass.candidates[rightIndex].box.y ||
            pass.candidates[leftIndex].box.x -
              pass.candidates[rightIndex].box.x ||
            leftIndex - rightIndex
        );
      for (const candidateIndex of candidateOrder) {
        assignCandidate(candidateIndex, new Set());
      }
      for (const [track, candidateIndex] of matchedCandidateByTrack) {
        const candidate = pass.candidates[candidateIndex];
        matchedTracks.add(track);
        matchedCandidateIndexes.add(candidateIndex);
        track.coveredMisses = 0;
        track.price = {
          ...candidate,
          box: smoothRectangle(
            track.price.box,
            candidate.box,
            options.geometry.smoothingFactor
          )
        };
        if (
          track.observedFrames.size <
          options.stabilization.requiredDistinctFrames
        ) {
          track.observedFrames.add(pass.frameIdentity);
        }
      }
      pass.candidates.forEach((candidate, candidateIndex) => {
        if (!matchedCandidateIndexes.has(candidateIndex)) {
          const created = {
            identity:
              `detected-price-${nextIdentity.toString()}` as DetectedPriceIdentity,
            sequence: nextIdentity,
            price: candidate,
            observedFrames: new Set([pass.frameIdentity]),
            coveredMisses: 0
          };
          tracks.push(created);
          matchedTracks.add(created);
          nextIdentity += 1;
        }
      });
      for (const track of tracks) {
        if (
          !matchedTracks.has(track) &&
          containsRegion(pass.coverage, track.price.box)
        ) {
          track.coveredMisses += 1;
        }
      }
      for (let index = tracks.length - 1; index >= 0; index -= 1) {
        if (
          tracks[index].coveredMisses >=
          options.stabilization.coveredMissesBeforeRemoval
        ) {
          tracks.splice(index, 1);
        }
      }
      return snapshot(currentCaptureGuideCenter);
    },

    select(identity) {
      if (
        tracks.some(
          (track) =>
            track.identity === identity &&
            track.observedFrames.size >=
              options.stabilization.requiredDistinctFrames
        )
      ) {
        explicitFocusIdentity = identity;
      }
      return snapshot(lastGuideCenter);
    }
  };
}
