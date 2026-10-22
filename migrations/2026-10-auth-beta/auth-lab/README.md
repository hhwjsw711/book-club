# Historical auth beta transition and trial

> Historical October 20 experiment. The final default-name migration and live
> rollout are documented in [the migration runbook](../README.md). Statements
> below describe the experiment, not the current main app.

## Status — 2026-10-20

The repository pins `@convex-dev/auth@2.0.0-beta.0` for web, mobile and backend.
The compatibility bridge and updated clients are implemented. Only the
isolated lab has been deployed; the live club backend, website and phone
bundles have not been updated.

Update: a [snapshot-based hard cutover](../auth-cutover/README.md) has also been
rehearsed successfully on a different backend. It preserves app data and
password credentials while discarding sessions, allowing a single beta core.
The main app source here still implements the original compatibility bridge.

- Trial: https://secret-basilisk-411.convex.site
- Old-client entry: https://secret-basilisk-411.convex.site/?client=alpha
- Deployment: `dev/auth-beta-lab-20261020` / `secret-basilisk-411`
- Dashboard: https://dashboard.convex.dev/t/ianmacartney/book-club-c4bab/secret-basilisk-411
- Created with a 14-day expiration. Treat its accounts and passkeys as disposable.

The lab has its own signing keys and a minimal users schema. It contains no
club data, crons, push notifications or live credentials. Its password and
passkey usernames occupy separate namespaces: using the same name does not
link the accounts.

The original published lab uses the temporary `authBeta` component mount.
Current templates use the package default `auth` instead. Do not redeploy them
over that lab expecting existing beta sessions/accounts to move automatically;
component renames require data migration. The function module `api.authBeta`
is independent of the component mount name and remains unchanged.

## Try it

Use a fresh test username and password.

1. Open the old-client entry and **create** a test account. This intentionally
   issues a genuine alpha session through a lab-only legacy endpoint.
2. Note the displayed user id, switch to the beta client, and reload. The
   session and user id should remain.
3. Sign out, then sign in with the same password. This creates a beta session
   for the same user id. Switch back to the old client and reload again.
4. In the beta client, try changing the password and signing in again.
5. Sign out, select **Passkey**, and use a fresh test username. Register with
   Face ID/Touch ID or a password manager, sign out, then sign in again.
   Try Safari on your iPhone as well as your desktop browser.

The automated passkey check uses a virtual authenticator; real device and
iCloud/password-manager behavior still needs a manual trial. These passkeys
belong to the lab's domain and will not sign into the live club later.

## Why this needs a bridge

Beta changes the core session schema, refresh-token protocol, callback
payload, password method names, and client result envelopes. Simply replacing
the alpha package or mounting beta over the existing component would break
stored sessions or older phone clients.

| Concern | Implementation |
| --- | --- |
| Existing alpha sessions | Keep exact `2.0.0-alpha.1` under the `@convex-dev/auth-legacy` alias, mounted as `core` at `/auth`. |
| New sessions | Beta mounted separately under its default name `auth` at `/auth-beta`. |
| Passwords and usernames | Reuse the existing component names and unchanged schemas; no password reset or bulk identity migration. |
| Existing member identity | Verify the existing password with the component's rate limiter, then lazily create the beta account through an internal callback returning the original user id. |
| Old phone clients | Preserve the `api.auth` mutation names, validators and `success` / tokens-or-null responses. |
| Updated clients | Use `api.authBeta`, the new username/password hooks and `status` / `kind` responses. Auth gates come from `convex/react`. |
| Refresh and sign-out | Both endpoint families accept either session format. Existing alpha sessions keep refreshing in alpha until the next sign-in. |
| JWTs and persistence | Keep issuer, keys, `/auth` JWKS URL, one-hour access TTL, deployment URL and mobile SecureStore adapter. |
| New user display name | Wrap the stock signup handler and set the username as the display name in the same transaction. |

The signup wrapper uses Convex's registered mutation `_handler`, an internal
API absent from its public TypeScript declarations. The package is pinned,
the cast is confined to `convex/lib/auth.ts`, and integration tests exercise
the real signup handler. Recheck this bridge against package source before
any further auth upgrade.

There is no destructive application-schema migration or backfill. Active
alpha sessions can keep sliding indefinitely; a calendar date alone is not
sufficient grounds to delete the old store.

## Rollout

1. Complete the real-device trial above. Before the first live deployment,
   capture a live snapshot including component data, record the currently
   shipped web/mobile releases, and inspect the actual deployment selection.
   The club currently uses `secret-barracuda-975`, a personal dev deployment.
   A command defaulting to production targets a different backend.
2. Review the root dependency changes already present before this work
   (`convex` and push notifications). This auth work did not originate those
   upgrades; include them deliberately in the release or separate them.
3. Deploy the compatibility backend to the live club first. Keep both core
   mounts, existing keys, and the original JWKS route. Do not run the auth key
   generator on an existing deployment.
4. Smoke-test an installed old phone: restore/relaunch, sign out and sign in,
   and confirm the original membership and history. A restored session alone
   does not prove that old-client login works.
5. Publish the updated web client, then the password-only mobile OTA using
   the existing mobile release workflow. Confirm startup/relaunch, login,
   signup, sign-out and account identity on a real iPhone.
6. Observe auth errors and session behavior through the next refresh cycle.
   Keep the old endpoints until older bundles are retired. Remove the alpha
   store only after inspecting remaining sessions and making an explicit
   reauthentication plan for any still active.

### Rollback

Rolling the web or mobile client back is supported by `api.auth`; it can
refresh and sign out beta sessions too. Keep the bridge backend deployed.
Once a beta session is issued, reverting the backend to the unmodified alpha
implementation would strand it. Fix forward or retain the compatibility
endpoints while disabling the newer client. A database restore is not the
normal rollback: it can discard club activity after the snapshot.

## Login recommendations

1. **Keep username/password for this release.** It preserves the current
   sign-in and membership model while the session protocol changes. The beta
   exposes authenticated password changes, demonstrated in the lab; add this
   to account settings before expanding the login choices.
2. **Add a verified recovery email next.** The current system has no self-serve
   forgotten-password recovery. Beta's email/password recipe supports
   verification and password recovery links through Resend. Existing users
   need a signed-in, recently reauthenticated flow to verify and attach an
   email to their current identity. Do not sign them up again through the
   recipe and create a second club user. This requires sender configuration,
   delivery testing and a linking implementation; it is not enabled here.
   The stock verification link must open in the browser that started the
   flow, so explicitly test the iPhone mail-to-browser handoff.
3. **Offer passkeys as an optional convenience once recovery exists.** The
   beta's stock add-passkey flow requires an existing passkey, so it cannot
   enroll the first key on a password-only account. Build and test secure
   enrollment after password reauthentication before offering it to existing
   members. Choose the final relying-party domain before enrollment. Native
   iOS requires WebAuthn/native integration, `webcredentials` associated
   domains and an AASA file, plus a new app binary; an OTA alone is insufficient.
4. **Consider email codes only if people prefer passwordless email.** They
   avoid link-opening friction but add email delivery dependency and require
   a custom flow; beta.0 does not ship a stock email-code method. Keep the
   existing password or a passkey as another way in.
5. **Defer SMS codes.** For a small club, provider fees, delivery problems,
   phone-number changes and SIM-swap risk add overhead without a clear
   advantage over verified email plus optional passkeys. Beta.0 has no stock
   SMS method.

References:

- [Beta docs](https://auth-v2.previews.convex.dev/)
- [Email/password and recovery](https://auth-v2.previews.convex.dev/login-providers/email-password)
- [Passkeys](https://auth-v2.previews.convex.dev/login-providers/passkey)
- [Pinned beta source](https://github.com/get-convex/convex-auth/tree/v2.0.0-beta.0/packages/core/src)
- [Apple passkey integration](https://developer.apple.com/documentation/authenticationservices/connecting-to-a-service-with-passkeys)

## Validation

- Full suite: **105 passing tests**, including 11 auth migration/security
  scenarios using real Argon2 hashing, both actual core components and signed
  JWT verification.
- Auth coverage includes preserving user/profile/membership ids, old/new
  client envelopes, incorrect credentials and rate limiting, duplicate and
  invalid signup, lost refresh responses, spent-token replay revocation,
  expired sessions, unauthenticated access, sign-out in both directions and
  password changes.
- Web build, backend lint/typechecks and mobile typecheck pass.
- Mobile preflight passes, including iOS export and a clean-install
  EAS-equivalent export.
- Deployed browser checks pass for old-to-beta session restoration, reload,
  beta password login, old-client restoration of a beta session, sign-out,
  passkey registration and repeat login. No browser exceptions or horizontal
  overflow at 390px.

These checks do not establish native iOS passkey support, email deliverability,
or compatibility with every historical mobile bundle.

## Maintaining the lab

`node migrations/2026-10-auth-beta/tools/prepare-auth-lab.mjs` copies the frozen templates and auth implementation into `.context/auth-lab`, preserving its local
environment files. It does not create, select or deploy a backend. The lab
uses the root dependencies through a symlink, so run root `npm ci` first.

For the already configured lab, inspect `.context/auth-lab/.env.local` and
confirm it selects `secret-basilisk-411` before running:

```sh
node migrations/2026-10-auth-beta/tools/prepare-auth-lab.mjs
cd .context/auth-lab
# Use the same supported Node version as the main app.
npx convex dev --once --typecheck enable
npx @convex-dev/static-hosting upload --dev --build
```

The explicit `--dev` matters: static hosting otherwise defaults to production.
For a replacement lab after expiration, provision a new isolated backend,
configure its own environment and generate new signing keys; never copy the
live app's `.env.local` or signing keys. Do not copy the full `convex/`
directory into the lab: it contains real notification and billing crons.
