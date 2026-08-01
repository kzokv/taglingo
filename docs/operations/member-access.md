# Approved Member operations

Issue #22 keeps identity, admission, and application authorization separate:

- Clerk owns registration, sign-in, banning, and session revocation.
- `taglingo_memberships` decides whether a signed-in Clerk user is an Approved
  Member and records the separate application role (`member` or
  `administrator`).
- `member_preferences` stores one Source Currency and one to three Target
  Currencies under the stable Clerk user ID.
- The protected Approved Member FX endpoint serves only the Source/Target pairs
  already stored in that member's preference row, batches one to three targets,
  and rate-limits the stable Clerk user ID plus IP independently from Guests.

An invitation or valid Clerk session does not create a TagLingo membership.
The protected preference function checks the session and active membership
before it reads preference data.

## Configure the Pages Function

Apply both D1 migrations in order, including
`migrations/0002_member_preferences.sql`. Bind that database to the Pages
Function as `DB`.

Configure these server-side Pages values:

- `CLERK_PUBLISHABLE_KEY`: the publishable key for the same Clerk instance used
  by the SPA.
- `CLERK_SECRET_KEY`: an encrypted secret, never a Vite variable.
- `CLERK_AUTHORIZED_PARTIES`: a comma-separated allowlist of exact origins,
  such as `https://taglingo.example`. Use only the intended local or deployed
  origins for that environment.

The browser still receives only `VITE_CLERK_PUBLISHABLE_KEY`.

## Run the member journey locally

The default development command builds the SPA, applies migrations to a
Wrangler-managed local D1 database, and serves both the static app and Pages
Functions on `http://localhost:8788`:

```sh
cp .dev.vars.example .dev.vars
npm run dev
```

Replace the placeholders in `.dev.vars` with server-side values from the same
Clerk Development instance used by `VITE_CLERK_PUBLISHABLE_KEY`. Never copy a
production Clerk secret into local development or commit `.dev.vars`.

Activate a local test Approved Member after that person signs in and you have copied
their stable Clerk `user_...` ID:

```sh
npx wrangler d1 execute DB --local \
  --command "INSERT INTO taglingo_memberships (clerk_user_id, status) VALUES ('user_REPLACE_ME', 'active') ON CONFLICT(clerk_user_id) DO UPDATE SET status = 'active', role = 'member', updated_at = CURRENT_TIMESTAMP"
```

Restart or reload TagLingo after activation. Use `npm run dev:spa` only for
Guest-only frontend work; it intentionally does not serve `/api/*` Functions.

### Change the local origin or port

`CLERK_AUTHORIZED_PARTIES` is an authentication allowlist. It does not choose
the address where Wrangler listens. The default `npm run dev` origin is
`http://localhost:8788` because 8788 is Wrangler Pages' default port.

To run the complete Pages application on another port, make the browser origin
an exact authorized party and pass the port to Wrangler. For example:

```dotenv
CLERK_AUTHORIZED_PARTIES="http://localhost:5173,http://127.0.0.1:5173"
```

```sh
npm run dev -- --port 5173
```

Add `--ip 127.0.0.1` when an explicit IPv4 listener is required. Open the same
origin that appears in the allowlist. Wrangler uses `--ip` and
`--log-level debug`; Vite flags such as `--host`, `--strictPort`, and `--debug`
do not apply to `wrangler pages dev`.

Restart `npm run dev` after changing `.dev.vars`. Reloading the browser alone
does not reload Pages Function environment variables.

### Understand local D1 state

The root `wrangler.jsonc` is the shared configuration for both
`db:migrate:local` and `wrangler pages dev`. Do not point either command at a
different local Wrangler configuration: doing so can create two D1 databases,
leaving the Pages Function without the migrated membership tables or active
member rows.

Check local membership state without printing personal details:

```sh
npx wrangler d1 execute DB --local \
  --command "SELECT status, role, COUNT(*) AS count FROM taglingo_memberships GROUP BY status, role"
```

### Interpret the access labels

| Visible state | Meaning | First check |
| --- | --- | --- |
| `Guest mode` / `Guest` | No signed-in Approved Member was confirmed | Sign in and confirm the stable Clerk user ID has an active local membership |
| `Checking member access` | Clerk or the protected preference request is still loading | Wait for the request to finish before changing Target Currencies |
| `Member access unavailable` / `Signed in · access unavailable` | The browser is signed in, but the protected request failed | Confirm the server is running, all three server-side Clerk values are loaded, and Pages uses the migrated D1 database |
| `Approved Member mode` / `Approved Member · up to 3` | The protected request confirmed the session and active membership | Select one to three Target Currencies and reload to verify synchronization |

Clerk sign-in and TagLingo membership are separate checks. A visible Clerk user
button proves only that the browser has a Clerk session; it does not prove that
the Pages Function authenticated the request or found an active D1 membership.

## Offline application shell

The production build registers `public/sw.js`. Because `npm run dev` serves a
production build through Pages, a normal browser profile that has previously
loaded TagLingo may continue displaying the cached application shell after the
server stops. A fresh private profile has separate storage and cannot load the
site until a server is listening.

The service worker caches the application shell, built assets, and OCR assets.
It deliberately excludes `/api/*`. Offline display therefore does not mean
that member preference synchronization or fresh Reference Rate requests are
available. Previously validated browser-local Rate Snapshots retain their
separate seven-day eligibility rule.

When the server or network returns, reload TagLingo and confirm
`Approved Member mode` before changing synchronized preferences. The current
application does not automatically retry unavailable member access merely
because the browser fires an online event. Guest preference changes made while
member access is unavailable are not queued for later account synchronization.

To remove the local offline copy in Chrome, open DevTools and use
**Application → Service Workers → Unregister**, then
**Application → Storage → Clear site data**.

## Activate an invited Approved Member

After the owner invites or approves the person in Clerk and registration
completes:

1. Open the person's Clerk profile and copy the stable `user_...` ID. Do not
   use an email address as ownership.
2. In the intended D1 environment, insert the active membership:

   ```sql
   INSERT INTO taglingo_memberships (clerk_user_id, status)
   VALUES ('user_REPLACE_ME', 'active')
   ON CONFLICT(clerk_user_id) DO UPDATE SET
     status = 'active',
     role = 'member',
     updated_at = CURRENT_TIMESTAMP;
   ```

3. Sign in to TagLingo. The header must change from Guest mode to Approved
   Member mode only after `/api/preferences` confirms the active row.
4. Select one to three distinct Target Currencies. Confirm D1 contains one
   `member_preferences` row for that Clerk user ID. Confirm
   `/api/member-fx` accepts those saved pairs and rejects a fourth unsaved
   Target Currency.
5. Sign in as the same person in a second browser and confirm the Source and
   Target Currencies restore.
6. Sign out and confirm the browser immediately returns to the one-target
   Guest experience. The D1 member preference row must remain.

## Suspend an Approved Member

Use both systems so application authorization and Clerk sessions fail closed:

1. Disable TagLingo authorization first:

   ```sql
   UPDATE taglingo_memberships
      SET status = 'suspended',
          updated_at = CURRENT_TIMESTAMP
    WHERE clerk_user_id = 'user_REPLACE_ME';
   ```

2. Confirm the update affected exactly the intended stable Clerk user ID.
   Protected preference requests now return `inactive_membership` without
   reading `member_preferences`.
3. In the same person's Clerk Dashboard profile, choose **Ban user**. Clerk
   banning revokes all active sessions and prevents new sign-in.
4. From any previously signed-in browser, call or reload the protected
   preference surface. It must not return member preferences.
5. Confirm the saved D1 preference row still exists; suspension is not account
   deletion.

If the Clerk action fails after D1 is suspended, protected TagLingo data is
already denied, but the owner must retry the Clerk ban until session revocation
is confirmed. Unbanning in Clerk does not reactivate the D1 membership; repeat
the activation decision explicitly.

## Human acceptance record

Record the results for one non-personal test account without committing email
addresses, Clerk secrets, session tokens, or screenshots containing personal
data:

- invitation completion and sign-in;
- activation and one-to-three-target selection;
- restoration in a second browser;
- sign-out to Guest limits without preference deletion;
- D1 suspension followed by Clerk ban;
- denial in every previously signed-in browser.

Repository tests cover the API ordering, ownership, validation, D1 mapping, and
Guest/Approved Member UI transitions. The live Clerk invitation,
second-browser session, and Dashboard ban remain human-owned checks.
