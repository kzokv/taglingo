# Recognition-health privacy and operations

Recognition-health sharing is an optional browser-local setting. It defaults to
off for Guests and Approved Members, is independent of camera permission, and is
never written to member preferences. The first completed camera session shows a
single invitation; consent applies only to later camera sessions. Choosing “Not
now” keeps the invitation dismissed, while Privacy settings remain available.

## Submitted contract

An opted-in session makes at most one `POST /api/recognition-health` request when
it closes. The request uses `credentials: "omit"`, no referrer, and no retry or
offline queue. Schema version 1 contains exactly these categories:

- app release and schema version;
- `ios-safari`, `android-chrome`, or `other` platform family;
- Source Currency;
- bucketed time to readiness, first Detected Price, and first Focused Price;
- bucketed pass, miss, focus-change, and stable-detection counts;
- one fixed terminal outcome; and
- one fixed broad error family.

The endpoint rejects cookies, authorization, unknown fields, unknown enum values,
free-form errors, oversized bodies, and invalid outcome/error combinations. It
does not log request bodies, headers, error payloads, or exception details.

Camera frames, OCR text, price values, Detected or Focused Prices, Entered Prices,
coordinates, exact timestamps or durations, event order, device details, URL,
referrer, locale/country, Target Currencies, membership state, identifiers,
messages, and stacks are outside the contract.

## Aggregation and retention

Valid summaries increment a matching row in
`recognition_health_daily_aggregates`; no individual summary table exists. Each
ingestion deletes aggregate cells older than 90 days before incrementing the
current UTC day. The D1 database, replicas, and backups must use the same 90-day
maximum retention policy.

Successor issue #56 owns scheduled cleanup during periods with no ingestion and
the executable thresholded reporting layer. Until that work is deployed, no
recognition-health dashboard or export is permitted; ingestion-time cleanup is
defense in depth, not the complete scheduled-retention control.

There is intentionally no public reporting endpoint. Any operator dashboard or
export must enforce all of these rules before deployment:

- require at least 30 summaries in a rolling seven-day cell;
- progressively remove release, platform, or Source Currency below threshold;
- never reveal suppressed counts or enable parent-minus-child reconstruction;
- restrict access to named, audited operators; and
- use results only for recognition reliability, regression, error health, and
  Camera-supported evidence.

Do not use these aggregates for engagement, advertising, experimentation,
profiles, account decisions, or individual support.

## Kill switch and changes

Set `RECOGNITION_HEALTH_INGESTION_ENABLED=false` to return `503` before parsing or
aggregation. Clients drop that failed submission.

Any schema field, value, purpose, dimension, or retention expansion requires a
privacy review. If the shopper disclosure changes, require renewed consent rather
than silently reusing the existing browser choice.
