# Historical snapshot-based auth cutover rehearsal

> Historical October 20 experiment. The final default-name migration and live
> rollout are documented in [the migration runbook](../README.md). Statements
> below describe the experiment, not the current main app.

This is a separate, temporary backend for validating an alpha → beta hard
cutover. It does not change the main app's current compatibility-bridge code
or the live deployment.

## Deployment and source

- Source: user-supplied `2026-10-20.zip`, exported from `secret-barracuda-975`.
- Source SHA-256: `9fe7e87c1dc819003e428a754ed77b1c6b09083c9aacd5fcb049867925a52aea`.
- Target: **dev `formal-retriever-763`**, reference `dev/auth-cutover-20261020`.
- [Trial](https://formal-retriever-763.convex.site)
- [Dashboard](https://dashboard.convex.dev/t/ianmacartney/book-club-c4bab/formal-retriever-763)
- Created October 20, 2026, with a 14-day expiration and distinct signing keys.

The original ZIP is unchanged. Snapshots are excluded locally through Git's
`info/exclude`; credentials, generated exports and execution logs stay under
`.context/auth-cutover/`. None belong in a commit.

## What the snapshot contains

There are 9,440 application documents across 19 tables, including six users,
six memberships and 7,244 check-ins. Five users have username/password
credentials. The sixth user's lack of credentials predates this migration;
no account is invented for them.

Auth has five username mappings, five Argon2id password records, ten accounts
and 33 alpha sessions. Five accounts are canonical password identities with
`providerAccountId == userId`. The other five map the same users through their
old username identifiers. Every password user already has a canonical account.
All 14,656 checked references between app records resolve.

## Transformation

`migrations/2026-10-auth-beta/tools/transform-auth-snapshot.py` has two rehearsal stages:

- **alpha:** preserve app/auth records and their IDs exactly; omit the push
  notifications component tree and the source static-hosting component tree.
- **beta:** additionally empty `core/sessions` and remove the five verified
  obsolete username-keyed accounts. Keep canonical accounts and their IDs,
  usernames, password hash records, and every app document unchanged.

The transformer checks credential uniqueness, user references, canonical
account coverage, legacy identifier mappings and session/account consistency.
It refuses unexpected identity shapes and refuses to overwrite its input or
an existing output. It preserves table manifests and value-type metadata.

The isolated backend installs only auth and its own static-hosting component.
It has no club mutation functions, crons, push component, workpool, or live
signing keys. The app schema is copied so Convex validates every imported
record. The only public app-data query is authenticated and reads the caller's
own profile, memberships and five latest check-ins.

**These transformed ZIPs are rehearsal artifacts, not live restore images.**
They intentionally omit delivery and hosting state. Do not import them into
the live deployment with `--replace-all`. A live cutover should use a fresh
snapshot and a separately reviewed import that changes only the intended auth
tables while preserving infrastructure state. Uploaded file contents also
need explicit inclusion if a full deployment restore is intended.

Convex's docs caution that editing snapshot ZIPs is undocumented. This
particular transformation was tested through real imports and a fresh export;
it is not a guarantee about arbitrary archive modifications or future formats.
See [Convex import documentation](https://docs.convex.dev/database/import-export/import).

## Rehearsal performed

1. Deployed the alpha implementation at the original component mount names.
2. Imported the isolated alpha baseline, including the original 33 sessions.
3. Created a disposable alpha account with a randomly generated password,
   linked it to the copied club and gave it one check-in. Confirmed its login
   and data access, then exported that seeded state.
4. Attempted beta deployment without changing the data. Convex rejected the
   old session fields in `core/sessions`, as expected. No TypeScript errors
   were involved.
5. Transformed and imported the seeded snapshot, removing old sessions and
   obsolete account rows. Deployed beta successfully at the same `core` mount.
6. Exercised stock beta password login with the original disposable password.
   Verified identical user ID, membership and own history, valid signed JWT,
   rejected old refresh token, wrong-password rejection, unauthenticated data
   denial, and both client refresh/sign-out envelopes.
7. Drove the hosted UI with the actual alpha and beta React clients: password
   login, switching clients, session restoration, reload and sign-out. Both
   clients worked against the single beta core. Mobile layout had no overflow
   and there were no browser exceptions.
8. Restored the transformed original snapshot, removing the disposable account
   and test sessions, then exported again for record-by-record comparison.

Final comparison passed: all **9,440 app documents across 19 tables**, all five
complete username records, all five complete password records and all five
canonical account records are exactly equal to the source (including IDs and
timestamps). There are zero sessions and zero refresh tokens before manual
testing. The source ZIP's SHA-256 is unchanged. Counts-only evidence is in
`.context/auth-cutover/final-comparison.json` and the login/browser verification
reports alongside it.

Local transformer/verifier tests cover preservation, rejected ambiguous
accounts, missing canonical mappings, duplicate usernames, dangling sessions,
overwrite prevention and detection of changed app data or credentials.

The trial has no signup/password-change controls. Its legacy wrappers cover
login, refresh and sign-out for the tested alpha client. They are not a complete
production replacement: retain the main app's signup behavior and callbacks
when implementing the final cutover.

## Important logout behavior

The rehearsal proved that an alpha refresh token is rejected after the import,
but an already-issued alpha access JWT remains valid until expiration when the
issuer and signing keys are unchanged. Our access-token lifetime is one hour.
Deleting sessions alone is not instant access-token revocation. A strict
immediate logout needs a separately tested revocation strategy; otherwise
existing access expires naturally and subsequent refresh requires sign-in.

Keeping old-client API envelopes is independent of preserving old sessions.
The rehearsal's beta core is mounted as `core` at `/auth`; it has no legacy
session fallback or second auth core. `authBeta` is only a function module name.

### Component naming for the final migration

The package's default component name is **`auth`**, not `core`. The completed
rehearsal above deliberately retained the historical `core` mount to isolate
the session-schema change. The main app's new beta mount now uses the default
`auth` name without an override. For the final hard cutover, additionally move
the exported core component data into the `auth` namespace, update references
to `components.auth`, and rehearse that namespace change before deployment.
The current cutover templates and ZIP transformer reproduce the already-tested
`core`-preserving experiment; they do not yet perform this namespace migration.

## Try your existing login

Open the trial and use your normal club username and password. Confirm the
displayed user ID, club membership and recent check-ins, then sign out and back
in. The old-client link exercises the older React auth library against beta.
No real member passwords were requested or guessed during automated checks;
their unchanged hash records and the alpha-created test account were used as
evidence. Real-member login is the remaining manual check.

This trial is separate from the [passkey trial](https://secret-basilisk-411.convex.site).
Passkeys cannot be synthesized from password hashes; adding a first passkey to
an existing member still needs explicit, reauthenticated enrollment.

## Reproduction

Use a newly provisioned isolated deployment. Do not change the root app's
`.env.local`. `prepare-auth-cutover.mjs` writes only `.context/auth-cutover/`,
selects no deployment and copies an explicit allowlist of backend files.

```sh
python3 -B -m unittest discover -s migrations/2026-10-auth-beta/tools -p 'test_transform_auth_snapshot.py'
python3 migrations/2026-10-auth-beta/tools/transform-auth-snapshot.py SOURCE.zip ALPHA.zip --stage alpha
python3 migrations/2026-10-auth-beta/tools/transform-auth-snapshot.py SOURCE.zip BETA.zip --stage beta
node migrations/2026-10-auth-beta/tools/prepare-auth-cutover.mjs alpha
```

Configure `.context/auth-cutover/.env.local` for the isolated deployment and
generate fresh signing keys there. Use the project's supported Node version.
Deploy alpha, import `ALPHA.zip`, prepare beta and observe the schema rejection.
Import `BETA.zip` while the alpha schema is still deployed, then deploy beta.
For the isolated import, explicitly supply `--deployment <isolated-name>` and
`--replace-all`. The latter also clears beta refresh-token rows on a rerun.

After resetting test fixtures, export the target and verify:

```sh
python3 migrations/2026-10-auth-beta/tools/verify-auth-snapshot.py SOURCE.zip FINAL-BETA-EXPORT.zip
```

This compares every app document including IDs/timestamps, complete username
and password records, and the preserved canonical accounts. It requires empty
session and refresh-token stores and no installed push component. Run it before
manual login testing creates new sessions.

Publish the trial from `.context/auth-cutover` with
`npx @convex-dev/static-hosting upload --dev --build`; the explicit `--dev` is
required. The original frontend assets from the snapshot are never published.
