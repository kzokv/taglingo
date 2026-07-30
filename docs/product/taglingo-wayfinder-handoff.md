# TagLingo Wayfinder Handoff

**Status:** Decision-complete exploration; ready for implementation backlog

**Canonical specification:** [TagLingo Web Prototype PRD](./taglingo-web-prototype-prd.md)

**Wayfinder map:** [GitHub issue #1](https://github.com/kzokv/taglingo/issues/1)

## Product direction

TagLingo will begin as a mobile-first installable web application, not a native
iOS application or ChatGPT-only integration. A restricted Guest can try the
camera scanner without an account. Clerk Waitlist controls admission to
Approved Member capabilities.

The core camera interaction is:

1. The shopper explicitly selects a Source Currency.
2. Browser-local OCR finds price candidates without uploading camera frames,
   OCR text, or Detected Prices.
3. Every confident Detected Price receives a visible rectangle.
4. The Detected Price nearest the central reticle becomes the Focused Price.
5. Only the Focused Price is converted.
6. A Guest sees one Target Currency; an Approved Member may see one to three.
7. Each conversion shows a dated Reference Rate and the estimate disclaimer.

Native iOS, TestFlight, App Store distribution, and uploaded OCR are outside
this prototype. Native iOS remains a future fallback if measured browser OCR,
camera control, thermal behavior, or latency cannot meet the acceptance target.

## Decisions

### Recognition and supported currencies

- Optimize Source Currency recognition for USD, EUR, JPY, GBP, CNY, KRW, TWD,
  HKD, AUD, CAD, SGD, and CHF.
- Keep Source Currency selection explicit because symbols such as `$`, `¥`, and
  `kr` are ambiguous.
- Search Target Currencies by ISO code, English name, and supported native
  aliases. The active provider catalog determines which targets are available.
- Use Unicode normalization and Source Currency-specific markers, grouping,
  decimal, fraction-digit, and negative-evidence rules.
- Japanese fixtures must treat `¥4,142`, `￥4,142`, and `4,142円` as JPY 4142.
- Prototype with a pinned, self-hosted Tesseract.js 7 worker and versioned
  `tessdata_fast` assets. Load only the selected language profile and never
  queue OCR jobs.
- Require at least 90% correct value-plus-box recognition overall, at least 85%
  for every optimized Source Currency, median first correct overlay no greater
  than 1.5 seconds, and p95 no greater than 3 seconds.
- These targets are unvalidated on iPhone Safari. The deferred validation gate
  is a 120-tag corpus on the available iPhone 16 Pro running iOS 26.5.2.

### Focus and overlay behavior

- Run focused single-line recognition near the reticle plus periodic sparse
  discovery for other visible prices.
- Draw rectangles from the exact marker and numeric token geometry, not the
  whole OCR line.
- Track candidates using exact minor-unit equality, box overlap, and center
  distance.
- Require two compatible observations before committing a changed price and
  tolerate brief misses to reduce flicker.
- Render all confident rectangles but show conversions only for the
  reticle-nearest Focused Price.

### FX rates and offline behavior

- Use Frankfurter v2's multi-provider institutional daily blend through a
  TagLingo server endpoint. These are dated Reference Rates, not intraday,
  payment, card, cash, or merchant rates.
- Store validated pair records in D1 using decimal strings, pair direction,
  provider, method, provider-published date, fetch time, and attribution.
- Use KV only as a disposable read-through accelerator.
- Revalidate eligible server records no more than every six hours. Camera
  activity must cause no FX requests.
- Allow a validated browser-cached Rate Snapshot through day seven based on the
  provider-published date. Stop the affected conversion on day eight while
  keeping recognition active.
- Preserve unaffected Target Currency conversions during a partial provider
  failure.
- Display the effective date, Frankfurter attribution, and:
  `Reference estimate; your payment rate may differ.`

### Accounts, admission, and preferences

- A Guest may scan with one Target Currency and browser-local preferences.
- A Guest may submit an email through Clerk Waitlist. Pending and invited
  people retain Guest access until registration completes and an active
  TagLingo membership exists.
- The owner initially approves, rejects, directly invites, and suspends people
  through Clerk rather than a custom TagLingo dashboard.
- An Approved Member may save one Source Currency and one to three distinct
  Target Currencies and restore them across devices.
- Every protected server operation must validate the Clerk session, verify
  active membership, authorize the capability, and scope data by stable Clerk
  user ID.
- Suspension disables membership and revokes active sessions.

### Deployment

- Use a static React SPA/PWA with thin Fetch-compatible Cloudflare Pages
  Functions; do not require SSR.
- Deploy through the scoped GitHub integration to Cloudflare Pages.
- Use D1 for authoritative membership, preferences, and last-known-good FX
  records; use KV only for hot FX reads.
- Protect previews with Cloudflare Access while keeping the restricted
  production Guest experience public.
- Start on the managed free tier and fail closed at quotas. Upgrade only when a
  measured gate requires it.
- Benchmark Clerk verification plus D1 authorization against the Workers Free
  CPU ceiling before launch.

## Prototype findings

The throwaway `currency-camera-converter-wayfinder-temp` application is evidence,
not the production foundation.

Useful findings:

- iPhone Safari can provide a rear-camera preview over HTTPS, and a PWA avoids
  TestFlight and App Store distribution for the initial validation.
- A central crop, restrained grayscale/contrast preprocessing, one OCR job at a
  time, and a throttled loop are a plausible browser-local baseline.
- Locale-aware parsing materially improves recognition. The prototype parser
  includes Unicode normalization, native currency suffixes, non-Latin digits,
  and fixtures such as `4,142円`.
- Explicit Source Currency selection is necessary; symbol-only inference is not
  reliable.
- Searchable currency controls work better when code, English name, symbol, and
  aliases are searchable together.
- Showing a rectangle around the recognized token gives essential feedback
  about whether the shopper is pointing at the intended price.
- Showing several converted values together is understandable when every row
  includes a currency code and its own rate.
- Visible OCR preparation progress and a no-camera demonstration path make the
  prototype easier to evaluate.

What remains unproven:

- OCR accuracy, latency, memory, battery, and thermal behavior on the physical
  iPhone.
- Reliable discovery and tracking of multiple price tags in a moving scene.
- Exact token-box geometry after `object-fit: cover`, orientation changes, safe
  areas, and viewport resizing.
- Production authentication, authorization, offline cache, quota, and
  Cloudflare integration behavior.

## UI direction from variants B and C

The implementation should combine their useful behavior rather than reproduce
either variant literally.

From **variant B — Travel ledger**:

- Keep conversion results in a stable, readable sheet separate from the moving
  camera image.
- Show the Source Currency and Focused Price before the list of Target Currency
  results.
- Give every target its own currency code, converted amount, Reference Rate,
  and effective date.
- Keep the rate disclaimer near the results.
- Keep currency configuration accessible without covering the recognized price.

From **variant C — Quiet lens**:

- Preserve the camera-first full-screen feeling and minimal chrome.
- Keep compact Source and Target Currency controls near the edge of the camera
  view.
- Use a restrained central reticle and detection rectangles so the item remains
  visible.
- Present results as a compact bottom surface that can accommodate multiple
  targets without obscuring the Focused Price.
- Keep camera, recognition, and rate status visible but visually secondary.

The intended hybrid is therefore a quiet camera surface with exact detection
rectangles and a stable bottom result sheet with ledger-quality rate details.
The rectangle overlay and result sheet must be independently accessible:
important state cannot exist only as color or camera geometry.

## What must not be copied from the prototype

- Do not copy the Next.js/vinext SSR/RSC foundation. Use the approved static SPA
  and thin Fetch-compatible functions.
- Do not copy ChatGPT-authenticated headers, email-address ownership, or the
  prototype D1 identity model. Use Clerk and stable Clerk user IDs.
- Do not copy the six-target allowance. Enforce one target for Guests and up to
  three for Approved Members.
- Do not expose all 31 prototype currencies as optimized OCR sources. Keep the
  12 approved Source Currencies separate from the broader Target Currency
  catalog.
- Do not load Tesseract.js 6 from a public CDN at runtime. Pin and self-host
  Tesseract.js 7, its compatible core, and language assets.
- Do not call Frankfurter directly from the browser. Use the TagLingo FX
  Gateway for validation, entitlement checks, rate limiting, caching,
  last-known-good behavior, and attribution.
- Do not label daily data as a live or current trading rate. Use Reference Rate
  language and always show the effective date.
- Do not copy the prototype's single highest-scoring OCR line, single rectangle,
  or fallback rectangle. Discover multiple candidates and use exact token boxes.
- Do not copy the 1.5% “near previous” amount tolerance. It can merge distinct
  retail prices. Stabilize using exact minor-unit equality and spatial
  association.
- Do not expose raw OCR text in production UI, requests, persistence, analytics,
  or logs.
- Do not assume that desktop builds, demo values, parser unit tests, or a
  visually plausible rectangle prove camera OCR accuracy.
- Do not copy generated build output, deployment metadata, local Wrangler
  state, example code, or experimental database migrations from the temporary
  directory.

## Research preserved

- [Gated access and account approval](https://github.com/kzokv/taglingo/blob/b5b436ab6f10a947ce76ac38e191a6f22eb6c723/docs/research/gated-access-model.md)
- [On-device price recognition](https://github.com/kzokv/taglingo/blob/6c55d6ca6cb10ae57338b5f342f0d4735e128e1c/docs/research/on-device-price-recognition.md)
- [FX provider and cache contract](https://github.com/kzokv/taglingo/blob/34541f5a63477147b1d6463428eb4a9f0d2e49f8/docs/research/fx-provider-contract.md)
- [Free deployment and persistence architecture](https://github.com/kzokv/taglingo/blob/9532ed3539a6c5e606b20a83a61e8f122d5cbcd4/docs/research/free-deployment-architecture.md)
- Prototype currency research covers 31 conventional market currencies and
  confirms Frankfurter coverage as checked on 2026-07-30. The MVP narrows OCR
  optimization to 12 Source Currencies while retaining a provider-backed,
  searchable Target Currency catalog.
- Prototype iOS research confirms that a PWA avoids Apple review; direct Xcode
  installation and TestFlight remain future native options.

## Remaining unknowns and deferred gates

- Whether the browser OCR architecture meets the stated accuracy and latency
  targets on the available iPhone.
- Whether an older iPhone must become part of the supported baseline.
- Whether physical results justify an explicit opt-in focused-crop server OCR
  fallback.
- Whether Clerk's current free plan and product terms remain suitable when
  implementation begins.
- Whether Cloudflare Access onboarding requires payment details for this
  account, even though the Zero Trust Free plan is not charged.
- Whether authenticated Functions remain below the Workers Free CPU ceiling.
- The production Guest/member rate-limit numbers; research recommendations must
  be validated against realistic session behavior.
- Whether Frankfurter contributing-provider terms are sufficient before any
  commercial launch.
- Final visual styling and motion details for the B/C hybrid after the first
  functional tracer bullet.

None of these unknowns blocks creation of the implementation backlog. Physical
iPhone performance, paid-tier need, and commercial-provider terms remain
explicit validation or release gates rather than assumed facts.

## Implementation entry point

Create the approved tracer-bullet GitHub backlog from the canonical PRD. Each
issue should link to the PRD, identify its user stories, state HITL or AFK,
declare dependencies, and end in a demonstrable vertical outcome.

Begin implementation with the installable Guest camera shell. Do not start by
copying the temporary application or by building infrastructure in isolation.

