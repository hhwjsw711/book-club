# October 2026 auth beta migration

Target: **secret-barracuda-975**, the club's live personal **dev** deployment.
Do not use the unrelated default production deployment, descriptive-bullfrog-96.
Auth is pinned to `2.0.0-beta.0`; the final component uses its default name
`auth` at `/auth`. `authBeta` is a public function module, not a component name.
The alpha alias is a development dependency used only by tests and these tools.

## Scope and invariants

Move only canonical password account documents from `core/accounts` to the
initially empty `auth/accounts`, preserving their IDs and creation times.
Leave password hashes, username mappings, app user IDs, memberships, history,
file storage, notification state and hosting state in place. No live app-data
restore, password reset, signing-key rotation or URL change is required.

Old refresh sessions stop working at cutover. Existing access JWTs can remain
valid for their remaining one-hour lifetime. Older phone bundles can log in
again through the compatibility endpoints; they receive beta sessions. The
updated web/mobile clients use the beta API directly. Passkeys are not enabled
for real member accounts by this migration.

## Procedure

1. Run the backend tests/typechecks, web build and `cd mobile && npm run preflight`.
   Commit the final source before publishing. Record HEAD and take a fresh
   `convex export --include-file-storage` from the explicitly named target.
2. Rehearse on an expiring dev backend with separate signing keys, the copied
   app schema and auth functions only: no club crons, push or write endpoints.
   Import the isolated alpha fixture, create a disposable known-password user,
   then exercise the exact account import and final component removal below.
3. Run `node migrations/2026-10-auth-beta/tools/prepare-stage.mjs`. Explicitly
   select the live deployment in the generated directory's `.env.local` and
   deploy from there. This retains the original alpha endpoints and `core`
   while installing an empty beta `auth` at `/auth-beta`. New beta client
   endpoints are not exposed yet. Existing login remains available.
4. Take another snapshot after staging. Generate the narrow import:
   ```sh
   python3 migrations/2026-10-auth-beta/tools/prepare-account-import.py SOURCE.zip ACCOUNTS.jsonl
   npx convex import ACCOUNTS.jsonl --component auth --table accounts --deployment secret-barracuda-975
   ```
   **Do not add `--replace`, `--append` or `--replace-all`.** A nonempty target
   needs investigation; overwriting accounts can break existing beta sessions.
   The tool rejects ambiguous identity mappings and never modifies its input.
5. Export again and run `tools/verify-account-import.py SOURCE.zip AFTER.zip`.
   It checks exact account/credential/user/membership equality and empty beta
   sessions. Other app tables can continue changing through normal activity;
   it reports such differences for review. The password-verified account
   fallback handles signups that race the snapshot without creating new users.
6. Deploy the final committed main backend (`convex dev --once` with the live
   dev target selected). This unmounts legacy `core`, moves beta HTTP to `/auth`,
   and restores both client API envelopes over beta. Keep signing keys intact.
7. Publish the web app using **`static-hosting upload --dev --build`**. Publish
   the mobile production OTA after preflight; no new native binary is needed.
   Record release tags. Verify the live JWKS, hosted login UI, unauthenticated
   data denial and retired refresh responses. Do not create test users live.

## Rollback

Backups, generated stage source and private run evidence belong under
`.context/live-auth-cutover/` and are never committed. Keep the pre-cutover
snapshot including file storage and the pre-upgrade commit (`d4be053`).
Prefer fixing forward. A backend rollback must restore compatible **both-client**
endpoints once beta clients ship; deploying the old alpha-only source then
would strand updated clients. The historical dual-store bridge can serve both
clients, but keep beta's `auth` store mounted and its data intact. Re-add legacy
`core` if needed, with original signing keys; confirm whether its unmounted
state is retained before restoring any scoped auth tables. Do not restore a
full old snapshot over newer club activity, notification deliveries or assets.

A mobile-only rollback can republish the preceding EAS update because the
final backend still accepts older clients. A web-only rollback can publish the
previous frontend against the same compatibility endpoints. Neither requires
rolling back data or password hashes.

## Historical experiments

- [Passkey and dual-store trial](auth-lab/README.md): separate disposable
  identities; existing members still need a secure first-passkey enrollment
  flow. Face ID/Touch ID is the preferred next step, with passwords retained
  for recovery. Email codes could provide recovery after adding verified email;
  SMS adds delivery cost and phone-number recovery risks without solving
  first-passkey linking.
- [Earlier core-preserving snapshot rehearsal](auth-cutover/README.md): proves
  credential preservation and old/new React client compatibility. Its ZIPs
  intentionally omit push/hosting and **must not be used as live restores**.
- Tools/templates stay in this dated migration directory. Generated ZIPs,
  secrets, screenshots, build outputs and one-off probes stay in `.context/`.

Run tool checks with `python3 -B -m unittest discover -s
migrations/2026-10-auth-beta/tools -p 'test_*.py'`.

## Final default-name rehearsal — October 21

`hip-goldfinch-419` (`dev/auth-final-cutover-20261021`, seven-day expiry)
used a fresh live snapshot: 9,455 app documents, six users, five password
credentials. A disposable alpha account plus membership/check-in brought the
fixture to 9,458 app documents. Importing canonical account IDs into `auth`
preserved every app document and complete credential record. After unmounting
`core`, the original canary password worked with both API envelopes and both
React clients. Signed JWT validation, old refresh rejection, wrong-password
rejection, unauthenticated data denial, membership/history, reload, session
restoration and both sign-out directions passed. No live test users were added.

Backend: 105 tests pass; migration tooling: 14 tests pass. Root typechecks,
ESLint, web build and complete mobile preflight (including an isolated EAS-like
export) pass. Browser checks passed without page errors or mobile overflow.
Private evidence is in `.context/live-auth-cutover/`.
