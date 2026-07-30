# TagLingo Web Prototype PRD

**Status:** Approved for backlog review

**Wayfinder map:** [Chart the path to a decision-complete TagLingo web prototype](https://github.com/kzokv/taglingo/issues/1)

**GitHub PRD:** [PRD: TagLingo web prototype](https://github.com/kzokv/taglingo/issues/15)

## Problem Statement

People shopping in a country whose currency is unfamiliar must repeatedly read a price tag, identify its currency notation, open a separate conversion tool, type the amount, and mentally reconnect the result to the item. This is slow and error-prone, especially when local notation such as `4,142円`, multiple visible prices, glare, sale formatting, or ambiguous currency symbols make the amount difficult to interpret.

Existing camera-translation and currency tools do not provide the intended TagLingo experience: a privacy-preserving camera view that visibly confirms which price was recognized, converts the price being pointed at into multiple familiar currencies, shows the underlying dated Reference Rate, and restores currency preferences for approved users.

The prototype must also avoid becoming an unrestricted public service. Unknown visitors may evaluate a deliberately restricted scanner, while full multi-currency and synchronized-preference features are limited to administrator-approved accounts.

## Solution

Build TagLingo as a mobile-first installable web application.

A Guest opens the public HTTPS application, grants rear-camera access, explicitly chooses a Source Currency, and chooses one Target Currency. TagLingo performs price recognition locally in the browser. It outlines every confident Detected Price, selects the price nearest the central focus reticle as the Focused Price, and displays its converted value together with the latest available dated daily Reference Rate.

Guests retain preferences only in their current browser. They may request full access through Clerk Waitlist. Pending applicants remain Guests. The owner approves, rejects, or directly invites people through Clerk's dashboard. An Approved Member may configure up to three Target Currencies and restore their preferences across devices.

TagLingo obtains institutional daily Reference Rates from Frankfurter v2 through its own server endpoint. Validated pair records are cached independently, camera activity never creates FX traffic, and the last successful Rate Snapshot may be used offline for at most seven days with an explicit cached-date label.

The proposed browser-local recognition baseline uses a pinned, self-hosted Tesseract.js 7 worker, Source Currency-specific language and parsing profiles, a central camera region of interest, exact token bounding boxes, and temporal stabilization. This architecture is an implementation hypothesis, not a proven iPhone-performance claim. Physical-device validation has been deliberately deferred.

The prototype is hosted from GitHub on Cloudflare Pages. Thin Pages Functions enforce authorization and provide preferences and FX endpoints. D1 is authoritative for membership, preferences, and last-known-good FX records. KV is only a disposable read-through FX cache. Clerk owns identity and admission. Cloudflare Access protects preview deployments while the production Guest experience remains public.

## User Stories

1. As a Guest, I want to open TagLingo from a public HTTPS URL, so that I can evaluate it without installing a native application.
2. As a Guest, I want an explanation of why camera permission is needed before the prompt appears, so that I can make an informed privacy decision.
3. As a shopper, I want TagLingo to prefer the rear camera, so that I can point it naturally at retail price tags.
4. As a shopper, I want to select the Source Currency explicitly, so that recognition uses the correct locale and does not guess from ambiguous symbols.
5. As a shopper, I want the Source Currency selector to show currency codes and names, so that I can identify the local currency confidently.
6. As a shopper, I want to search Target Currencies by code, English name, and supported native aliases, so that a large currency catalog remains usable.
7. As a Guest, I want to configure one Target Currency, so that I can try the core conversion experience without an account.
8. As an Approved Member, I want to configure one to three Target Currencies, so that I can compare a price in several currencies at once.
9. As a shopper, I want conventional notation for USD, EUR, JPY, GBP, CNY, KRW, TWD, HKD, AUD, CAD, SGD, and CHF to be recognized, so that common travel and shopping currencies work predictably.
10. As a shopper in Japan, I want notation such as `¥4,142`, `￥4,142`, and `4,142円` to resolve to the same JPY amount, so that suffix and full-width forms work.
11. As a shopper, I want every confident Detected Price outlined, so that I can tell whether TagLingo sees the tags in view.
12. As a shopper, I want only the Detected Price nearest the central focus reticle converted, so that multiple visible tags do not clutter or confuse the camera view.
13. As a shopper, I want the focused rectangle to follow the recognized price rather than a whole OCR line, so that I can see exactly which amount produced the conversion.
14. As a shopper, I want the Focused Price and rectangle to remain stable across brief OCR misses, so that the overlay does not flicker.
15. As a shopper, I want a changed price to replace the previous value only after consistent observations, so that one bad frame does not show a false conversion.
16. As a shopper, I want each converted value to show its Target Currency code, so that similarly formatted currencies are not confused.
17. As a shopper, I want to see the Reference Rate used for each conversion, so that I can understand the calculation.
18. As a shopper, I want to see the rate's effective date, so that “current” is not confused with the time the application fetched it.
19. As a shopper, I want a concise note that my payment rate may differ, so that I do not mistake an estimate for a card, cash, or merchant quote.
20. As an offline shopper, I want the last validated Rate Snapshot to continue working for up to seven days, so that temporary connectivity loss does not stop shopping.
21. As an offline shopper, I want cached conversions labeled with their effective date, so that I know the rate is not freshly downloaded.
22. As a shopper with a snapshot older than seven days, I want conversion to stop with a reconnect action while price recognition continues, so that stale data is not presented as current.
23. As a Guest, I want my Source Currency and one Target Currency remembered in the current browser, so that I do not reconfigure every visit.
24. As a Guest, I want to request member access by email, so that I can ask for synchronized and multi-currency features.
25. As a pending applicant, I want a neutral confirmation while retaining Guest access, so that I understand the request was received without receiving premature privileges.
26. As an administrator, I want to approve, reject, or directly invite people through Clerk, so that the prototype does not require a custom administration application.
27. As an approved invitee, I want to complete registration and sign in, so that TagLingo can restore member capabilities.
28. As an Approved Member, I want my Source Currency and up to three Target Currencies saved to my account, so that my setup follows me to another device.
29. As an Approved Member, I want signing out to return the application to Guest limits without deleting my account preferences, so that the public and member experiences remain distinct.
30. As a suspended member, I want active sessions revoked and protected resources denied, so that suspension is effective immediately.
31. As a privacy-conscious shopper, I want camera frames, OCR text, and Detected Prices to remain on my device, so that scanning does not disclose what I am viewing.
32. As a Guest, I want FX access to be cached and rate-limited server-side, so that the public scanner cannot exhaust an upstream service.
33. As an Approved Member, I want every preference request scoped to my authenticated identity, so that I cannot read or overwrite another person's settings.
34. As a tester, I want preview deployments protected while production Guest access remains public, so that unfinished changes are not exposed.
35. As an iPhone user, I want TagLingo to be installable to the Home Screen, so that it feels like a focused camera utility.
36. As a user of assistive technology, I want currency controls, permission states, errors, and non-camera settings to be keyboard- and screen-reader-accessible, so that the application is operable without relying only on the visual overlay.
37. As a user on a slow connection, I want visible OCR-model preparation progress, so that a lazy language download is not mistaken for a broken camera.
38. As a user when no price is recognized, I want guidance to hold steady, improve lighting, or move closer, so that failure is actionable.
39. As a user when one Target Currency rate is unavailable, I want other valid conversions to continue, so that a partial FX failure does not erase all results.
40. As the owner, I want the prototype to remain inside explicit free-tier quotas and fail closed, so that experimentation does not create an unexpected hosting bill.

## Implementation Decisions

### Application shape

- Use a static React single-page progressive web application with thin Fetch-compatible server functions. Do not require server-side rendering.
- Treat the camera preview as the primary mobile surface. Keep account, rate details, and currency configuration outside the recognition overlay when possible.
- Keep interfaces Web-standard so the static application and server handlers can move away from Cloudflare without rewriting domain behavior.

### Deep modules

- **Camera Session:** owns permission explanation, media acquisition, rear-camera preference, visibility lifecycle, video geometry, and focus-region sampling behind a small start/stop/status interface.
- **Recognition Pipeline:** accepts the newest eligible focus crop and a Source Currency profile; returns Detected Price candidates with exact amount, confidence evidence, and preview-coordinate boxes. It owns OCR-worker lifecycle, preprocessing, token extraction, and temporal stabilization.
- **Price Localization:** owns Unicode normalization, Source Currency aliases, grouping and decimal rules, fraction digits, negative evidence, and exact minor-unit parsing. It is independent of the camera and OCR engine.
- **Focus Tracker:** associates candidates across observations, selects the reticle-nearest Focused Price, stabilizes the value and rectangle, tolerates brief misses, and rejects percentage-based amount merging.
- **Currency Catalog:** separates the 12 optimized Source Currencies from the active Target Currency catalog. It owns searchable codes, English names, and supported aliases.
- **FX Gateway:** returns validated dated pair records for one Source Currency and one Guest or up to three member Target Currencies. It owns entitlement checks, batching, provider validation, caching, last-known-good behavior, attribution, and partial failure.
- **Preference Store:** exposes the same preference contract through browser-local Guest storage and authenticated member persistence. It owns validation, migration between defaults and saved values, and member ownership.
- **Access Policy:** converts identity, membership state, and requested capability into an authorization result. UI feature flags consume this result but do not replace server enforcement.

### Price recognition

- Pin and self-host Tesseract.js 7, compatible WebAssembly core files, and versioned `tessdata_fast` language assets.
- Keep one persistent OCR worker and lazily load only the selected Source Currency profile.
- Start with `eng`; `jpn+eng`; `chi_sim+eng`; `chi_tra+eng`; and `kor+eng` profile families, then retain smaller single-language profiles only when measured accuracy is preserved.
- Process only the newest frame. Never build an OCR queue.
- Use a central region of interest, reusable canvases, restrained preprocessing, and an adaptive one-job-at-a-time cadence.
- Use focused single-line recognition for the reticle area and periodic sparse discovery for multiple Detected Prices.
- Derive rectangles from the exact currency-marker and numeric token boxes, using the geometry captured for the sampled frame.
- Use exact minor-unit equality, box overlap, and center distance for temporal association. Require two compatible observations before committing a new value and tolerate brief misses after commitment.
- The agreed viability target is at least 90% correct value-plus-box overall, at least 85% for every optimized Source Currency, a median first correct overlay no greater than 1.5 seconds, and p95 no greater than 3 seconds.
- These targets are not currently validated on iPhone Safari. Do not make a compatibility or production-readiness claim until the deferred physical-device gate is completed.

### FX rates

- Use Frankfurter v2's default multi-provider institutional daily blend through a TagLingo server endpoint.
- Store one validated record per Source/Target pair using decimal strings, provider identity, method, pair codes, value, provider-published date, fetch timestamp, and attribution.
- D1 is the authoritative last-known-good store. KV is a read-through accelerator and never decides validity.
- Revalidate eligible server records no more than every six hours, batch stale or missing quotes, and honor upstream cache validators.
- Never refresh because a camera frame or OCR result changed. Refresh only on application start/resume or a currency-setting change when server revalidation is due.
- A Rate Snapshot is offline-eligible only while its provider-published date is no more than seven calendar days old. A newer fetch timestamp does not renew an older rate.
- If one target fails, stop only that conversion. Preserve recognition and other valid targets.
- Show Frankfurter attribution, the effective date, and “Reference estimate; your payment rate may differ.”
- Keep provider calls free of camera data, OCR text, detected amounts, Clerk identifiers, and account information.

### Identity, admission, and authorization

- Use Clerk Waitlist for access requests, approval, rejection, direct invitations, sessions, and initial administrator operations.
- Pending and invited people receive no member capability until registration completes and an active TagLingo membership exists.
- Separate admission state from application role. The prototype needs member and administrator authority; approval status is not a role.
- Every protected function validates the Clerk session, checks active TagLingo membership, authorizes the capability, and scopes persistence to the stable Clerk user ID.
- Return unauthenticated and unauthorized errors distinctly. Never fetch privileged data and merely hide it in the client.
- Suspension disables membership and revokes active sessions.
- A future TagLingo approval dashboard may replace Clerk's dashboard without changing the admission state model.

### Persistence

- Use D1 for membership state, member preferences, and authoritative FX pair records.
- Guests use browser-local preferences and have no account preference row.
- Member preferences contain one Source Currency and one to three distinct Target Currencies.
- Keep FX records global and account-independent.
- Use SQL migrations and repository interfaces that permit a later move from D1/SQLite semantics to PostgreSQL.
- Do not treat KV as authoritative because it is eventually consistent.

### Deployment and operations

- Deploy the public static application and browser-local OCR assets with Cloudflare Pages from the scoped GitHub integration.
- Run thin API handlers as Pages Functions on Workers Free.
- Use the initial `*.pages.dev` HTTPS hostname; a custom domain is optional and out of scope.
- Protect preview deployments with Cloudflare Access while leaving production reachable to Guests.
- Store secrets in Cloudflare encrypted Worker secrets, never Git or client bundles.
- Enforce Guest FX limits by a signed anonymous actor plus IP and member limits by Clerk user ID plus IP. Cache hits still count toward client limits but do not create upstream traffic.
- Benchmark Clerk verification plus D1 authorization against the Workers Free 10 ms CPU/request ceiling. Workers Paid is an explicit upgrade only if measured usage requires it.
- Treat free-tier quota exhaustion as an error, not permission to bypass authorization or rate validity.
- Keep logs free of camera frames, OCR text, Detected Prices, provider secrets, and unnecessary identity data.

## Acceptance Criteria

1. A fresh Guest can open the HTTPS application, understand and grant camera permission, choose one Source and one Target Currency, and reach the camera experience without signing in.
2. The source selector contains exactly the 12 optimized Source Currencies; the searchable target selector reflects the active provider catalog.
3. Localized parser fixtures cover prefix, suffix, full-width, decimal, grouping, and negative-evidence cases for every optimized Source Currency, including `4,142円`.
4. The overlay can render multiple Detected Price rectangles while converting only the reticle-nearest Focused Price.
5. Candidate tracking requires consistent observations before changing values and does not merge distinct amounts by percentage tolerance.
6. No camera frame, OCR text, or Detected Price appears in application network requests or server persistence.
7. A Guest is limited to one Target Currency and browser-local preferences.
8. A pending applicant remains a Guest; an approved invitee can sign in and restore one to three Target Currencies from another browser.
9. Direct calls to protected preference endpoints fail without an active Approved Member and cannot cross account ownership.
10. Suspension revokes active sessions and denies every protected operation.
11. FX responses expose pair direction, decimal value, provider, method, provider-published date, state, and attribution without confusing fetch time for rate date.
12. Repeated camera conversions cause no FX request; a fresh server cache prevents an upstream request.
13. Offline conversion works through day seven by provider-published date and stops on day eight even if the record was fetched more recently.
14. Partial FX failure disables only affected Target Currencies.
15. Preview deployments require Cloudflare Access while production Guest routes remain reachable.
16. Representative authenticated preference and cached-FX function requests stay within the Workers Free CPU limit under the agreed benchmark; otherwise the prototype records the paid-tier upgrade requirement before launch.
17. Automated checks cover external module behavior, API contracts, authorization, cache validity, localization, focus selection, and main Guest/member journeys.
18. The application clearly states that physical-iPhone OCR accuracy and latency remain unvalidated and makes no older-device or production-readiness claim.

## Testing Decisions

- Test external behavior and stable contracts rather than private implementation details or vendor SDK internals.
- Unit-test Price Localization with table-driven fixtures for every Source Currency, Unicode normalization, aliases, separators, fraction digits, and false-positive contexts.
- Unit-test Focus Tracker with recorded candidate sequences covering multiple boxes, near ties, brief misses, replacements, box jitter, and exact-value changes.
- Unit-test camera-to-preview geometry as pure transformations across portrait, landscape, `object-fit: cover`, resize, and safe-area cases.
- Contract-test FX Gateway validation, pair direction, cache keys, provider-date aging, day-seven/day-eight boundaries, malformed responses, partial outages, ETags, and zero camera-driven refresh.
- Contract-test Access Policy and Preference Store for Guest, pending, approved, suspended, cross-account, and invalid-currency cases.
- Component-test currency search, one-versus-three target limits, rate details, offline labels, permission states, preparation progress, and actionable recognition failures.
- Run browser tests with deterministic mocked media streams and OCR observations for the main Guest and Approved Member journeys. Do not make OCR-engine accuracy depend on flaky live-camera CI.
- Validate Cloudflare integration in protected previews, including D1 migrations, KV staleness handling, encrypted secrets, Clerk verification, and function CPU measurements.
- The deferred 120-tag physical-iPhone corpus remains the only evidence capable of satisfying the OCR accuracy, latency, stability, memory, and thermal targets. Automated desktop tests must not be presented as a substitute.

## Out of Scope

- Production application implementation during Wayfinder.
- Physical-iPhone OCR validation in the current effort.
- Claims of support for older iPhones or production-ready OCR performance.
- Native iOS implementation, TestFlight, App Store submission, or App Review.
- Uploaded camera frames, streaming video, or server-side OCR.
- An opt-in focused-crop OCR fallback before physical-device evidence justifies it.
- A custom TagLingo administrator dashboard.
- Public unrestricted multi-currency or synchronized-preference access.
- Conversion history, favorites, shopping lists, social sharing, teams, billing, or subscriptions.
- Exact card, cash, merchant, or settlement-rate prediction.
- Intraday trading quotes.
- A custom domain.
- A paid hosting, authentication, database, or FX plan unless a measured free-tier gate fails.
- A contractual uptime SLA or commercial launch.

## Further Notes

- Gated-access research: [report](https://github.com/kzokv/taglingo/blob/b5b436ab6f10a947ce76ac38e191a6f22eb6c723/docs/research/gated-access-model.md)
- On-device recognition research: [report](https://github.com/kzokv/taglingo/blob/6c55d6ca6cb10ae57338b5f342f0d4735e128e1c/docs/research/on-device-price-recognition.md)
- FX provider and cache research: [report](https://github.com/kzokv/taglingo/blob/34541f5a63477147b1d6463428eb4a9f0d2e49f8/docs/research/fx-provider-contract.md)
- Free deployment research: [report](https://github.com/kzokv/taglingo/blob/9532ed3539a6c5e606b20a83a61e8f122d5cbcd4/docs/research/free-deployment-architecture.md)
- The existing throwaway prototype was inspected as UI, localization-parser, and integration evidence. It is not the permanent TagLingo codebase and contains no representative OCR ground-truth corpus or physical-iPhone performance evidence.
- The canonical domain vocabulary is maintained in `CONTEXT.md`.
