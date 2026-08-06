import type { Rectangle } from "../domain/geometry";
import type {
  CandidateOutlineState,
  DetectedPriceIdentity,
  DetectionOutlineState,
  PriceEvidenceTrackIdentity
} from "../domain/priceEvidenceLifecycle";
import type { RecognitionPassIdentity } from "./ocrRecognizer";
import type { DetectedPrice } from "./priceLocalization";
import type { FixedRecognitionRules } from "./recognitionRuntime";

interface Point {
  x: number;
  y: number;
}

export type {
  DetectedPriceIdentity,
  PriceEvidenceTrackIdentity
} from "../domain/priceEvidenceLifecycle";

export interface TrackedDetectedPrice extends DetectedPrice {
  readonly identity: DetectedPriceIdentity;
  readonly state: DetectionOutlineState;
}

export interface CandidateOutline {
  readonly identity: PriceEvidenceTrackIdentity;
  readonly state: CandidateOutlineState;
  readonly label: "Possible price";
  readonly box: Rectangle;
  readonly expiresAtMs: number;
}

export interface CandidateTrackingPass {
  readonly frameIdentity: string;
  readonly kind: RecognitionPassIdentity["kind"];
  readonly candidates: readonly DetectedPrice[];
  readonly coverage: Rectangle;
  readonly observedAtMs: number;
}

export interface CandidateTrackingSnapshot {
  readonly candidateOutlines: CandidateOutline[];
  readonly detectedPrices: TrackedDetectedPrice[];
  readonly focusedPrice: TrackedDetectedPrice | null;
  readonly explicitlyFocusedPriceIdentity: DetectedPriceIdentity | null;
  readonly hasUnstableCandidates: boolean;
  readonly corroborationKind: RecognitionPassIdentity["kind"] | null;
}

export interface CandidateTracker {
  observe(
    pass: CandidateTrackingPass,
    currentCaptureGuide?: Rectangle
  ): CandidateTrackingSnapshot;
  advanceTime(observedAtMs: number): CandidateTrackingSnapshot;
  select(identity: DetectedPriceIdentity): CandidateTrackingSnapshot;
  resumeAutomaticFocus(): CandidateTrackingSnapshot;
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
  point: Point,
  stableSpatialOrder: ReadonlyMap<DetectedPriceIdentity, number>
): TrackedDetectedPrice | undefined {
  return candidates.reduce<TrackedDetectedPrice | undefined>(
    (current, candidate) => {
      if (!current) {
        return candidate;
      }
      const distanceDifference =
        distance(center(candidate.box), point) -
        distance(center(current.box), point);
      if (Math.abs(distanceDifference) <= 0.001) {
        return (stableSpatialOrder.get(candidate.identity) ?? Infinity) <
          (stableSpatialOrder.get(current.identity) ?? Infinity)
          ? candidate
          : current;
      }
      return distanceDifference < 0 ? candidate : current;
    },
    undefined
  );
}

function rectangleCenter(rectangle: Rectangle): Point {
  return center(rectangle);
}

function isInsideFocusTargetTolerance(
  price: TrackedDetectedPrice,
  captureGuide: Rectangle
): boolean {
  const target = rectangleCenter(captureGuide);
  const priceCenter = center(price.box);
  const toleranceWidth = Math.max(44, captureGuide.width * 0.2);
  const toleranceHeight = Math.max(44, captureGuide.height * 0.3);
  return (
    Math.abs(priceCenter.x - target.x) <= toleranceWidth &&
    Math.abs(priceCenter.y - target.y) <= toleranceHeight
  );
}

function sameIdentityMembership(
  left: readonly DetectedPriceIdentity[],
  right: readonly DetectedPriceIdentity[]
): boolean {
  return (
    left.length === right.length &&
    left.every((identity) => right.includes(identity))
  );
}

interface CandidateTrack {
  readonly identity: PriceEvidenceTrackIdentity;
  readonly sequence: number;
  price: DetectedPrice;
  readonly observedFrames: Set<string>;
  readonly expiresAtMs: number;
  readonly corroborationKind: RecognitionPassIdentity["kind"];
  coveredMisses: number;
}

export const CANDIDATE_OUTLINE_LIFETIME_MS = 1_500;

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
  return (
    hasCompatibleAmount(track, candidate) &&
    hasCompatibleGeometry(
      track,
      candidate,
      maximumDisplacementInTextHeights
    )
  );
}

function hasCompatibleAmount(
  track: DetectedPrice,
  candidate: DetectedPrice
): boolean {
  return (
    track.currency === candidate.currency &&
    track.minorUnits === candidate.minorUnits
  );
}

function hasCompatibleGeometry(
  track: DetectedPrice,
  candidate: DetectedPrice,
  maximumDisplacementInTextHeights: number
): boolean {
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

function removeExpiredCandidateTracks(
  tracks: CandidateTrack[],
  requiredDistinctFrames: number,
  cutoffTimeMs: number
): void {
  for (let index = tracks.length - 1; index >= 0; index -= 1) {
    if (
      tracks[index].observedFrames.size < requiredDistinctFrames &&
      tracks[index].expiresAtMs <= cutoffTimeMs
    ) {
      tracks.splice(index, 1);
    }
  }
}

export function createCandidateTracker(options: {
  captureGuide: Rectangle;
  geometry: FixedRecognitionRules["geometry"];
  stabilization: FixedRecognitionRules["stabilization"];
}): CandidateTracker {
  const tracks: CandidateTrack[] = [];
  let nextIdentity = 1;
  let explicitFocusIdentity: DetectedPriceIdentity | null = null;
  let automaticFocusIdentity: DetectedPriceIdentity | null = null;
  let lastCaptureGuide = options.captureGuide;
  let orderedMembership: DetectedPriceIdentity[] = [];
  let currentTimeMs = Number.NEGATIVE_INFINITY;

  const snapshot = (captureGuide: Rectangle): CandidateTrackingSnapshot => {
    const candidateOutlines = tracks
      .filter(
        ({ observedFrames, expiresAtMs }) =>
          observedFrames.size < options.stabilization.requiredDistinctFrames &&
          expiresAtMs > currentTimeMs
      )
      .map(({ identity, price, expiresAtMs }) => ({
        identity,
        state: "candidate" as const,
        label: "Possible price" as const,
        box: price.box,
        expiresAtMs
      }));
    const detectedPrices = tracks
      .filter(
        ({ observedFrames }) =>
          observedFrames.size >=
          options.stabilization.requiredDistinctFrames
      )
      .map(({ identity, price, coveredMisses }) => ({
        ...price,
        identity: identity as DetectedPriceIdentity,
        state: coveredMisses > 0 ? ("held" as const) : ("fresh" as const)
      }));
    const explicitlyFocused = detectedPrices.find(
      ({ identity }) => identity === explicitFocusIdentity
    );
    if (explicitFocusIdentity && !explicitlyFocused) {
      explicitFocusIdentity = null;
    }
    const currentMembership = detectedPrices.map(({ identity }) => identity);
    if (!sameIdentityMembership(orderedMembership, currentMembership)) {
      orderedMembership = [...detectedPrices]
        .sort(
          (left, right) =>
            left.box.y - right.box.y ||
            left.box.x - right.box.x ||
            left.identity.localeCompare(right.identity)
        )
        .map(({ identity }) => identity);
    }
    const stableSpatialOrder = new Map(
      orderedMembership.map((identity, index) => [identity, index])
    );
    const eligibleFreshPrices = detectedPrices.filter(
      (price) =>
        price.state === "fresh" &&
        isInsideFocusTargetTolerance(price, captureGuide)
    );
    const nearestEligible = nearestTo(
      eligibleFreshPrices,
      rectangleCenter(captureGuide),
      stableSpatialOrder
    );
    const retainedHeldFocus = detectedPrices.find(
      ({ identity, state }) =>
        identity === automaticFocusIdentity && state === "held"
    );
    const automaticallyFocused = nearestEligible ?? retainedHeldFocus;
    automaticFocusIdentity = automaticallyFocused?.identity ?? null;
    const focusedPrice = explicitlyFocused ?? automaticallyFocused;
    return {
      candidateOutlines,
      detectedPrices,
      focusedPrice: focusedPrice ?? null,
      explicitlyFocusedPriceIdentity: explicitFocusIdentity,
      hasUnstableCandidates: candidateOutlines.length > 0,
      corroborationKind:
        tracks.find(
          ({ observedFrames, expiresAtMs }) =>
            observedFrames.size <
              options.stabilization.requiredDistinctFrames &&
            expiresAtMs > currentTimeMs
        )?.corroborationKind ?? null
    };
  };

  return {
    observe(pass, currentCaptureGuide = options.captureGuide) {
      lastCaptureGuide = currentCaptureGuide;
      currentTimeMs = Math.max(currentTimeMs, pass.observedAtMs);
      removeExpiredCandidateTracks(
        tracks,
        options.stabilization.requiredDistinctFrames,
        pass.observedAtMs
      );
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
      const promotedTracks = new Set<CandidateTrack>();
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
        const wasDetected =
          track.observedFrames.size >=
          options.stabilization.requiredDistinctFrames;
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
        if (
          !wasDetected &&
          track.observedFrames.size >=
            options.stabilization.requiredDistinctFrames
        ) {
          promotedTracks.add(track);
        }
      }
      const promoted = [...promotedTracks];
      for (let index = tracks.length - 1; index >= 0; index -= 1) {
        const track = tracks[index];
        if (
          !promotedTracks.has(track) &&
          track.observedFrames.size >=
            options.stabilization.requiredDistinctFrames &&
          promoted.some(
            (promotedTrack) =>
              hasCompatibleGeometry(
                track.price,
                promotedTrack.price,
                options.geometry.maximumDisplacementInTextHeights
              ) &&
              !hasCompatibleAmount(track.price, promotedTrack.price)
          )
        ) {
          tracks.splice(index, 1);
        }
      }
      pass.candidates.forEach((candidate, candidateIndex) => {
        if (!matchedCandidateIndexes.has(candidateIndex)) {
          for (let index = tracks.length - 1; index >= 0; index -= 1) {
            const track = tracks[index];
            if (
              track.observedFrames.size <
                options.stabilization.requiredDistinctFrames &&
              !matchedTracks.has(track) &&
              hasCompatibleGeometry(
                track.price,
                candidate,
                options.geometry.maximumDisplacementInTextHeights
              )
            ) {
              tracks.splice(index, 1);
            }
          }
          const created = {
            identity:
              `detected-price-${nextIdentity.toString()}` as PriceEvidenceTrackIdentity,
            sequence: nextIdentity,
            price: candidate,
            observedFrames: new Set([pass.frameIdentity]),
            expiresAtMs:
              pass.observedAtMs + CANDIDATE_OUTLINE_LIFETIME_MS,
            corroborationKind: pass.kind,
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
      return snapshot(currentCaptureGuide);
    },

    advanceTime(observedAtMs) {
      currentTimeMs = Math.max(currentTimeMs, observedAtMs);
      removeExpiredCandidateTracks(
        tracks,
        options.stabilization.requiredDistinctFrames,
        currentTimeMs
      );
      return snapshot(lastCaptureGuide);
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
      return snapshot(lastCaptureGuide);
    },

    resumeAutomaticFocus() {
      explicitFocusIdentity = null;
      return snapshot(lastCaptureGuide);
    }
  };
}
