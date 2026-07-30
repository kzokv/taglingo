# On-device price recognition for iPhone Safari

_Wayfinder research note — 2026-07-30_

## Decision

Use a **browser-local Tesseract.js pipeline as the prototype baseline**, but
do not yet claim that it meets the recognition acceptance target.

The concrete baseline is:

1. Tesseract.js 7, pinned and self-hosted with one persistent Web Worker.
2. Lazily load only the selected Source Currency's `tessdata_fast` profile.
3. Sample only the newest camera frame and crop the central focus region.
4. Run one OCR request at a time, adapt its cadence to measured OCR duration,
   and pause when the page is hidden.
5. Parse OCR tokens with a Source Currency-specific grammar, then select the
   Detected Price nearest the reticle as the Focused Price.
6. Build each rectangle from the exact marker/number word boxes, map it through
   the crop and `object-fit: cover` transforms, and temporally stabilize both
   value and box before committing the conversion.

This is a good feasibility prototype because Tesseract.js runs its WebAssembly
OCR engine in a browser worker, supports multiple language files, accepts a
recognition rectangle, and can return block/TSV data with confidence and
bounding boxes. Its own scope statement is also the important limitation:
Tesseract.js wraps Tesseract and does not change the recognition model to
improve accuracy. ([Tesseract.js project and scope](https://github.com/naptha/tesseract.js/),
[API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md))

**Feasibility judgment:** a private, focused, on-device web scanner is feasible
to prototype. The confirmed target—at least 90% correct overall, at least 85%
per currency, median first correct overlay at or below 1.5 seconds, p95 at or
below 3 seconds, and a stable focused rectangle across 12 currencies—is
**not yet validated** on iPhone Safari and remains high-risk. It must be a
device-validation gate, not an implementation promise. An explicit opt-in
focused-crop fallback should be designed as an escape hatch because the general
models may miss the accuracy floor on difficult CJK tags, stylized retail
fonts, glare, or skew even after browser-side tuning.

## Scope and acceptance boundary

The selected Source Currency is authoritative. The optimized recognition set
is:

`USD`, `EUR`, `JPY`, `GBP`, `CNY`, `KRW`, `TWD`, `HKD`, `AUD`, `CAD`, `SGD`,
and `CHF`.

The latency clock should start when an eligible frame first contains a
stationary ground-truth price box at the reticle and end when the stabilized
Focused Price overlay is committed. Report these separately:

- cold application and model readiness;
- warm recognition-to-overlay latency;
- recovery latency after changing Source Currency.

Cold language-model download cannot reasonably share the 1.5-second budget.
The scanner should show an explicit preparation state and only start the warm
recognition clock after the worker and selected language data are ready.

A result counts as correct only if:

- its value is exact in the Source Currency's minor units;
- its rectangle corresponds to the annotated currency-marker-plus-number
  region (recommended threshold: intersection-over-union at least 0.5); and
- when multiple prices are visible, the selected Focused Price is the
  qualifying Detected Price nearest the central reticle.

## Evidence from the throwaway prototype

The inspected prototype was
`currency-camera-converter-wayfinder-temp` at commit
`eb225a387611e3621c41367486ab71841d19c4c1`.

Its current pipeline already proves useful integration points:

- camera capture requests the environment-facing camera at an ideal
  1920×1080;
- the CSS focus region is transformed back through the video's cover crop;
- that region is drawn to a 1,100-pixel-wide canvas with grayscale and
  `contrast(1.8)`;
- Tesseract.js 6.0.1 creates one worker for the selected language array, uses
  LSTM mode and `SINGLE_LINE`, requests text and block output, and never
  overlaps jobs;
- the next scan is scheduled 650 ms after the previous OCR finishes;
- OCR line text is passed to a localized parser, and the highest parser plus
  OCR-confidence score wins;
- the line box is expressed as percentages of the focus region.

Those are integration findings, not recognition measurements. The existing
screenshots are rendered demo UI states rather than camera input with ground
truth. There are no representative price-tag image or video assets, no
physical-iPhone traces, and no end-to-end accuracy, latency, memory, energy, or
thermal measurements.

The current code also has material gaps:

- `SINGLE_LINE` assumes one line even though the desired behavior must locate
  several Detected Prices.
- A line box can cover unrelated text; the parser does not map its matched
  number back to exact OCR word boxes.
- An unmarked number can win, so SKUs, dates, quantities, and discounts need
  stronger negative evidence.
- The first candidate is displayed immediately. A later amount within 1.5% is
  treated as near the previous amount, which can merge two genuinely different
  prices rather than stabilize one exact value.
- A fixed 650 ms delay is added after OCR time. It does not target a measured
  latency, duty cycle, or thermal budget.
- A third-party runtime CDN is a version, availability, privacy-perception, and
  offline dependency.

The existing parser test was run without rebuilding the app:

```text
node --test --experimental-strip-types tests/price-localization.test.ts
```

On an arm64 Mac running macOS 26.2 and Node 25.6.0, all 3 tests passed. The
12-string localized-price subtest completed in 8.36 ms and the Node test runner
reported 262.33 ms total. This only demonstrates deterministic parsing of
already-recognized strings such as `4,142円`, not OCR, rectangles, Safari
performance, or iPhone feasibility. No physical-device validation was
performed.

## Recommended prototype pipeline

### 1. Runtime and language profiles

Pin and self-host Tesseract.js 7, its compatible core files, and language
assets. Tesseract.js 7 is the current release and adds a relaxed-SIMD build; its
maintainers report roughly 15–35% shorter runtimes than v6 depending on the
device and workload, with the largest gains on recent Intel processors. That
number must not be extrapolated to an iPhone; benchmark v6.0.1 and v7 on the
same device corpus before removing the old baseline.
([Tesseract.js 7 release](https://github.com/naptha/tesseract.js/releases/tag/v7.0.0))

Use `tessdata_fast` with LSTM-only engine mode. The Tesseract project describes
these integerized models as its speed/accuracy compromise; they are suitable
for an interactive baseline but are not fine-tunable.
([tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast))

Start with these profiles:

| Source Currency | Initial profile |
| --- | --- |
| USD, EUR, GBP, AUD, CAD, SGD, CHF | `eng` |
| JPY | `jpn+eng` |
| CNY | `chi_sim+eng` |
| TWD, HKD | `chi_tra+eng` |
| KRW | `kor+eng` |

The extra English pack in non-Latin profiles is a conservative starting point
for Latin digits and ISO markers. The validation corpus must A/B each pair
against the single local-language pack; keep the smaller single-pack profile
when it preserves the per-currency accuracy floor and improves latency.
Tesseract supports multiple languages, but language order can change both
output and runtime, so keep the order fixed in each experiment.
([Tesseract multi-language usage](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html),
[Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md))

Use exactly one active OCR worker. Create it once per Source Currency profile,
reuse it for frames, terminate it when switching to an incompatible profile,
and let the browser cache downloaded data. Do not preload all profiles or add a
parallel scheduler on iPhone. Tesseract.js recommends reusing a worker across
images; its v6 release fixed a long-running memory leak and reduced runtime and
memory, while its own web benchmark for v5 reported 164 MB for one English
worker. That benchmark is directional desktop evidence, not an iPhone memory
measurement.
([worker reuse and v6 changes](https://github.com/naptha/tesseract.js/),
[v5 memory note](https://github.com/naptha/tesseract.js/releases/tag/v5.0.0))

Self-hosting is important even though the library defaults to CDNs. Its local
installation guide supports custom worker, core, and language paths and warns
that the core path must remain a directory so the runtime can select the
appropriate WebAssembly build.
([Tesseract.js local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md))

### 2. Frame sampling, ROI, and preprocessing

Use `requestVideoFrameCallback` when available to notice new camera frames, but
only copy a frame when the OCR worker is idle. Never queue old frames. Keep the
existing central focus region—approximately 70–80% of preview width and 25–35%
of preview height—as the primary OCR region.

For each eligible sample:

1. Convert the visible focus rectangle through the video's cover scale and
   crop offsets into source-video coordinates.
2. Draw only that crop to a reusable canvas. Begin at 960 pixels wide; scale
   down to 768 when recognition is slow, and allow up to 1,100 only when small
   glyphs need it. Do not upscale far beyond the captured source pixels.
3. Add a small neutral border around the crop. Tesseract documents that both
   overly tight crops and very large borders can hurt segmentation.
4. Use grayscale plus restrained contrast/autolevels as the normal input.
   Preserve an unfiltered copy for diagnosis.
5. When normal confidence is low, use the next cadence slot—not a concurrent
   job—to retry the same crop with an alternate threshold or inverted
   treatment. Tesseract already binarizes internally, and its documentation
   warns that uneven backgrounds, noise, and skew can still reduce accuracy.

Tesseract specifically recommends adequate input resolution and documents
rescaling, binarization, deskewing, and segmentation mode as major quality
levers.
([Tesseract.js recognize API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md#worker-recognize),
[Tesseract image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html))

Run a two-level cadence with one job in flight:

- focused pass: the central crop with `PSM.SINGLE_LINE`, prioritized whenever
  the reticle has no stable Focused Price;
- discovery pass: every third successful cycle, or when no focused candidate
  exists, use `PSM.SPARSE_TEXT` on the whole focus region to outline multiple
  Detected Prices.

`SINGLE_LINE` treats its image as one text line; `SPARSE_TEXT` finds as much
text as possible without assuming order. These modes match the two different
jobs better than one global setting.
([Tesseract page segmentation modes](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#page-segmentation-method))

After each OCR completion, choose the next delay from measured duration:

- begin around 150–250 ms;
- keep camera-to-commit latency inside the target while avoiding continuous
  100% OCR duty;
- if a recognition takes more than about 800 ms repeatedly, reduce crop width
  and discovery frequency;
- if p95 still fails, degrade to an explicit hold/tap-to-read mode on that
  device rather than building an ever-growing queue.

The numeric thresholds are starting parameters, not measured iPhone limits.
WebKit advises minimizing JavaScript CPU activity and returning to idle for
power efficiency; it also suspends or throttles inactive pages. Stop camera
sampling and terminate or park OCR on `visibilitychange`, then restore cleanly
when visible.
([WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/))

### 3. Localized parsing and confidence

Keep ISO 4217 codes as internal identities and use the explicit Source Currency
to select a parsing profile. Build the 12 profiles from CLDR number symbols,
currency patterns, currency aliases, and fraction-digit data rather than a
global “last separator wins” rule.
([Unicode TR35 numbers and currencies](https://unicode.org/reports/tr35/tr35-numbers.html),
[CLDR JSON number data](https://github.com/unicode-org/cldr-json/tree/main/cldr-json/cldr-numbers-full/main),
[CLDR currency fraction data](https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/currencyData.json))

The parser should:

- normalize Unicode with NFKC, digit sets, non-breaking spaces, apostrophes,
  bidi controls, and localized decimal/group separators;
- accept the selected currency's prefix, suffix, ISO code, full-width forms,
  and local aliases—especially `¥4,142`, `￥4,142`, and `4,142円` for JPY;
- validate western, space, dot, apostrophe, and applicable local grouping;
- apply the selected currency's fraction-digit constraint;
- retain the OCR token span and evidence rather than returning only an amount;
- reject or strongly penalize percentages, dates, quantities, SKU/barcode
  strings, crossed-out values, and “save” amounts without sufficient price
  evidence.

Do not use one universal OCR-confidence threshold. Tune thresholds per
currency from the validation corpus because confidence distributions can
differ by model. Rank candidates from independent evidence:

- exact amount parse and valid grouping;
- explicit Source Currency marker or a strong local price context;
- OCR word confidence;
- box size and text sharpness;
- distance from the reticle;
- negative non-price context.

A character whitelist can reduce noise, but it must include all selected
currency markers and useful local context. Test whitelist on/off per profile:
over-restricting it can remove the very suffix (`円`, `元`, `원`) or context
needed to distinguish a price.

### 4. Boxes, focus selection, and temporal stability

Request `{ blocks: true }` or TSV explicitly; Tesseract.js v6 and later disable
non-text output formats by default. The official Tesseract output examples
include word boxes and word confidence.
([Tesseract.js v6 output change](https://github.com/naptha/tesseract.js/releases/tag/v6.0.0),
[Tesseract hOCR/TSV output](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html))

For every parsed candidate, union only the word boxes that overlap its
currency-marker and numeric token span. Then map:

```text
OCR output box
  -> unscale within OCR canvas
  -> add source-video crop origin
  -> apply video object-fit cover scale and hidden offsets
  -> subtract preview element origin
  -> CSS overlay coordinates
```

Store the transform used for the exact sampled frame with the OCR job. Do not
read a later DOM layout when the delayed result returns. Clamp only after the
full transform, and test portrait/landscape, resize, safe-area changes, and
rear-camera mirroring assumptions.

Track candidates across frames by exact amount, Source Currency, box
intersection-over-union, and center distance:

- commit a new Focused Price after two consecutive compatible observations;
- compare exact minor-unit amounts—do not merge values with a percentage
  tolerance;
- use an exponential moving average for box corners after association;
- hold the last committed value across up to two misses (or about one second)
  while fading confidence, so a single OCR miss does not blink the overlay;
- require two observations before replacing an existing amount;
- clear promptly when the reticle leaves the tracked box or the page/camera
  stops.

Outline all candidates above their per-currency confidence threshold. Choose
the Focused Price whose rectangle contains the reticle; if none contains it,
choose the candidate with the smallest normalized center distance within the
focus region. Confidence breaks a near tie, but should not cause a distant
price to displace the one being pointed at.

## Memory, download, and thermal constraints

Treat browser resources as a budget to measure, not a stable iPhone contract.

- One Tesseract worker, one source crop, and one alternate preprocessing buffer
  are the initial ceiling.
- Reuse canvases and typed arrays; do not retain full video frames or OCR block
  trees after candidate extraction.
- Lazy-load only the current profile. Cache versioned, compressed assets and
  display progress on the first load.
- Cache loss must be tolerated. WebKit states that website data, including
  IndexedDB and Cache API data, can be evicted under storage pressure.
  ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/))
- A WebKit engineer describes practical iPhone WebContent process limits of
  roughly 1.5 GB on most devices, but that is implementation evidence, not a
  guaranteed API budget. Staying far below it is another reason to avoid
  parallel OCR workers and all-language preload.
  ([WebKit memory-limit discussion](https://bugs.webkit.org/show_bug.cgi?id=268816#c10))
- The web platform does not expose an iPhone thermal-state API. Infer
  throttling from rising OCR duration and dropped cadence, and verify sustained
  behavior on physical devices. Reduce discovery frequency or pause with a
  “device needs a moment” state if rolling latency deteriorates.

## Opt-in fallback

Plan the interface boundary now, but do not enable server OCR by default.
Trigger a separate fallback decision if the physical-device corpus shows any
of these after profile and preprocessing tuning:

- overall exact value plus box accuracy below 90%;
- any Source Currency below 85%;
- warm latency above 1.5 seconds median or 3 seconds p95;
- unacceptable overlay instability or sustained thermal slowdown.

If adopted, fallback should upload **one focused still crop only**, after an
explicit per-session opt-in. It should never stream video or upload a full
frame. Strip metadata, transmit over TLS, avoid provider training and
persistent logging, delete the crop promptly, rate-limit it server-side, and
show when recognition left the device. Provider, retention, geography, and
consent wording require their own research decision.

This fallback is likely to be needed for the long tail, but the evidence does
not yet justify making it mandatory: there is no real TagLingo corpus or
iPhone result to compare.

## Physical-iPhone validation protocol

No platform commitment should be made until this protocol is run.

### Corpus

- At least 10 distinct, representative tags for each of the 12 Source
  Currencies (at least 120 ground-truthed tags).
- Include `4,142円`, prefix and suffix symbols, ISO codes, decimal and
  zero-decimal values, grouping variations, sale/original price pairs,
  ambiguous symbols, multiple visible prices, glare, low contrast, angled
  views, small type, and stylized fonts.
- Annotate exact amount in minor units and the marker-plus-number rectangle.
- Keep a fixed evaluation set separate from examples used to tune profiles and
  thresholds.

### Devices and runs

- One recent supported iPhone and one oldest/smallest-memory supported iPhone.
- Current supported Safari in a browser tab and Home Screen mode.
- Cold-cache, warm-cache, first permission, repeated session, and Source
  Currency switch paths.
- Bright indoor, ordinary store lighting, low light, glare, 0°, moderate angle,
  and movement-to-hold transitions.
- A sustained 10-minute scan on each device after short per-tag trials.

The iOS version and minimum supported iPhone are not yet chosen, so actual
models must be recorded when that product decision is made.

### Instrumentation

Record with `performance.now()`:

- frame eligibility and crop time;
- preprocessing start/end;
- OCR queued/start/end;
- parse end;
- candidate association and overlay commit;
- OCR profile, PSM, crop dimensions, confidence evidence, and result reason;
- rolling OCR duration, misses, replacements, and overlay clears.

For every tag, record first-attempt correctness and warm commit latency. For a
five-second hold, record wrong value changes, rectangle disappearance, and box
center jitter. Recommended stability gate: zero wrong value changes after
commit, no disappearance longer than 250 ms while the tag remains visible,
and median stabilized box-center movement below 5% of focus-region width.

Use Safari Web Inspector to capture network bytes, CPU timeline, and memory
trend. During sustained tests also record battery percentage before/after,
device warmth or system warnings, preview responsiveness, and OCR latency by
minute. Battery percentage and touch-observed warmth are coarse observations,
not laboratory energy or thermal measurements, and should be labeled as such.

### Decision gate

Proceed web-first when the unchanged holdout corpus meets every confirmed
accuracy and latency threshold on both physical devices without a growing
memory trend or material ten-minute slowdown.

If accuracy alone fails, test the opt-in focused-crop fallback. If warm latency,
preview responsiveness, memory, or sustained thermal behavior fails on the
oldest supported iPhone even after ROI/cadence reduction, narrow the experience
to hold/tap-to-read or reconsider native iOS before expanding the product.

## Bottom line

Adopt the browser-local pipeline as the prototype experiment, not as a settled
production architecture. It preserves the confirmed on-device privacy
boundary and has the necessary worker, language, confidence, and box
primitives. The current throwaway prototype is a useful UI and parser spike,
but it supplies no representative OCR evidence. The next implementation
milestone must therefore be the instrumented 120-tag physical-iPhone spike;
the web-vs-fallback decision should follow its measured gate.
