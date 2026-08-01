# Camera reliability benchmark methodology

Research date: 2026-08-01
Decision question: what corpus size and test protocol can defensibly gate Camera-supported status for a Source Currency?

## Recommendation

Use **at least 120 distinct positive scenes per candidate Source Currency**, plus a separately scored negative corpus. A pool of 120 divided among currencies is not defensible for a status awarded per Source Currency: it measures a pooled mixture, not each currency. The same physical negative scenes may be reusable across currency profiles, but every profile must be run and scored separately.

Treat 120 as a **practical coverage floor**, not a statistically derived proof of 90% reliability. Decide which of these two release claims TagLingo means:

1. **Empirical acceptance rule:** pass with at least 108 successes in 120 held-out positive scenes (90% observed), zero incorrect Focused Prices, and passing Detection Outline geometry. This is simple, but 108/120 has a one-sided exact 95% lower confidence bound of only about **84.3%**.
2. **Inferential reliability claim:** require the one-sided exact 95% lower confidence bound to exceed 90%. With 120 independent scenes, that takes at least **114/120 successes (95% observed)**; its lower bound is about **90.4%**. This rule is materially stricter.

Given that Manual Price Entry remains available and “Camera-supported” is an evidence gate rather than a regulatory reliability claim, the first rule is reasonable if the benchmark report always includes its confidence interval and does not describe the result as proof that true reliability is at least 90%. The second rule is preferable if product language will make that population-level claim.

## Why the denominator must be per currency

The unit of the product decision is a Source Currency, so the denominator must support that same unit. Currency markers, grouping and decimal conventions, glyphs, scripts, and price formats create currency-specific recognition and parsing failure modes. NIST's AI Risk Management Framework calls for documented test sets and performance demonstrated in conditions similar to deployment; it does not support substituting a pooled average for the condition on which the product claim is made. [NIST AI RMF 1.0, MEASURE 2.1-2.3](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)

The practical statistical difference is large:

| Positive scenes for one currency | Smallest step in observed rate | Successes for 90% observed | One-sided exact 95% lower bound |
| ---: | ---: | ---: | ---: |
| 30 (120 split four ways) | 3.33 percentage points | 27/30 | 76.1% |
| 60 | 1.67 percentage points | 54/60 | 81.2% |
| 120 | 0.83 percentage points | 108/120 | 84.3% |

These are exact-binomial calculations. NIST recommends binomial confidence limits, and specifically warns against relying on symmetric normal approximations when the sample or failure count is small. [NIST/SEMATECH, “Confidence intervals”](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

If TagLingo later makes support claims separately by platform (for example, JPY on iOS Safari versus JPY on Android Chrome), each claimed currency-platform cell needs its own adequate denominator. If the claim remains currency-wide, predeclare a realistic device/browser allocation within the 120 and report every stratum as well as the pooled rate; do not let a strong platform hide a failed one.

## What “zero incorrect Focused Prices” establishes

Zero observed harmful errors does **not** establish that the harmful-error probability is zero. For `n` independent trials with no failures, the exact one-sided 95% upper bound on the failure probability is:

`1 - 0.05^(1/n)`

This is the source of the approximately `3/n` “rule of three” for zero numerators. [Hanley and Lippman-Hand, “If Nothing Goes Wrong, Is Everything All Right?”](https://doi.org/10.1001/jama.1983.03330370053031)

Consequences for this benchmark:

| Independent exposures with zero incorrect Focused Prices | One-sided 95% upper bound on harmful-error probability |
| ---: | ---: |
| 120 | 2.47% |
| 299 | just under 1.00% |
| 598 | just under 0.50% |

Therefore the release record should say **“zero incorrect Focused Prices observed in N trials”**, not “the false-focus rate is zero.” If TagLingo wants evidence that the per-session harmful-error probability is below 1% at 95% confidence, it needs at least 299 independent, representative exposures with zero such errors.

Score harmful errors over the entire fixed observation window, not only the final output. A wrong price that briefly becomes the Focused Price before the correct one appears is an incorrect Focused Price. Count harmful errors in both:

- positive scenes, including multiple-price scenes, mixed currencies, discounts, crossed-out prices, and nearby non-price numerals; and
- negative scenes containing no valid target price, number-like text, unsupported currencies, ambiguous separators or symbols, screens, packaging, and other realistic distractors.

Keep the positive exact-detection denominator and the negative false-focus denominator separate. Combining them makes both the success rate and safety result hard to interpret. The negative corpus can be shared physically, but each candidate currency/profile must face it because parser and marker behavior differ.

## Experimental unit, stratification, and repeated trials

Define the primary experimental unit as **one capture session on one distinct real-world scene under one predeclared device/browser condition**. A positive success requires, within five seconds after recognition is ready:

- the exact expected numeric value;
- the exact expected Source Currency;
- no incorrect Focused Price at any earlier point in the session; and
- Detection Outline geometry passing a separately specified annotation rule.

Do not count video frames as independent trials. Do not inflate the sample size by replaying one tag repeatedly, applying many synthetic transforms to one image, or running the same scene on several devices. Those observations share the same underlying scene and are clustered. Repeats are useful for diagnosing runtime instability, but the primary binomial result should use distinct scenes; repeated observations should either be collapsed to one predeclared scene-level outcome or analyzed as clustered/repeated data.

Construct the 120 positive scenes as a balanced or deployment-weighted stratified design. Predeclare coverage for at least:

- notation and format: symbol/code/word marker, grouping and decimal conventions, integer and fractional values, font and print quality;
- medium: printed tag, packaging, receipt-like display, and electronic screen/moiré where in scope;
- capture condition: ordinary, dim, uneven, glare, distance/scale, rotation, oblique angle, and partial occlusion;
- scene complexity: one price, multiple prices, discount/original pair, target plus other-currency price, and nearby non-price numerals;
- supported environment: physical device tiers, browser families/versions, camera resolution/orientation, and warm versus thermally stressed runs.

The matrix need not cross every factor with every other factor. Use risk-based quotas, keep the allocation fixed before evaluation, and publish counts and results by stratum. NIST's design-of-experiments guidance recommends blocking controlled nuisance factors and randomizing the rest; here, device/browser is a natural block, while run order within a block should be randomized to distribute time, battery, and thermal effects. [NIST/SEMATECH, “Randomized block designs”](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm)

Use one randomized primary release run per scene/configuration. A smaller repeated-run stability panel may run each scene several times, but report it separately. Record model readiness, capture start, first Detected Price, first Focused Price, every focus change, and the five-second terminal state from an automated event log. Measure model download/initialization separately because the agreed timer starts after recognition is ready.

## Development corpus versus held-out release corpus

Maintain two physically and procedurally separate corpora:

### Development and regression corpus

- Visible to implementers and reusable without limit for engine selection, preprocessing, threshold tuning, parser work, and regression tests.
- Includes the approved live JPY 58,980 screenshot because it is already known and is explicitly being used to guide development.
- May include synthetic transformations, although these do not replace distinct real-world scenes in the release corpus.

### Held-out release corpus

- Contains different source scenes, preferably different products, labels, stores/venues, and capture sessions rather than near-duplicates of development fixtures.
- Keeps inputs and ground truth sequestered from the people tuning the recognizer until the engine, parser, thresholds, and release candidate are frozen.
- Runs with a versioned manifest, immutable expected results, exact app/model/browser/device versions, and a predeclared scoring script.
- Is evaluated once for the release decision. If failures are exposed and used to tune the system, those fixtures become development/regression data and must be replaced before another unbiased release claim.
- Is refreshed over time to cover deployment drift and new device/browser conditions.

This separation is not merely convention. NIST's AI Technology Evaluation uses blind data in a sequestered environment specifically to reduce train/test contamination, and NIST's historical OCR evaluation provided known-label training material while keeping the test characters unlabeled for participants and scoring submissions separately. [NIST AITE overview](https://pages.nist.gov/ai-technology-evaluation/), [NISTIR 5123, *Cross Validation Comparison of NIST OCR Databases*](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5123.pdf)

## Proposed release decision record

For each candidate Source Currency, publish:

1. the frozen build, recognizer/model, parser, thresholds, and supported device/browser matrix;
2. positive results as `successes / distinct held-out positive scenes`, the observed percentage, and an exact one-sided 95% lower confidence bound;
3. incorrect Focused Prices as `events / independent positive and negative sessions`, plus the exact one-sided 95% upper bound when zero are observed;
4. results by predeclared scenario and device/browser stratum;
5. latency distribution for successful sessions and the count censored at five seconds;
6. Detection Outline pass/fail results under the frozen geometry rule; and
7. all protocol deviations, exclusions, crashes, timeouts, and missing telemetry, counted as failures unless an exclusion rule was declared before the run.

## Concrete TagLingo qualification protocol

Use the following frozen protocol for each candidate Source Currency and each
required physical mobile platform block. The initial blocks are current iOS
Safari on the available iPhone 16 Pro and current Android Chrome on one named,
representative physical device. Run the same manifest in both blocks, score
each block independently, and do not pool a strong platform with a weak one.

### Positive corpus: 120 distinct held-out scenes

Use three mutually exclusive, 40-scene strata:

1. clean single-price scenes, spanning printed tags and electronic displays;
2. difficult single-price scenes, spanning screen moiré, dim or uneven light,
   glare, distance, rotation, oblique angles, blur, and partial occlusion; and
3. complex-selection scenes, spanning multiple same-currency prices,
   original/sale pairs, crossed-out prices, other-currency prices, and nearby
   non-price numerals.

Across those strata, cover every accepted marker and number-format class for
the Source Currency, varied price magnitudes, fonts, print quality, portrait
and landscape capture, and warm and thermally stressed run order. No accepted
marker/format class may have fewer than ten scenes. Randomize run order inside
each platform block.

### Negative corpus: 179 distinct held-out scenes

Use four mutually exclusive risk groups: 45 scenes dominated by non-price
numerals such as dates, SKUs, quantities, and percentages; 45 containing only
wrong or unsupported currency amounts; 45 containing ambiguous or malformed
number fragments or currency markers without a valid price; and 44 no-price
retail scenes with realistic text and visual clutter. The physical corpus may
be reused across Source Currency profiles, but each profile is run and scored
separately.

The 120 positive plus 179 negative sessions provide 299 independent safety
exposures per currency/platform block. With zero incorrect Focused Prices,
that places the exact one-sided 95% upper confidence bound just below 1%; it
does not establish that the real error rate is zero.

### Trial timing and event record

- Start the qualification timer when recognition reports ready, not when the
  camera opens or model download begins. Measure download, initialization, and
  warm preparation separately for the performance-budget decision.
- Observe every positive and negative scene for ten seconds after readiness.
  A positive only earns the latency success if its correct Focused Price first
  stabilizes within five seconds; continue observing through ten seconds to
  catch a later incorrect focus.
- Record only a fixture identifier, frozen build/configuration identifiers,
  device/browser versions, readiness time, first Detected Price time, every
  Focused Price transition as expected/mismatched (not its text or amount),
  geometry score, terminal outcome, and declared environmental stratum. Do not
  persist frames, OCR text, recognized amounts, or raw coordinates.
- Count crashes, timeouts, missing telemetry, and undeclared exclusions as
  failures. A protocol error may be rerun only under a rule frozen before the
  release run.

### Exact outcome and geometry rule

A positive scene succeeds only when all of these are true: the exact expected
Source Currency and minor-unit value become the Focused Price within five
seconds; no different Focused Price appeared earlier or later in the ten-second
window; and the Detection Outline matches the annotated complete price region.

For the geometry match, require intersection-over-union greater than 0.5 with
the tight ground-truth polygon around the complete currency marker and numeric
price, using one-to-one matching. This follows the established ICDAR scene-text
localization threshold. A complex-selection scene additionally fails if the
outline matches a non-target price, even when that other price is itself read
correctly. [ICDAR Robust Reading Competition multilingual scene-text protocol](https://rrc.cvc.uab.es/?ch=15&com=tasks)

An incorrect value, currency, or selected price that becomes user-visible at
any time is an incorrect Focused Price and immediately fails the safety gate.
A correct value with missing/late/failed geometry is a miss, not a success.

### Release gate

A Source Currency earns Camera-supported status only when every required
currency/platform block has:

- at least 108 successes in 120 positive scenes overall;
- at least 36 successes in every 40-scene positive stratum;
- zero incorrect Focused Prices across all 299 positive and negative sessions;
- a complete frozen event record and no unresolved protocol deviations; and
- separately reported exact one-sided 95% confidence bounds and successful
  latency distribution, without presenting 108/120 as proof that underlying
  reliability exceeds 90%.

The approved JPY 58,980 screenshot belongs to the visible development and
regression corpus, not the held-out qualification corpus. If a held-out scene
is exposed and then used for tuning, move it to development and replace it
before the next qualification run.

## Decision

Interpret the earlier “120-tag corpus” as **120 held-out positive real-world scenes per candidate Source Currency**. Keep a separate negative corpus sized to the safety claim: 120 zero-error exposures only bound the harmful-error rate below about 2.47% at 95% confidence, while 299 zero-error exposures are needed to bound it below 1%. Use 108/120 only as an explicitly empirical 90% acceptance gate; use 114/120 if the intended claim is that underlying reliability exceeds 90% with one-sided 95% confidence.
