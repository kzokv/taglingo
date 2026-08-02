// PROTOTYPE: pure recognition-architecture state model. No I/O or persistence.

export const ARCHITECTURES = {
  A: {
    key: "A",
    name: "Evidence-gated single engine",
    enginePolicy: "One benchmark winner per Source Currency",
    jpyEngine: "PaddleOCR.js · PP-OCRv6 small",
    rawPayload: "~54.2 MB challenger baseline",
    frequentPass: "Capture Guide · numeric + marker evidence",
    discoveryPass: "Full preview every fourth pass",
    preprocessing: "Bounded raw / contrast / threshold portfolio",
    fusion: "Amount + Source-Currency marker by line and geometry",
    confidence: "Hard evidence gates; minimum contributing confidence",
    scheduling: "Newest frame only · atomic result · generation guard",
    tradeoff: "More TagLingo fusion logic; handles split marker evidence"
  },
  B: {
    key: "B",
    name: "Monolithic price-line parser",
    enginePolicy: "One benchmark winner per Source Currency",
    jpyEngine: "PaddleOCR.js · PP-OCRv6 small",
    rawPayload: "~54.2 MB challenger baseline",
    frequentPass: "Capture Guide · complete OCR lines only",
    discoveryPass: "Full preview every fourth pass",
    preprocessing: "One selected preprocessing variant",
    fusion: "No cross-line fusion; marker must share the amount line",
    confidence: "Complete line threshold, then strict price parser",
    scheduling: "Newest frame only · atomic result · generation guard",
    tradeoff: "Simplest pipeline; loses valid split amount/marker evidence"
  },
  C: {
    key: "C",
    name: "Dual-engine consensus",
    enginePolicy: "Paddle and Tesseract loaded together",
    jpyEngine: "PP-OCRv6 small + Tesseract.js 7",
    rawPayload: "~60.7 MB before duplicated runtime memory",
    frequentPass: "Capture Guide through both engines",
    discoveryPass: "Full preview through both engines",
    preprocessing: "Shared bounded preprocessing portfolio",
    fusion: "Exact value + overlapping geometry must agree by engine",
    confidence: "Minimum confidence across engine candidates",
    scheduling: "Two in-flight engines · joined atomic result",
    tradeoff: "Strong consensus; doubled work and segmentation deadlocks"
  }
};

const BOXES = {
  mainAmount: { x: 40, y: 30, width: 125, height: 34 },
  mainMarker: { x: 168, y: 31, width: 24, height: 32 },
  mainCombined: { x: 40, y: 30, width: 152, height: 34 },
  secondCombined: { x: 220, y: 105, width: 95, height: 30 },
  wrongCombined: { x: 42, y: 30, width: 150, height: 34 }
};

const CAPTURE_GUIDE = { x: 20, y: 10, width: 190, height: 90 };
const FULL_PREVIEW = { x: 0, y: 0, width: 360, height: 180 };

const observation = (overrides) => ({
  engine: "paddle-v6-small",
  variant: "raw",
  kind: "combined",
  currency: "JPY",
  minorUnits: 58980,
  text: "58,980円",
  confidence: 0.9,
  box: BOXES.mainCombined,
  negativeContext: false,
  ...overrides
});

export const SCENARIOS = {
  correct: {
    key: "correct",
    name: "valid complete JPY price",
    description: "Both engines agree on 58,980円 in the Capture Guide.",
    coverage: CAPTURE_GUIDE,
    observations: [
      observation({ engine: "paddle-v6-small", confidence: 0.93 }),
      observation({ engine: "tesseract-7", confidence: 0.82 })
    ]
  },
  split: {
    key: "split",
    name: "split amount and marker",
    description: "Paddle emits 58,980 and 円 as aligned polygons; Tesseract sees only the amount.",
    coverage: CAPTURE_GUIDE,
    observations: [
      observation({ kind: "amount", text: "58,980", box: BOXES.mainAmount, confidence: 0.94 }),
      observation({ kind: "marker", text: "円", minorUnits: null, box: BOXES.mainMarker, confidence: 0.88 }),
      observation({ engine: "tesseract-7", kind: "amount", text: "58,980", box: BOXES.mainAmount, confidence: 0.78 })
    ]
  },
  markerless: {
    key: "markerless",
    name: "markerless shelf numeral",
    description: "A high-confidence 58,980 appears with no Source-Currency marker.",
    coverage: CAPTURE_GUIDE,
    observations: [
      observation({ kind: "amount", text: "58,980", box: BOXES.mainAmount, confidence: 0.97 }),
      observation({ engine: "tesseract-7", kind: "amount", text: "58,980", box: BOXES.mainAmount, confidence: 0.91 })
    ]
  },
  hallucination: {
    key: "hallucination",
    name: "one-pass wrong value",
    description: "Only Paddle reports 59,880円 for one recognition pass.",
    coverage: CAPTURE_GUIDE,
    observations: [
      observation({ minorUnits: 59880, text: "59,880円", box: BOXES.wrongCombined, confidence: 0.91 })
    ]
  },
  multiple: {
    key: "multiple",
    name: "two stable shelf prices",
    description: "Both engines agree on 58,980円 and 980円 at separate positions.",
    coverage: FULL_PREVIEW,
    observations: [
      observation({ engine: "paddle-v6-small", confidence: 0.93 }),
      observation({ engine: "tesseract-7", confidence: 0.82 }),
      observation({ engine: "paddle-v6-small", minorUnits: 980, text: "980円", box: BOXES.secondCombined, confidence: 0.89 }),
      observation({ engine: "tesseract-7", minorUnits: 980, text: "980円", box: BOXES.secondCombined, confidence: 0.8 })
    ]
  },
  negative: {
    key: "negative",
    name: "non-price numeral",
    description: "50円-like OCR is adjacent to percentage/item-number negative evidence.",
    coverage: CAPTURE_GUIDE,
    observations: [
      observation({ minorUnits: 50, text: "50円", confidence: 0.96, negativeContext: true }),
      observation({ engine: "tesseract-7", minorUnits: 50, text: "50円", confidence: 0.9, negativeContext: true })
    ]
  },
  guideMiss: {
    key: "guideMiss",
    name: "Capture Guide miss",
    description: "The Guide pass sees no price; off-guide discoveries are not aged.",
    coverage: CAPTURE_GUIDE,
    observations: []
  },
  discoveryMiss: {
    key: "discoveryMiss",
    name: "full-preview discovery miss",
    description: "The discovery pass covers every last-known price region and finds none.",
    coverage: FULL_PREVIEW,
    observations: []
  }
};

function center(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function overlaps(left, right) {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

function containsCenter(coverage, box) {
  const point = center(box);
  return point.x >= coverage.x && point.x <= coverage.x + coverage.width &&
    point.y >= coverage.y && point.y <= coverage.y + coverage.height;
}

function smoothBox(previous, observed) {
  const blend = (left, right) => left + Math.max(-8, Math.min(8, (right - left) * 0.25));
  return {
    x: blend(previous.x, observed.x),
    y: blend(previous.y, observed.y),
    width: blend(previous.width, observed.width),
    height: blend(previous.height, observed.height)
  };
}

function associated(left, right) {
  if (left.currency !== right.currency || left.minorUnits !== right.minorUnits) return false;
  if (overlaps(left.box, right.box)) return true;
  const a = center(left.box);
  const b = center(right.box);
  return Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(left.box.width, right.box.width);
}

function union(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottom = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: rightEdge - x, height: bottom - y };
}

function aligned(left, right) {
  const verticalOverlap = Math.min(left.box.y + left.box.height, right.box.y + right.box.height) - Math.max(left.box.y, right.box.y);
  const gap = Math.max(0, right.box.x - (left.box.x + left.box.width), left.box.x - (right.box.x + right.box.width));
  return verticalOverlap > 0 && gap <= Math.max(left.box.height, right.box.height) * 1.5;
}

function candidateFromCombined(item) {
  if (item.kind !== "combined" || item.negativeContext || item.confidence < 0.65) return null;
  return {
    currency: item.currency,
    minorUnits: item.minorUnits,
    confidence: item.confidence,
    box: item.box,
    evidence: `${item.engine}:${item.variant}:complete-line`
  };
}

function evidenceGatedCandidates(observations) {
  const paddle = observations.filter(({ engine }) => engine === "paddle-v6-small");
  const candidates = paddle.map(candidateFromCombined).filter(Boolean);
  const amounts = paddle.filter(({ kind, negativeContext, confidence }) => kind === "amount" && !negativeContext && confidence >= 0.65);
  const markers = paddle.filter(({ kind, negativeContext, confidence }) => kind === "marker" && !negativeContext && confidence >= 0.65);
  for (const amount of amounts) {
    const marker = markers.find((item) => item.currency === amount.currency && aligned(amount, item));
    if (!marker) continue;
    candidates.push({
      currency: amount.currency,
      minorUnits: amount.minorUnits,
      confidence: Math.min(amount.confidence, marker.confidence),
      box: union(amount.box, marker.box),
      evidence: `${amount.engine}:${amount.variant}:amount+marker-geometry`
    });
  }
  return candidates;
}

function monolithicCandidates(observations) {
  return observations
    .filter(({ engine }) => engine === "paddle-v6-small")
    .map(candidateFromCombined)
    .filter(Boolean);
}

function consensusCandidates(observations) {
  const paddle = observations.filter(({ engine }) => engine === "paddle-v6-small").map(candidateFromCombined).filter(Boolean);
  const tesseract = observations.filter(({ engine }) => engine === "tesseract-7").map(candidateFromCombined).filter(Boolean);
  return paddle.flatMap((left) => {
    const right = tesseract.find((item) => associated(left, item));
    return right ? [{
      ...left,
      confidence: Math.min(left.confidence, right.confidence),
      box: union(left.box, right.box),
      evidence: "paddle-v6-small+tesseract-7:consensus"
    }] : [];
  });
}

function candidatesFor(architecture, observations) {
  if (architecture === "B") return monolithicCandidates(observations);
  if (architecture === "C") return consensusCandidates(observations);
  return evidenceGatedCandidates(observations);
}

function trackId(candidate) {
  const c = center(candidate.box);
  return `${candidate.currency}:${candidate.minorUnits}:${Math.round(c.x / 40)}:${Math.round(c.y / 40)}`;
}

function chooseFocused(detected, explicitFocusId) {
  if (explicitFocusId) {
    const explicit = detected.find(({ id }) => id === explicitFocusId);
    if (explicit) return explicit.id;
  }
  const reticle = { x: 160, y: 80 };
  return detected.reduce((best, item) => {
    if (!best) return item;
    const itemCenter = center(item.box);
    const bestCenter = center(best.box);
    return Math.hypot(itemCenter.x - reticle.x, itemCenter.y - reticle.y) <
      Math.hypot(bestCenter.x - reticle.x, bestCenter.y - reticle.y) ? item : best;
  }, null)?.id ?? null;
}

export function createPrototypeState(architecture = "A") {
  return {
    architecture,
    pass: 0,
    phase: "Searching",
    lastScenario: "none",
    lastDescription: "No OCR observation has been submitted.",
    rawObservationCount: 0,
    admissibleCandidates: [],
    tracks: [],
    detectedPrices: [],
    focusedPriceId: null,
    explicitFocusId: null,
    profile: "JPY · iOS/Android candidate · paddle-v6-small@audited-assets",
    generation: 1,
    decision: "Waiting for evidence"
  };
}

export function switchArchitecture(state, architecture) {
  return createPrototypeState(architecture);
}

export function selectNextDetectedPrice(state) {
  if (state.detectedPrices.length === 0) return state;
  const current = state.explicitFocusId ?? state.focusedPriceId;
  const index = state.detectedPrices.findIndex(({ id }) => id === current);
  const selected = state.detectedPrices[(index + 1 + state.detectedPrices.length) % state.detectedPrices.length];
  return {
    ...state,
    explicitFocusId: selected.id,
    focusedPriceId: selected.id,
    decision: `Shopper explicitly selected ${selected.currency} ${selected.minorUnits.toLocaleString("en-US")}`
  };
}

export function observeScenario(state, scenarioKey) {
  const scenario = SCENARIOS[scenarioKey];
  const candidates = candidatesFor(state.architecture, scenario.observations);
  const tracks = state.tracks.map((track) => ({
    ...track,
    misses: containsCenter(scenario.coverage, track.box)
      ? track.misses + 1
      : track.misses
  }));

  for (const candidate of candidates) {
    let track = tracks.find((item) => associated(item, candidate));
    if (track) {
      track.hits += 1;
      track.misses = 0;
      track.confidence = Math.min(track.confidence, candidate.confidence);
      track.evidence = candidate.evidence;
      track.box = smoothBox(track.box, candidate.box);
    } else {
      track = { ...candidate, id: trackId(candidate), hits: 1, misses: 0 };
      tracks.push(track);
    }
  }

  const retainedTracks = tracks.filter(({ misses, hits }) => hits >= 2 ? misses <= 2 : misses === 0);
  const detectedPrices = retainedTracks
    .filter(({ hits }) => hits >= 2)
    .map((track) => ({ ...track }));
  const explicitFocusId = detectedPrices.some(({ id }) => id === state.explicitFocusId)
    ? state.explicitFocusId
    : null;
  const focusedPriceId = chooseFocused(detectedPrices, explicitFocusId);
  const newStableCount = detectedPrices.filter(({ id }) =>
    !state.detectedPrices.some((previous) => previous.id === id)
  ).length;
  const removedStableCount = state.detectedPrices.filter(({ id }) =>
    !detectedPrices.some((current) => current.id === id)
  ).length;
  const rejected = candidates.length === 0 && scenario.observations.length > 0;
  const retainedOnMiss = detectedPrices.length > 0 && candidates.length === 0;
  const decision = newStableCount > 0
    ? `${newStableCount} candidate${newStableCount === 1 ? "" : "s"} became stable after repeated evidence`
    : removedStableCount > 0
      ? `${removedStableCount} stable Detection Outline${removedStableCount === 1 ? "" : "s"} removed after three covered misses`
    : retainedOnMiss
      ? "Stable Detection Outlines retained through this miss"
      : rejected
        ? "Observations rejected before stabilization"
        : candidates.length > 0
          ? "Compatible evidence is pending a second pass"
          : "No admissible evidence";

  return {
    ...state,
    pass: state.pass + 1,
    phase: focusedPriceId ? "Focused" : candidates.length > 0 ? "Stabilizing" : "Searching",
    lastScenario: scenario.name,
    lastDescription: scenario.description,
    rawObservationCount: scenario.observations.length,
    admissibleCandidates: candidates,
    tracks: retainedTracks,
    detectedPrices,
    explicitFocusId,
    focusedPriceId,
    decision
  };
}

export function architectureVerdict(architecture) {
  if (architecture === "A") return "RECOMMENDED — one engine/profile, split-evidence recovery, hard gates";
  if (architecture === "B") return "TOO BRITTLE — simple, but valid split markers never become prices";
  return "TOO EXPENSIVE — consensus helps hallucinations but duplicates heavy runtimes";
}
