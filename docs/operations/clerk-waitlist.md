# Clerk Waitlist setup

TagLingo uses Clerk for identity and admission, not for application
authorization. Joining the waitlist, receiving an invitation, or completing a
Clerk registration does not unlock member capabilities. Protected TagLingo
functions must still validate the Clerk session and require an active
TagLingo membership.

This runbook reflects Clerk's dashboard and React SDK as of 2026-07-31.

## Choose the Clerk instance

Use a Clerk **Development** instance while testing locally. Clerk requires an
owned domain and DNS records for a **Production** instance; a `*.pages.dev`
hostname cannot meet that ownership requirement.

Issue #21 can be demonstrated with a Clerk Development instance. For a public
production deployment, a product/deployment decision is required:

1. Add a custom domain that you own to the Cloudflare Pages project and use it
   as the Clerk production primary domain.
2. Keep the deployment non-production and use a Clerk Development instance,
   accepting its development limits and labels.

The first option is the production path, but it changes PRD #15, which makes a
custom domain optional and out of scope. Do not make that scope change as part
of issue #21: record and approve the deployment decision first. Do not put a
`pk_live_` key on an unrelated `*.pages.dev` hostname.

## Configure admission and sign-in

In the intended Clerk instance:

1. Open **Waitlist**, enable **Enable waitlist**, and save.
2. Open **User & authentication**.
3. Require an email address.
4. Enable **Verify at sign-up → Email verification code**.
5. Enable **Sign-in with email → Email verification code**.
6. Disable password and any social sign-in methods that are not part of this
   prototype.
7. Confirm Email is enabled. Clerk cannot send approved waitlist invitations
   when Email is disabled.
8. Keep Clerk's default email templates initially. Send a test invitation and
   inspect **Email logs** for delivery, bounce, spam-report, or suppression
   events.

The application intentionally renders Clerk's prebuilt `<Waitlist />` and
`<SignIn />` components. New Guests enter through Waitlist. Sign-in has
sign-up transfer disabled and is for people with an existing Clerk account.

## Configure abuse and enumeration protection

Open **Attack protection** and:

1. Enable **Bot sign-up protection**. Current Clerk applications use the Smart
   challenge and show it only when sign-up traffic appears automated. Clerk's
   public documentation does not explicitly promise that this challenge covers
   the earlier waitlist-entry request, so verify the actual Waitlist behavior
   before public launch rather than assuming it does.
2. Enable **Strict user enumeration protection** so sign-in does not reveal
   whether an address has an account. If strict mode is too confusing during
   prototype testing, use bulk protection only after recording that tradeoff.
3. If password sign-in is ever enabled, also enable or confirm **Client Trust**.
   Client Trust does not add protection to the email-code method used here.

Do not replace the Clerk component with an unprotected custom email endpoint.
Clerk validates the email, and its create contract returns the existing entry
instead of creating a duplicate for the same address. TagLingo displays the
same neutral policy around the form and does not render submitted addresses or
admission status. If testing shows that Clerk does not challenge abusive
waitlist submissions, treat additional edge protection as a launch blocker;
client-side throttling alone is not a security control.

## Configure domains and redirects

The code fixes the application paths as follows:

- Waitlist: `/?access=waitlist`
- Sign-in: `/?access=sign-in` with hash-based Clerk routing
- Successful sign-in fallback: `/`
- Waitlist's existing-user link: `/?access=sign-in`
- Sign-in's waitlist link: `/?access=waitlist`

Clerk does not expose the production origin model as a generic list of arbitrary
allowed origins. Its current equivalent is a configured primary **Domain** plus
an **Allowed Subdomains** allowlist. For a future Clerk production instance:

1. Open **Domains** and set the owned production domain used by Cloudflare
   Pages.
2. Complete the Clerk-provided DNS records and certificate deployment.
3. Open **Allowed Subdomains**, enable it, and allow only the exact application
   subdomain(s) that need Clerk. The primary domain is already allowed.
4. Do not allow Cloudflare preview hostnames in the production Clerk instance.
   Preview deployments should use a separate Development Clerk application and
   remain behind Cloudflare Access.
5. If an invitation flow offers a redirect setting, use the application's
   exact HTTPS origin plus `/`. Dashboard-created direct invitations otherwise
   use Clerk's Account Portal flow.

No cross-origin redirect is accepted from user input. The application uses
relative redirect paths, so the same build works locally and on the configured
production origin.

## Add keys without exposing secrets

For local development:

```sh
cp .env.example .env.local
```

Replace the placeholder with the Development instance publishable key, then
run `npm run dev`. A Clerk publishable key is client configuration and is
expected in the browser bundle.

For Cloudflare Pages, add `VITE_CLERK_PUBLISHABLE_KEY` as a build environment
variable for the intended environment and redeploy. Use `pk_test_...` only for
the development/preview Clerk instance and `pk_live_...` only with the matching
owned production domain.

Do not add `CLERK_SECRET_KEY` to Vite, Git, `.env.example`, or any client
bundle. The Approved Member preference function requires it as an encrypted
Cloudflare secret and reads it only in Pages Functions. See
[Approved Member operations](./member-access.md) for the D1 membership,
authorized-party, synchronization, and suspension procedure.

Without a publishable key, TagLingo deliberately keeps the Guest scanner
available and shows that access requests are temporarily unavailable.

## Owner acceptance demonstration

Use unique test addresses and record the result without committing addresses
or screenshots containing personal data.

1. **Pending:** Join from the public TagLingo surface. Confirm a neutral receipt
   message, a pending entry in **Waitlist**, no member capability, and the
   one-Target Guest limit.
2. **Approve/invite:** On **Waitlist**, open the row menu and select **Invite**.
   Confirm the invitation email arrives. Before registration completes, confirm
   the invitee still has only Guest access.
3. **Reject:** For a second pending entry, use the row menu's current deny
   operation (**Revoke** in Clerk's current UI). Confirm it cannot register or
   gain member access.
4. **Direct invite:** Open **Invitations**, create an invitation for a third
   address, and confirm the email and Account Portal registration path work.
5. **Existing sign-in:** Complete registration for the invited test user, open
   **Sign in with an existing Clerk account**, and authenticate with the email
   code.
   Identity alone must still leave the app in Guest mode until a later
   server-side membership workflow creates an active TagLingo membership.
6. **Repeat/automation:** Submit the same waitlist address again and confirm no
   duplicate privilege is created. Exercise a suspicious automated attempt in
   a safe test environment and confirm Clerk challenges or rate-limits it.
7. **Secret audit:** Build the site and search `dist/` for `sk_test_` and
   `sk_live_`; both searches must return no matches.

Approval, rejection, direct invitation, email delivery, and production-domain
setup are human-owned Clerk operations. They cannot be truthfully marked
complete by the repository test suite alone.
