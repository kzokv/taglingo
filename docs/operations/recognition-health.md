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
ingestion retains only the current UTC daily bucket and previous 89 buckets
before incrementing the current day. The day exactly 90 days before the current
day is expired. The separately deployed retention worker in
`wrangler.recognition-health-retention.jsonc` repeats cleanup every day, including
days with no ingestion. Keep its `DB` binding on the same production database as
the Pages application. A failed scheduled invocation must alert the operator and
be retried before any cell can become more than 90 days old.

The application delete is based on UTC daily buckets and never retains more than
90 bucket dates. Configure every D1 replica, Time Travel or point-in-time recovery
facility, snapshot, export, and backup with a maximum 90-day lifecycle.
Application deletes do not shorten a provider backup by themselves. Do not ship
until restore tests prove that data older than 90 days cannot be recovered.

## Thresholded operator reports

`GET /api/recognition-health?purpose=<purpose>` is the only application report
interface. It requires a valid Clerk session for a named, active TagLingo
administrator. Every successful read first records the Clerk user ID, purpose,
fixed seven-day window, and request time in
`recognition_health_operator_audit`. The audit contains no shopper summary or
result count and is itself removed by the 90-day cleanup. Denied requests expose
no report and rely on the existing authentication audit trail.

The four allowed purposes are `reliability`, `regression`, `error-health`, and
`camera-supported-evidence`. There are no custom date, dimension, raw-cell, or
suppressed-cell queries. Each result uses the current UTC day and previous six
days and applies this fixed hierarchy:

1. release, platform, and Source Currency;
2. platform and Source Currency;
3. Source Currency; and
4. no release, platform, or Source Currency dimension.

If any cell at a level has fewer than 30 summaries, the whole result moves to the
next level. The response is emitted at one level only, and only cells with at
least 30 summaries are returned. It never returns totals, suppressed counts, or
overlapping parent and child cells, so supported queries cannot calculate a rare
cell by subtraction. Invalid or unexpectedly sub-threshold storage output fails
closed with `503`.

Do not use these aggregates for engagement, advertising, experimentation,
profiles, account decisions, or individual support.

## Transport and logging controls

The submitted request must travel only over HTTPS. Do not enable application
request logging, body sampling, tracing payload capture, replay, analytics over
edge request buffers, or Logpush fields that contain bodies, authorization,
cookies, or query results. The Pages handler returns detail-free failures and
does not call the console.

If the hosting provider unavoidably buffers encrypted transport data, deployment
owners must prove that the buffer:

- is encrypted in transit and at rest;
- is accessible only to a restricted service identity and named security
  responders;
- cannot be queried, joined, exported, or used as analytics; and
- is automatically destroyed within 24 hours, including replicas and recovery
  copies.

Record the provider control identifier, access policy, configured TTL, and a
destruction test in the external deployment-evidence contract. A provider
default or contract without verified configuration is not sufficient.

## Kill switch and changes

Set `RECOGNITION_HEALTH_INGESTION_ENABLED=false` to return `503` before parsing or
aggregation. Clients drop that failed submission.

Any schema field, value, purpose, dimension, or retention expansion requires a
documented privacy review before implementation. Review additions to broad error
families and Camera-supported evidence in the same way. If the shopper disclosure
changes, increment the consent contract and require renewed consent rather than
silently reusing the existing browser choice.

An active administrator may invoke `DELETE /api/recognition-health` as a manual
recovery control; it runs the same retention operation as the scheduled worker.
This does not replace the daily schedule. The POST kill switch is independent of
reporting and retention, so operators can stop ingestion while cleanup continues.

## Deployment gate

Before enabling ingestion or any report, retain evidence for every row. The
preflight rejects missing, stale, placeholder, or mismatched evidence:

| Control | Executable check | Deployment evidence |
| --- | --- | --- |
| Aggregate only | `cloudflareRecognitionHealth.test.ts` verifies delete-plus-upsert and the migration contains no individual-summary table | Inspect production D1 schema after migrations 0003 and 0004 |
| Suppression and subtraction resistance | Store and API tests verify 30-summary filtering, progressive coarsening, a single output level, and fail-closed output | Exercise sparse seeded cells; save only the thresholded response, never the seed data |
| Retention | Store and retention-worker tests verify the 90-day cutoff without ingestion | Confirm the daily Cron Trigger, alert, D1 replicas, recovery, exports, and backups are all at most 90 days |
| Logging and transport | Pages deployment test verifies detail-free failures with no console calls | Verify HTTPS, disabled payload capture, restricted non-queryable buffers, and a tested TTL of at most 24 hours |
| Named access and audit | API tests verify fail-deny authorization and audit-before-read | Confirm only active administrator identities can read; review recent audit rows without querying aggregates |
| Purpose and schema | Contract tests reject unknown fields, enum values, errors, query parameters, and purposes | Attach the approved privacy review for any changed contract |
| Kill switch | API and Pages tests verify `false` stops D1 access before parsing | Set the production value to `false`, verify `503` and no new aggregate, then restore deliberately |

Run the focused deployment checks with:

```sh
npx vitest run \
  src/recognitionHealth/recognitionHealth.test.ts \
  src/recognitionHealth/recognitionHealthApi.test.ts \
  src/recognitionHealth/cloudflareRecognitionHealth.test.ts \
  src/recognitionHealth/recognitionHealthRetentionWorker.test.ts \
  functions/api/recognition-health.test.ts \
  scripts/check-recognition-health-deployment.test.ts
```

The checked-in retention configuration is a non-deployable template. Copy it to
the gitignored `wrangler.recognition-health-retention.production.json`, inject the
production D1 ID through the protected deployment process, and keep the file as
strict JSON. Store the completed evidence contract outside the repository; use
`recognition-health-deployment-evidence.example.json` only as its field template.
The evidence stores a SHA-256 binding to the D1 ID, not the ID itself, and all
evidence references must point to the restricted external control system. Each
control has its own concrete proof URI; proof URIs cannot be reused between
controls.

Configure two independent values in protected CI: an absolute HTTPS evidence
prefix restricted to the external evidence repository, and the SHA-256 digest
of the exact evidence JSON bytes approved for deployment. The deployer must not
derive either trusted value from the submitted evidence file. Updating the
allowlisted prefix or pinned digest requires the protected CI approval path.

Run this mandatory preflight with the exact config and revision that will deploy:

```sh
npm run recognition-health:deploy:check -- \
  --evidence /restricted/path/recognition-health-evidence.json \
  --config wrangler.recognition-health-retention.production.json \
  --revision 0123456789abcdef0123456789abcdef01234567 \
  --evidence-prefix "$RECOGNITION_HEALTH_EVIDENCE_PREFIX" \
  --evidence-sha256 "$RECOGNITION_HEALTH_EVIDENCE_SHA256"
npx wrangler deploy --dry-run \
  --config wrangler.recognition-health-retention.production.json
npx wrangler deploy \
  --config wrangler.recognition-health-retention.production.json
```

The preflight requires evidence reviewed within 30 days and verifies the
deployment revision, the externally pinned evidence-bundle digest, the protected
HTTPS authority and path, distinct proof references for every control,
non-placeholder D1 binding, daily non-public retention Worker, disabled payload
observability, encrypted/restricted/non-queryable transport buffer with a
maximum 24-hour TTL, primary/replica/backup retention of at most 90 days, passed
restore-expiry proof, enabled scheduler failure alert, named audited thresholded
operator access, kill-switch test, logging test, and contract-test result. It
fails closed when the CI trust configuration, a proof field, or a trusted-path
match is missing, or when proof references are duplicated. A dry run or
deployment without the successful preflight output is not release evidence.
Never put production identifiers, credentials, protected CI values, or the
external evidence file in git or an operator export.
