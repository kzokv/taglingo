# Mobile performance qualification

Camera performance eligibility is decided for one frozen recognition profile,
Source Currency, physical platform, device, and browser block at a time. Results
from another profile, platform, metric, or sustained run never offset a failure.
Manual Price Entry remains available for every failure or missing measurement.

The contract is exposed by `src/qualification/qualificationHarness.ts`:

- `createPerformanceQualificationEvidence` validates, clones, and freezes one
  evidence block against its qualification manifest.
- `scorePerformanceQualification` calculates every performance gate and reports
  every failing or missing measurement.
- `scoreProfileQualification` combines reliability and performance with a strict
  AND. Physical performance cannot compensate for reliability, and reliability
  cannot compensate for performance.

## Physical collection protocol

Use the fixed 10 Mbps download / 150 ms RTT profile. Record 30 uncached starts
and 30 cached starts. Each start records when both the app shell and Manual Price
Entry are interactive, when preview appears after permission, and when the
selected recognition profile is ready.

Create exactly one performance trial for each of the same 299 held-out fixture
IDs used by the reliability run. Every trial binds its measurements to the
fixture ID, a unique trial ID, capture timestamp, and SHA-256 capture-artifact
hash, and records:

- Capture Guide and full-preview discovery pass durations;
- Searching/Stabilizing and Focused completion intervals for both pass kinds;
- yields between completed passes; and
- an explicit Focused/not-Focused terminal outcome and, when Focused, stable
  Focused Price latency and Focused-state cadence.

Every trial needs Guide, discovery, Searching/Stabilizing, and yield samples.
Focused measurements are required exactly when the trial says it reached the
Focused state. At least 108 positive fixtures must reach that state, matching the
minimum successful-positive gate, while the other positive and all negative
fixtures still carry an explicit terminal outcome. Reliability and performance
records for all 299 fixtures must share the same trial ID, capture timestamp, and
artifact hash, and their observed focus outcome and first-focus timing must
agree. The scorer requires exact fixture coverage and unique capture identities.
It does not reject independent captures merely because their numeric readings
happen to be identical.

Record first-install transfer and cached storage. Then conduct three
non-overlapping runs of at least ten minutes. Each has a
unique run ID, time span, and SHA-256 capture-artifact hash. A checkpoint is
required at start and every minute through minute 10, with no gap greater than
one minute through the end of a longer run. Every checkpoint records preview
FPS, recognition duration, memory, cumulative battery percentage points, and
crash, reload, thermal-warning, camera-interruption, and forced-recovery counts
since the prior checkpoint.

The artifact hashes identify the independently retained, content-free harness
exports used to produce each trial or run. Reviewers can compare those exports
with the frozen report without placing camera frames, OCR text, prices, or raw
coordinates in qualification evidence.

The scorer uses nearest-rank p95. In each sustained run independently, it derives
peak memory above that run's preview baseline, minute-2-to-minute-10 growth,
final-versus-minutes-2–4 p95 slowdown, and hourly battery drain. It rejects
overlapping run spans and reused run IDs or artifact hashes. Independent runs
may legitimately produce identical numeric telemetry. Every raw sample is
expressed in the unit named by the evidence schema; memory and transfer values
are MiB.

## Simulation is not qualification

Set `evidenceKind` to `physical-device` only for measurements collected from the
manifest's named current mobile device and browser. Synthetic contract fixtures
use `simulation`. A simulation can set `meetsAllBudgets` to true to validate the
math, but `performanceEligible` remains false and the combined profile remains
Manual-Entry-only. Reports always preserve this evidence classification.

`evidenceKind` is a declared classification, not proof that a run occurred on a
physical phone. This code validates the integrity and completeness of frozen,
content-free evidence plus the budget calculations. It checks artifact-hash
shape and identity but cannot authenticate or recompute a digest without the
separately governed capture artifact. Human physical qualification and artifact
governance in #61 and #62 establish authenticity. No local heuristic, identical-
telemetry check, or caller-supplied label substitutes for that trust anchor.

Empty trial measurements, incomplete start/run/checkpoint coverage, duplicate
capture identities, wrong fixture coverage, contradictory reliability and
performance focus evidence, mismatched profile/device/browser metadata, or an
absent performance block make the profile ineligible. Malformed numeric evidence
is rejected rather than silently scored.
