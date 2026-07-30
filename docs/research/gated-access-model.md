# Gated access and account approval for TagLingo

**Status:** Wayfinder research recommendation

**Date:** 2026-07-30

**Question:** How should a small, publicly deployed TagLingo prototype offer a restricted guest experience while reserving full functionality for administrator-approved accounts?

## Recommendation

Use an **approval queue with direct-invite support**, not a pure allowlist and not a
deployment-wide login wall:

1. Publish a deliberately limited guest scanner.
2. Let a guest request access by email.
3. Let an administrator approve or reject the request.
4. Only an approved user can create a persistent account and sign in.
5. Enforce approved-member capabilities at every server resource, not only in the UI.
6. Keep preview and staging deployments behind an infrastructure-level access gate.

For the prototype, the shortest implementation path is **Clerk Waitlist mode** for
authentication and approval, plus a small server-owned membership/preferences store.
Clerk's current waitlist flow collects requests, exposes `pending`, `invited`,
`completed`, and `rejected` states, and lets an administrator invite or deny an entry.
Existing or approved users may sign in while new users must join the waitlist
([Clerk restrictions](https://clerk.com/docs/guides/secure/restricting-access),
[waitlist component](https://clerk.com/docs/react/reference/components/authentication/waitlist),
[waitlist entry type](https://clerk.com/docs/reference/backend/types/backend-waitlist-entry)).
An administrator can also send a direct invitation when the tester is already known
([Clerk invitations](https://clerk.com/docs/guides/users/inviting)).

This is similar in intent to Vakwen but changes its onboarding surface: Vakwen uses
administrator-issued invitations; TagLingo should accept access requests and turn an
approved request into an invitation.

## What Vakwen actually does

The inspected Vakwen revision is
[`88b8bc6`](https://github.com/kzokv/vakwen/tree/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8).

Vakwen has two distinct entry paths:

- **Demo access is a temporary authenticated session, not a stateless public guest.**
  The login page conditionally offers demo mode
  ([login page](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/web/app/login/page.tsx)).
  Starting it creates a unique demo user, seeds demo data, marks the user with an
  expiry, and signs a demo session cookie. Session creation is limited to five
  requests per IP per minute
  ([demo session route](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/routes/registerRoutes.ts#L2403-L2445),
  [public demo endpoint](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/routes/registerRoutes.ts#L3983-L4007)).
  The server carries `isDemo` in its authorization context and blocks selected
  capabilities such as granting shares
  ([route guard](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/lib/routeGuards.ts#L13-L17)).

- **Permanent onboarding is invite-only Google OAuth.** A new email without an
  invitation is redirected with `invite_required`. The invitation is bound to the
  normalized email, expires, can be revoked, and is consumed after user creation.
  Existing active users may sign in again without another invitation
  ([OAuth callback](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/routes/registerRoutes.ts#L4112-L4230)).
  An administrator creates an invitation for an email and assigned role
  ([invite endpoints](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/routes/registerRoutes.ts#L4033-L4109)).
  The database records expiration, revocation, use, and issuer
  ([auth migration](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/db/migrations/030_kzo143_auth_foundations.sql#L63-L82)).

- **Authorization remains a server concern after login.** Vakwen resolves the current
  user on each protected API request, rejects inactive users or stale session
  versions, and then enforces admin/writer route sets
  ([architecture](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/docs/001-architecture/auth-and-session.md)).
  Its roles are `admin`, `member`, and `viewer`, orthogonal to demo and account
  lifecycle state
  ([persistence types](https://github.com/kzokv/vakwen/blob/88b8bc6a37c0d3d8ffa15681b3a3a8af1390e4c8/apps/api/src/persistence/types.ts#L308-L319)).

Vakwen therefore provides a useful enforcement pattern, but it does **not** currently
provide the requested guest-to-pending-to-approved queue. Its “pending invite” means
an invitation has already been issued, not that a visitor is waiting for approval.

## Model comparison

| Model | User flow | Strengths | Costs and risks | Fit for TagLingo |
| --- | --- | --- | --- | --- |
| Invite-only | Admin enters an email; recipient accepts the invitation and signs up. | Smallest attack surface; only known testers can onboard; closest to Vakwen. | Every tester must be known and invited manually; no self-service request path. | Good fallback for a closed alpha, but does not match the requested flow by itself. |
| Approval queue | Guest submits email; admin approves or rejects; approval issues an invitation. | Matches the desired flow; supports discovery while retaining admission control; creates an auditable queue. | Public request form attracts spam; requires bot protection, deduplication, and an approval operation. | **Recommended.** Clerk supplies the queue and invitation lifecycle. |
| Email allowlist | Admin preloads exact emails or a domain; only matches may sign up. | Simple and deterministic for a known group or company domain. | Poor fit for arbitrary testers; domain rules may be too broad; no request/review context. Clerk documents allowlists as a separate restriction mechanism and currently marks the feature as premium ([Clerk restrictions](https://clerk.com/docs/guides/secure/restricting-access)). | Use only if the initial testers are already known; an exact-email allowlist is operationally equivalent to invitations with worse onboarding communication. |
| Deployment-wide gate | Identity-aware proxy, hosting login, password, or trusted IP in front of the whole deployment. | Strongly hides staging and unfinished builds; no application route can be reached first. | Also blocks the intended public guest experience and is not the application's account model. | Use for staging/preview, not for the guest-enabled production hostname. |

## Recommended user flow

### 1. Guest

The production landing page and a restricted `/scan` route are public.

Guest capabilities:

- run on-device price recognition;
- select one source and one target currency;
- see the focused price, conversion, and current FX rate;
- retain settings for the current browser only;
- request access.

Guest exclusions:

- no cloud-saved preferences;
- no second or third target currency;
- no history, cross-device sync, or account area;
- no future enhanced/server OCR;
- no direct access to paid provider credentials or unrestricted proxy endpoints.

The one-target limit is a product affordance, not a security boundary. Browser code
and locally executed OCR can be inspected or modified. Do not claim that client-side
feature flags, `localStorage` counters, hidden buttons, or obfuscated bundles prevent a
motivated visitor from exercising code already downloaded to the device.

### 2. Access requested

The guest submits an email through the waitlist form. Show a neutral confirmation
regardless of whether the email is already present. Add bot protection and server-side
validation to the request. Clerk's create operation is idempotent for an email already
on the waitlist
([waitlist create API](https://clerk.com/docs/reference/backend/waitlist-entries/create)).

Pending users stay in guest mode; they do not receive an application session with
extra privileges. This avoids creating “almost approved” accounts that every API must
remember to constrain.

### 3. Administrator review

For the prototype, review requests in the provider dashboard rather than building a
TagLingo admin portal. The administrator can:

- approve, which sends an invitation;
- reject;
- directly invite a known email.

Clerk also exposes waitlist list/filter and invite/reject operations through its
backend API, leaving a clean migration path to an in-app admin surface later
([waitlist list API](https://clerk.com/docs/reference/backend/waitlist-entries/list),
[Backend API operations](https://clerk.com/docs/reference/backend-api)).

### 4. Approved member

The recipient accepts the invitation, completes sign-up, and receives an authenticated
session. On first successful login, provision a TagLingo membership/preferences row
keyed by the stable provider user ID.

Approved-member capabilities:

- one to three target currencies;
- searchable full FX-provider currency catalog;
- server-saved source and target preferences;
- cross-device preference restoration;
- future approved-only features.

### 5. Suspended member

Suspension is distinct from rejection. Rejecting a waitlist entry prevents onboarding;
suspending an existing member must deny protected resources and revoke their active
sessions. Clerk exposes session revocation through its backend API
([session revocation](https://clerk.com/docs/reference/backend/sessions/revoke-session)).

## State model

Keep identity, admission state, and role separate.

| TagLingo state | Provider representation | Session | Effective access |
| --- | --- | --- | --- |
| `guest` | No waitlist entry or user required | None | Restricted public scanner |
| `pending` | Waitlist `pending` | None | Same as guest |
| `invited` | Waitlist `invited` | None until sign-up | Same as guest |
| `approved` | Waitlist `completed` plus active TagLingo membership | Authenticated | Full member features |
| `rejected` | Waitlist `rejected` | None | Same as guest; may be prevented from re-requesting |
| `suspended` | Existing identity plus disabled/suspended membership | Revoke active sessions | No member access; optionally guest access after logout |

Use a separate role only for active accounts:

- `member`: normal approved user;
- `admin`: can review admission and manage access.

For a prototype using the provider dashboard, only `member` needs application UI.
The owner's administrator authority can remain in Clerk. If an application admin page
is later added, its API must check `admin` server-side.

## Enforcement boundary

### Client: presentation only

The client may choose which controls to show, route a guest to the waitlist, and render
member-specific UI. It must not be the authority for membership, quotas, preference
ownership, or API credentials.

### Application server: authoritative capability check

Every route handler or server action that reads or mutates member data must:

1. validate the provider session;
2. resolve the stable user ID;
3. confirm an active approved membership;
4. authorize the specific resource;
5. scope database access to that user.

Next.js recommends secure authorization checks close to the data source in a
centralized data-access layer; proxy/middleware checks are only an optional optimistic
layer and layouts are not sufficient
([Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication)).
Clerk likewise says every Server Component, Route Handler, Server Action, and external
API must protect its own resource
([Clerk content protection](https://clerk.com/docs/nextjs/guides/secure/protect-content),
[route handlers](https://clerk.com/docs/reference/nextjs/app-router/route-handlers)).

Return `401` for no valid session and `403` for an authenticated but inactive or
unauthorized member. Do not fetch privileged data and then merely hide it.

### Database: ownership backstop

Store account preferences under the authenticated provider user ID with a unique
owner key. If Supabase is selected, enable Row Level Security and scope policies with
`auth.uid()`; Supabase warns that user-editable `user_metadata` must not be used for
authorization, while server-controlled app metadata/custom claims can be
([Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)).

Even with database policies, keep server capability checks. They produce clearer
errors and protect non-database operations such as FX-provider calls.

### Hosting edge: staging gate and coarse abuse control

Protect preview/staging separately:

- Cloudflare Access is deny-by-default and places an identity-aware proxy before a
  self-hosted application
  ([Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)).
- Vercel Standard Protection protects preview/deployment URLs but leaves the
  production domain public; protecting all production URLs requires a qualifying
  paid configuration
  ([Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)).

Neither replaces resource authorization. Cloudflare Access on the production
hostname would prevent unauthenticated guest mode, so apply it only to staging or a
separate internal admin hostname.

## Abuse controls

Apply controls to scarce server resources rather than pretending to meter on-device
OCR:

- Validate waitlist requests on the server and place Turnstile on the public request
  form. Cloudflare requires server-side Siteverify validation; tokens are single-use
  and expire after five minutes
  ([Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)).
- Deduplicate normalized emails and avoid revealing whether an address is already
  registered or approved.
- Rate-limit waitlist submissions by IP and normalized email.
- Rate-limit guest FX requests by IP plus a signed anonymous-session identifier;
  rate-limit members primarily by user ID, with IP as an additional abuse signal.
- Cache FX snapshots by provider, base currency, target set, and freshness interval.
  One upstream fetch should serve many scans; camera frame rate must never translate
  into FX request rate.
- Keep all provider secrets server-side and expose only the minimum rate payload.
- Do not accept camera uploads in this prototype. This preserves the already agreed
  on-device privacy boundary and removes the most expensive abuse surface.
- Use an edge rate rule as a coarse shield for `/api/fx` and the waitlist endpoint,
  while retaining exact product quotas in the application. Cloudflare notes that WAF
  rate enforcement can lag and allow some excess requests, so it is not an exact
  quota mechanism
  ([Cloudflare rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)).

## Implementation shortlist

### A. Clerk Waitlist + application database — recommended

Use Clerk Waitlist/Invitations for admission and sessions. Store TagLingo membership
and currency preferences in the selected application database.

Why first:

- implements the desired queue without an admin portal;
- supports direct invitations like Vakwen;
- keeps pending visitors unauthenticated;
- has first-party Next.js server helpers;
- leaves the application's domain model small.

Prototype work still required:

- integrate the provider and hosted/prebuilt auth UI;
- add the public guest scanner and waitlist route;
- add one server authorization helper used by every member resource;
- provision membership/preferences on first approved login;
- add suspension/session-revocation procedure;
- configure production redirect URLs and email delivery.

### B. Supabase Auth + custom approval table

Use Supabase Auth and Postgres for both identity and preferences. Add an
`access_requests`/`profiles.access_status` model and an administrator approval action,
or use server-side `inviteUserByEmail`.

Supabase supplies server-only email invitations, JWT-backed identity, and RLS
([Supabase users and invitations](https://supabase.com/docs/guides/auth/users),
[Supabase Auth](https://supabase.com/docs/guides/auth)).
It also supplies auth endpoint rate limits and CAPTCHA integration
([rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)).

Trade-off: one platform can own identity and persistence, but TagLingo must build and
secure the approval queue/admin operation itself. Open sign-up must not accidentally
grant full access; every RLS policy and server route must handle `pending`.

### C. Vakwen-style custom Google OAuth + invitations

Copy the *pattern*, not the code: email-bound expiring invitations, signed session
cookies, roles, account disable, session-version invalidation, audit logs, and a
temporary demo identity.

This offers maximum control and the closest behavioral match to Vakwen, but it creates
the largest security and maintenance surface. It is not justified for a throwaway
prototype unless avoiding a managed authentication provider is itself a Wayfinder
requirement.

## Prototype scope

Build only:

- restricted public guest scanner;
- waitlist request and confirmation;
- provider-dashboard approval/rejection and direct invite;
- approved sign-up/sign-in/logout;
- server authorization helper;
- per-user saved source currency and up to three target currencies;
- guest/member FX rate limits and caching;
- suspension runbook;
- protected staging deployment.

Defer:

- custom TagLingo admin portal;
- teams, organizations, and granular RBAC;
- social-provider choice beyond one sign-in method;
- uploaded/enhanced OCR;
- account merging;
- complex entitlement or billing systems;
- custom OAuth/session implementation.

## Acceptance checks

1. A fresh browser can scan with one target currency without signing in.
2. A guest cannot read or write `/api/preferences` and cannot obtain unrestricted FX
   proxy access by calling endpoints directly.
3. A request appears as pending and cannot sign in before approval.
4. Approval sends an invitation; accepting it creates one active member record.
5. An approved member can restore one to three target currencies on another device.
6. Client-side removal of hidden/disabled controls does not bypass server checks.
7. Suspending a member revokes sessions and all protected endpoints deny access.
8. Network inspection during scanning shows no camera image or frame upload.
9. Waitlist and guest FX abuse produce controlled `429` responses without exhausting
   the upstream FX service.
10. Preview/staging URLs are inaccessible without the infrastructure gate, while the
    production guest route remains reachable.

## Decision for Wayfinder

Adopt:

- **Admission:** approval queue with direct invites.
- **Prototype provider:** Clerk Waitlist, subject to a final pricing/terms check at
  implementation time.
- **Guest boundary:** on-device scanner, one target, browser-only preferences.
- **Approved boundary:** up to three targets and account-saved preferences.
- **Authority:** resource-level server checks plus user-owned database records.
- **Deployment:** public restricted production; fully gated preview/staging.
- **Abuse:** Turnstile on access requests, cached/rate-limited server FX endpoint, no
  uploaded imagery.

The only reason to choose invite-only instead is a product decision that *no unknown
visitor should be able to run the scanner at all*. In that case, remove guest scanning
and apply a deployment-wide gate during the closed alpha.
