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

Across the same 299 held-out fixture IDs used by the reliability run, collect:

- Capture Guide and full-preview discovery pass durations;
- Searching/Stabilizing and Focused completion intervals for both pass kinds;
- yields between completed passes; and
- stable Focused Price latency.

The evidence must contain at least one Guide, discovery, Searching/Stabilizing,
and yield sample per fixture (299 total per metric), plus at least 108 Focused
Price and Focused-cadence samples matching the minimum successful-positive gate.

Record first-install transfer, cached storage, camera-preview baseline memory,
peak memory with recognition, and memory at minutes 2 and 10. Then conduct three
separate runs of at least ten minutes. Each run records crashes, reloads, OS
thermal warnings, camera interruptions, forced recoveries, preview FPS samples,
recognition durations during minutes 2–4 and the final two minutes, and battery
percentage points consumed.

The scorer uses nearest-rank p95. It derives peak memory above preview baseline,
minute-2-to-minute-10 growth, final-versus-early p95 slowdown, and hourly battery
drain. Every raw sample is expressed in the unit named by the evidence schema;
memory and transfer values are MiB.

## Simulation is not qualification

Set `evidenceKind` to `physical-device` only for measurements collected from the
manifest's named current mobile device and browser. Synthetic contract fixtures
use `simulation`. A simulation can set `meetsAllBudgets` to true to validate the
math, but `performanceEligible` remains false and the combined profile remains
Manual-Entry-only. Reports always preserve this evidence classification.

Empty measurement arrays, incomplete start/run counts, duplicate identities,
wrong fixture coverage, mismatched profile/device/browser metadata, or an absent
performance block make the profile ineligible. Malformed numeric evidence is
rejected rather than silently scored.
