# Free deployment and persistence architecture

Date: 2026-07-30  
Wayfinder ticket: [#12](https://github.com/kzokv/taglingo/issues/12)

## Decision

Use **Cloudflare Pages + Pages Functions on the Workers Free plan**, with:

- **Pages** serving the static React camera/PWA and browser-side OCR assets;
- **Pages Functions** owning `/api/preferences` and `/api/fx/latest`;
- **D1** as the authoritative store for membership state, per-account currency
  preferences, and validated last-known-good FX pair records;
- **Workers KV** only as a read-through hot cache for FX records;
- **Clerk Waitlist and sessions** for identity/admission; and
- **Cloudflare Access** protecting Pages preview deployments while the production
  `*.pages.dev` hostname remains public to restricted Guests.

This is the lowest-operations architecture that meets the prototype contract at
$0 usage cost. Browser camera access requires a secure context; Pages supplies an
HTTPS hostname, and `getUserMedia()` is unavailable to an insecure document.
[Media Capture specification](https://www.w3.org/TR/mediacapture-streams/),
[MDN camera security note](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

Do not put camera frames, OCR strings, or detected prices in any server request.
The browser downloads the OCR assets once and performs recognition locally.

## Exact responsibility split

| Concern | Owner | Contract |
| --- | --- | --- |
| Production and PWA assets | Cloudflare Pages | Public `taglingo.pages.dev` initially; optional purchased custom domain later. Static delivery does not invoke a Function. |
| Pull-request previews | Pages GitHub integration + Cloudflare Access | Every PR receives a preview URL; Access requires authentication for previews only. Production remains public. [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/) |
| Authentication | Clerk | Waitlist admission and member sessions. Functions verify the session token and its authorized party; Clerk supports networkless verification when its JWT public key is supplied. [Clerk `authenticateRequest()`](https://clerk.com/docs/reference/backend/authenticate-request) |
| Authorization and preferences | Pages Functions + D1 | A Function validates Clerk, checks active membership, then reads/writes only the authenticated Clerk user ID's row. Guests have no D1 preference row. |
| FX proxy | Pages Function | Validate codes/quote count, apply Guest/member entitlement and rate limits, then return a cached pair or make one batched Frankfurter request. Camera activity never triggers it. |
| Authoritative FX cache | D1 | Store decimal value, base, quote, provider-published date, fetch time, and source. Never replace the last-known-good row with malformed or partial data. Reject a row older than seven calendar days by provider date. |
| Hot FX cache | KV | Cache the same dated record after the D1 commit. Treat it only as an accelerator because KV is eventually consistent and remote locations may see an old value for 60 seconds or more. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) |
| Offline cache | Browser service worker/IndexedDB | Cache the last validated API payload; re-check its provider date and stop conversion after day seven. |
| Secrets | Cloudflare encrypted Worker secrets | Clerk secret/public JWT material and future provider keys never enter Git or client bundles. [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) |

Use a static SPA plus thin Web-API-style Functions, not framework SSR. Clerk's
backend SDK explicitly supports V8 isolates, including Cloudflare Workers.
[Clerk backend-only SDK](https://clerk.com/docs/guides/development/sdk-development/backend-only)

Rate-limit the FX endpoint in code by anonymous actor/IP for Guests and Clerk user
ID for members. Cloudflare's Worker rate-limit binding supports different
user/resource keys, but its counters are permissive, eventually consistent, and
local to a Cloudflare location, so it is abuse protection rather than billing-grade
accounting. [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Why the free tier is sufficient

- Pages Free permits 500 builds/month, one concurrent build, 20,000 files,
  25 MiB per file, 100 custom domains, and unlimited active preview deployments.
  [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- Static asset requests are free and unlimited. Dynamic Functions share the
  Workers Free allowance of **100,000 requests/day**, **10 ms CPU/request**,
  128 MiB memory, and 50 subrequests. Waiting on `fetch`, D1, or KV does not count
  as CPU. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Workers use lightweight isolates instead of per-application VMs, avoiding the
  traditional VM/container cold-start model. [How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/)
- D1 Free includes **5 million rows read/day**, **100,000 rows written/day**, and
  **5 GB total storage**, with 500 MB per database. Its always-on Time Travel
  provides seven-day point-in-time recovery on Free. Quota exhaustion fails
  requests instead of creating an overage bill.
  [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
  [D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
  [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- KV Free includes 100,000 key reads/day, 1,000 writes/day, and 1 GB storage;
  exceeding a limit makes that operation fail. The six-hour FX revalidation
  policy is far below its write quota.
  [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- GitHub pushes can build/deploy automatically, including a public repository,
  while the GitHub App can be restricted to this repository.
  [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- Workers run on Cloudflare's global network, which includes a Taipei location;
  D1 automatically places a new primary close to the database-creation request.
  [Cloudflare network locations](https://developers.cloudflare.com/network-interconnect/static/cni-locations-05-may-2026.pdf),
  [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)

Cloudflare's Free plan documentation does not label Workers/Pages as
personal-only or non-commercial. Normal Cloudflare terms and abuse controls still
apply. This contrasts with Vercel Hobby's explicit non-commercial restriction.

### Account, card, and domain

A normal Cloudflare account requires email verification; the Workers/Pages Free
setup does not document a payment-card prerequisite.
[Cloudflare account setup](https://developers.cloudflare.com/fundamentals/account/create-account/)
However, **Cloudflare Access onboarding requires payment details even on Zero Trust
Free**, although Cloudflare says the Free plan is not charged.
[Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/)

No domain purchase is required for the prototype: `*.pages.dev` is a public HTTPS
production hostname. A custom apex domain is supported, but owning the domain is a
separate cost and apex setup requires Cloudflare nameservers.
[Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## Limits and upgrade triggers

Workers Paid is **not required by any agreed prototype feature**. Keep Free and
fail closed at its quotas. Before launch, benchmark Clerk verification plus D1
authorization on the deployed Function. The 10 ms CPU ceiling is the material
risk: Cloudflare says authentication and SSR workloads commonly consume
10–20 ms. Upgrade to Workers Paid (minimum $5/month) only if the thin API
consistently exceeds 10 ms, dynamic traffic approaches 100,000/day, or more than
50 subrequests are genuinely needed. Paid also creates overage exposure, so set
CPU limits and alerts.

Other failure modes:

- Pages and Functions have no SLA on Free.
- D1/KV daily quota exhaustion causes application errors until reset; serve an
  already valid browser-cached FX record where possible, never bypass authorization.
- KV must not decide the seven-day boundary; every returned record is age-checked.
- D1 Free Time Travel is useful recovery, not an independent long-retention backup.
  Export D1 regularly before this becomes valuable user data.
- The public Guest scanner can attract abuse. Enforce quote count, burst/hour
  limits, input size, cache-first behavior, and a hard no-image API contract.

## Managed alternatives

| Option | Current free facts | Decision |
| --- | --- | --- |
| **Cloudflare Pages/Functions + D1/KV** | No traditional cold start; globally served static app; 100k dynamic requests/day; durable SQL plus seven-day recovery; protected previews; one provider and one codebase. | **Choose.** Best Taiwan latency, fewest accounts, and no inactivity pause. |
| Vercel Hobby + Supabase Free | Vercel includes HTTPS/CDN, 100 GB transfer, 1M edge requests and Function invocations, and protected previews, but Hobby is expressly personal/non-commercial and protected external access is limited to one external user. Supabase provides 500 MB Postgres and 5 GB egress but pauses low-activity Free projects after seven days, has no Free automatic backups, and restoration is available only for 90 days after pause. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Supabase pricing](https://supabase.com/pricing), [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing/) | Reject for this public prototype. It adds a second failure/account boundary, can wake slowly after inactivity, and creates a license boundary if TagLingo becomes commercial. Singapore, Tokyo, and Seoul database regions are available, and a single Vercel Function region can be selected near it. [Supabase regions](https://supabase.com/docs/guides/platform/regions), [Vercel regions](https://vercel.com/docs/functions/configuring-functions/region) |
| Deno Deploy Free + Deno KV | 1M requests/month, 20 GB egress, 15 CPU-hours, 350 GB-hours memory, 1 GiB KV, 50 custom domains, GitHub deployment, TLS, and secrets. Free is described as “personal use and smaller projects”; authenticated invocations are not included, and the current platform documents no reliability SLA. [Deno pricing](https://deno.com/deploy/pricing), [Deno GitHub apps](https://docs.deno.com/deploy/reference/apps/), [Deno domains](https://docs.deno.com/deploy/reference/domains/) | Credible code-portable fallback, but weaker today: only two runtime regions are documented, Free cannot select the KV write region, and preview protection would need TagLingo auth rather than an infrastructure gate. |

Time-limited credits are not ongoing free hosting: Vercel Pro is a 14-day trial,
Oracle adds $300 for 30 days, and Google adds $300 for 90 days. Only each
provider's explicitly Always Free/Free Tier resources survive those promotions.

## Ongoing free VM/VPC alternative

If control of a Linux VM matters more than low operations, use one **Oracle Cloud
Always Free Ampere A1 VM** running Ubuntu ARM64:

- one A1 instance allocated **2 OCPUs and 12 GB RAM**;
- a 50 GB boot volume within the **200 GB** combined Always Free block allowance;
- Caddy for HTTPS, one app/API container, and SQLite on the block volume;
- application-owned Clerk verification, preferences, FX cache, and rate limits;
- GitHub Actions deploying a pinned container over SSH; and
- a separate staging hostname protected by Caddy authentication or Cloudflare
  Access.

OCI includes 10 TB/month outbound transfer and a public IPv4. These resources are
Always Free for the account, not merely trial credits.
[OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

This is the better genuinely ongoing-free VM than Google Compute Engine, but it is
still the **fallback**, not the recommendation:

- Oracle requires a mobile number and credit card for most signups, and the
  home region cannot later be changed. Capacity for free shapes can be
  unavailable. [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm),
  [OCI signup](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm)
- OCI has no Taiwan commercial region. Choose Tokyo or Osaka if offered during
  signup; Singapore and Seoul are alternatives.
  [OCI region list](https://www.oracle.com/apac/cloud/public-cloud-regions/)
- Oracle may reclaim a VM whose CPU, network, and (for A1) memory all remain
  below 20% over seven days. Free capacity also has no SLA or support beyond the
  community. An inactive account may be treated as abandoned.
  [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
  [OCI Free Tier FAQ](https://www.oracle.com/apac/cloud/free/faq/)
- The VM does not supply a usable branded public HTTPS hostname. A reliable
  custom domain is therefore an external requirement; if the user does not
  already own one, this alternative is not an end-to-end $0 deployment.
- The owner must patch Linux, rotate secrets, configure firewall/backups,
  monitor disk/certificates, and recover the service. SQLite backups must leave
  the VM because block storage is not an independent backup.

Google's ongoing Compute Engine Free Tier is weaker for TagLingo: it covers one
`e2-micro` only in Oregon, Iowa, or South Carolina, 30 GB standard disk, and
1 GB outbound/month—not the available Taiwan region. A conventional public VM
also pays **$0.005/hour** for its in-use external IPv4 after only one free
hour/month, about $3.65 for a 730-hour month.
[Google Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features),
[Google external IP pricing](https://cloud.google.com/vpc/network-pricing),
[Google Taiwan region](https://docs.cloud.google.com/compute/docs/regions-zones)
Google requires a billing account and payment-method verification; its $300
90-day credit is a trial, not an ongoing hosting allowance.

## Exit path

Keep the application at Web-standard boundaries: a static Vite build, Fetch API
handlers, SQL migrations, a `PreferenceRepository`, and an `FxCache` interface.
D1 exports as SQLite/SQL; the same schema can move to PostgreSQL, and KV is
disposable. If Cloudflare Free becomes limiting:

1. move to Workers Paid without changing architecture;
2. move D1 to managed PostgreSQL if relational needs outgrow SQLite semantics;
3. deploy the same static build to another CDN and the Fetch handlers to Deno,
   Vercel, or a container; and
4. retain Clerk IDs as external identity keys so authentication migration is
   independent of preference data.

## Implementation gate

Before calling this deployment-ready, verify in a preview environment:

- camera and PWA installation work on the intended iPhone over HTTPS;
- Access blocks every preview URL but not production;
- Guest/member quote counts and request limits are server-enforced;
- a valid Clerk member can only read/write their own preferences;
- KV staleness, Frankfurter failure, malformed data, day seven, and day eight
  exercise the D1/browser fallback contract;
- Function CPU stays below 10 ms at p95 for cache hits and authenticated
  preference operations; and
- no request, response, log, D1 row, or KV entry contains camera imagery, OCR
  text, or a detected price.
