# FX provider and cache contract

Date: 2026-07-30  
Wayfinder ticket: [#9](https://github.com/kzokv/taglingo/issues/9)

## Decision

Use **Frankfurter v2's default multi-provider blend** as TagLingo's prototype
FX source, accessed only through a TagLingo server endpoint. Cache each validated
currency pair by its provider-published date and use the last-known-good record
as the only automatic fallback.

This meets the fixed product contract: dated daily reference rates, the latest
available snapshot while online, reuse for at most seven calendar days, then no
conversion until reconnection. Every rate detail must say:

> Reference estimate; your payment rate may differ.

Do not silently fail over to a commercial market-data feed. Its rate methodology
and timestamp semantics would differ. If the public Frankfurter service later
needs an SLA, make a paid provider an explicit, tested replacement and identify
it in every new snapshot.

## Why Frankfurter

Frankfurter v2 tracks daily rates from institutional sources, requires no API
key, supports filtering by base and quote, and returns `date`, `base`, `quote`,
and `rate` per pair. Its default rate is blended across providers; the
`providers` filter selects a source, while `expand=providers` exposes the
contributors. The public service has no daily or monthly quota, although it
does throttle abuse, and its FAQ permits commercial use subject to each
underlying provider's terms. It can also be self-hosted.
[Frankfurter v2 documentation](https://frankfurter.dev/)

The active catalog currently contains 165 currencies (plus 35 archived), which
is a useful searchable target set. A live check of
[`/v2/currencies`](https://api.frankfurter.dev/v2/currencies) on 2026-07-30
confirmed all twelve required currencies: USD, EUR, JPY, GBP, CNY, KRW, TWD,
HKD, AUD, CAD, SGD, and CHF.
[Frankfurter currency catalog](https://frankfurter.dev/currencies/)

The default blend is preferable to `providers=ECB` for this shopping estimate.
The ECB publishes information-only reference rates around 16:00 CET on working
days, but its documented currency set does not include TWD. The ECB also
strongly discourages transaction use, which supports TagLingo's estimate
disclaimer rather than a payment-rate claim.
[ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
[ECB reference-rate framework](https://www.ecb.europa.eu/stats/pdf/exchange/Frameworkfortheeuroforeignexchangereferencerates.et.pdf)

### Alternatives considered

| Option | Coverage and cost | Decision |
| --- | --- | --- |
| Frankfurter v2 public API | 165 active currencies observed; no key or quota; abuse throttling; $0 | **Prototype primary.** Best match for broad, dated institutional reference data. No contractual SLA. |
| ECB directly | A smaller official set; daily around 16:00 CET; TWD absent | Not sufficient alone. Excellent semantics and explicit acknowledgement-based reuse, but misses a required source currency. |
| Bank of Canada directly | Daily indicative averages published by 16:30 ET; its current table includes all twelve required currencies | Not the primary because its target catalog is much smaller. Its terms permit reuse with attribution and accuracy obligations, making it a possible future constrained source. [Rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/), [terms](https://www.bankofcanada.ca/terms/) |
| Open Exchange Rates | Over 200 currencies; free plan is USD-base, hourly, 1,000 requests/month; Developer is $12/month for 10,000 requests and arbitrary bases | Best keyed replacement candidate if an operational contract is later needed, but its market-feed timestamp is not the same product as an institutional daily publication date. [Pricing](https://openexchangerates.org/signup), [API format](https://docs.openexchangerates.org/) |
| Fixer | 170 currencies; free plan has 100 requests/month; Basic is $14.99/month, 10,000 requests, commercial use, hourly updates and arbitrary bases | Viable keyed alternative, but costs more and also changes the rate semantics. [Official pricing](https://fixer.io/) |

Open Exchange Rates or Fixer keys must remain server-side. Frankfurter has no
secret, but the proxy is still required for validation, coherent caching,
entitlement enforcement, abuse controls, and the ability to change providers
without shipping a new client.

## Rate semantics

- A record means **one unit of `base` equals `value` units of `quote`**.
  Conversion is `sourceAmount × value`; Frankfurter intentionally has no
  conversion endpoint.
- Call the data a **daily reference rate**, never real-time, current trading,
  card, cash, or merchant rate.
- `providerPublishedDate` is copied from Frankfurter's row-level `date`. It is
  the date the returned rate represents, not the time TagLingo requested it.
- `fetchedAt` is TagLingo's UTC request-completion timestamp. It is useful for
  diagnostics only and must never renew or substitute for
  `providerPublishedDate`.
- Frankfurter's default blend can include providers whose own publication dates
  differ. `expand=providers` demonstrates those contributor dates. The normal
  response's row-level date remains TagLingo's user-facing date; retain expanded
  provenance in sampled diagnostics, not in every mobile payload.
  [Provider attribution](https://frankfurter.dev/#provider-attribution)
- A pair is offline-eligible only while
  `now - providerPublishedDate <= 7` calendar
  days. Re-fetching the same old date does not reset that age.
- Display the exact pair rate and effective date. If multiple selected targets
  have different dates, show a date on each line rather than implying one shared
  date.

## Server and cache contract

The client calls one TagLingo endpoint with the selected source and target codes,
for example `GET /api/fx/latest?base=JPY&quotes=TWD,AUD`. It never calls
Frankfurter directly.

Store canonical pair records independently so target combinations do not
fragment the upstream cache:

```json
{
  "schemaVersion": 1,
  "source": "frankfurter-v2",
  "method": "institutional-daily-blend",
  "base": "JPY",
  "quote": "TWD",
  "value": "0.19768",
  "providerPublishedDate": "2026-07-30",
  "fetchedAt": "2026-07-30T07:18:12Z",
  "attribution": {
    "label": "Frankfurter",
    "url": "https://frankfurter.dev/"
  }
}
```

Use decimal strings at the storage/API boundary. Validate ISO code membership,
`base != quote`, a finite positive decimal, a valid ISO date, and exact
base/quote agreement before replacing a last-known-good pair.

- Pair key: `fx:v1:frankfurter-v2:blend:<BASE>:<QUOTE>`.
- Catalog key: `fx:v1:frankfurter-v2:active-currencies`.
- Batch all stale/missing requested quotes into one upstream request; split the
  validated response into pair records.
- Refresh on app start, a currency-setting change, or return to foreground only
  when the server record is eligible for revalidation. Never refresh on an OCR
  result or camera frame.
- Revalidate no more than every six hours and honor the upstream `ETag` and
  `Cache-Control`; a scheduled refresh may run four times daily. Frankfurter
  explicitly relies on edge caching, and its live API currently returns an ETag
  and a next-update-oriented public cache lifetime.
- The TagLingo response should use
  `Cache-Control: private, max-age=3600, stale-while-revalidate=21600` and an
  ETag derived from `source + base + quote/date/value tuples`. Do not put
  authorization-dependent responses in a shared public cache.
- Persist the most recent validated response in browser storage for offline use.
  Rates are global, not account data; account storage holds only currency
  preferences.
- Refresh the active currency catalog daily. The searchable selector uses its
  ISO code and English name, while the localized OCR source list remains the
  separately approved twelve-currency set.

The camera loop only multiplies detected prices by already loaded rates.
Changing from one frame per second to thirty frames per second must cause
**zero** additional FX requests.

## Access and abuse limits

These are TagLingo product limits, independent of Frankfurter's unspecified
abuse throttle:

- Guest: one quote per request; 30 requests/hour/IP with a 10-request/minute
  burst.
- Approved member: up to three quotes per request; 120 requests/hour/account
  with a 20-request/minute burst.
- Reject duplicate quotes, unsupported codes, excessive query size, and all
  member-only quote counts before any upstream call.
- A cache hit still counts against the client limit, but not against upstream
  traffic. Normal use should be only a few requests per session.

## Outage and stale behavior

1. If online refresh succeeds, return `state: "current"` with each pair's
   `providerPublishedDate`.
2. If refresh or connectivity fails and every requested pair is at most seven
   days old, return `state: "cached"` and show
   **“Offline · rate from YYYY-MM-DD”** (or “Rate service unavailable” when the
   browser is online). Continue conversions.
3. If one target is missing or older than seven days, stop conversion for that
   target only. If all targets fail, keep OCR and price detection working but
   show a reconnect action.
4. Never extend the seven-day window because of HTTP `stale-if-error`, a new
   `fetchedAt`, or a service-worker response.
5. Promote a response only after validation; malformed, zero, negative,
   mismatched, or unexpectedly incomplete rows leave the last-known-good record
   untouched.

## Attribution, licensing, privacy, and cost

Show **“Rates: Frankfurter · date YYYY-MM-DD”** in rate details, linked to the
service, plus the fixed estimate disclaimer. Frankfurter's software is MIT
licensed, but that license covers the software, not every upstream dataset.
Frankfurter itself says to consult provider terms. Before public commercial
launch, review the contributing-provider terms or move to a paid feed whose
contract expressly covers the intended redistribution.
[Frankfurter software license](https://github.com/lineofflight/frankfurter/blob/main/LICENSE),
[Frankfurter providers](https://frankfurter.dev/providers/)

The prototype provider cost is $0; only TagLingo hosting and cache storage cost
money. There is no public-service SLA, so monitor fetch success, response age,
validation failures, and the percentage of requests served from stale cache.

Only currency codes leave TagLingo. Camera frames, OCR text, detected amounts,
account IDs, and user identity never go to the FX provider. Frankfurter says
its API does not collect personal data, although its public deployment uses
Cloudflare and Cloudflare collects basic analytics. The server proxy also keeps
end-user IP addresses away from Frankfurter.
[Frankfurter privacy FAQ](https://frankfurter.dev/#faq)

## Prototype acceptance checks

- All twelve source codes appear in the active catalog and each can obtain a
  positive rate to at least one different target.
- A JPY request for TWD and AUD returns two independently dated pair records.
- A repeated request and every camera-frame conversion create no upstream call
  while the server cache is fresh.
- Offline records work through day seven by `providerPublishedDate` and fail on
  day eight, even if `fetchedAt` is newer.
- Provider failure, partial data, malformed values, and a changed provider date
  exercise the outage rules.
- Guest/member quote-count and request-rate limits are enforced server-side.
- No response or log contains a camera frame, OCR string, detected amount,
  Clerk identifier, provider secret, or other account data.
