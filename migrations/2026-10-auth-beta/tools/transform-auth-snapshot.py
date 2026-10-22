#!/usr/bin/env python3
"""Prepare an isolated auth rehearsal snapshot; never modifies the source.

This is intentionally NOT a production restore image: it omits push and hosting
component state. Treat both input and output as private credentials/data.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import zipfile

AUTH_COMPONENTS = {"core", "authUsername", "authPasswordProvider"}


def documents(archive, table):
    return [json.loads(line) for line in archive.read(table + "/documents.jsonl").splitlines() if line.strip()]


def unique(rows, field, label):
    if any(n != 1 for n in Counter(row[field] for row in rows).values()):
        raise ValueError(f"Duplicate {label}")


def transform(source, destination, stage):
    if stage not in {"alpha", "beta"}:
        raise ValueError("Expected alpha or beta stage")
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError("Output must be a new file, distinct from the source")
    with zipfile.ZipFile(source) as archive:
        users = documents(archive, "users")
        usernames = documents(archive, "_components/authUsername/usernames")
        passwords = documents(archive, "_components/authPasswordProvider/passwords")
        accounts = documents(archive, "_components/core/accounts")
        sessions = documents(archive, "_components/core/sessions")
        unique(users, "_id", "app user id")
        unique(usernames, "userId", "username per user")
        unique(usernames, "usernameNormalized", "normalized username")
        unique(passwords, "userId", "password per user")
        user_ids = {r["_id"] for r in users}
        name_by_user = {r["userId"]: r for r in usernames}
        password_users = {r["userId"] for r in passwords}
        if password_users != set(name_by_user):
            raise ValueError("Username and password identities differ")
        if not password_users <= user_ids or any(a["userId"] not in user_ids for a in accounts):
            raise ValueError("Dangling auth user reference")
        if any(a["provider"] != "password" for a in accounts):
            raise ValueError("Unexpected provider: review before transforming")
        if any(not p["passwordHashPHC"].startswith("$argon2id$") for p in passwords):
            raise ValueError("Unexpected password hash format")
        canonical = [a for a in accounts if a["providerAccountId"] == a["userId"]]
        unique(canonical, "userId", "canonical password account")
        if {a["userId"] for a in canonical} != password_users:
            raise ValueError("Missing or orphaned canonical password account")
        stale = [a for a in accounts if a["providerAccountId"] != a["userId"]]
        for account in stale:
            name = name_by_user.get(account["userId"])
            if name is None or account["providerAccountId"].casefold() != name["usernameNormalized"].casefold():
                raise ValueError("Unrecognized legacy account: refusing to discard it")
        account_by_id = {a["_id"]: a for a in accounts}
        if any(s["accountId"] not in account_by_id or account_by_id[s["accountId"]]["userId"] != s["userId"] for s in sessions):
            raise ValueError("Dangling or mismatched session account")

        changes = {}
        if stage == "beta":
            changes["_components/core/accounts/documents.jsonl"] = b"".join(
                (json.dumps(a, separators=(",", ":")) + "\n").encode() for a in canonical
            )
            changes["_components/core/sessions/documents.jsonl"] = b""
            # No old refreshTokens table is accepted. --replace-all on the isolated
            # target clears beta's new table when re-running a rehearsal.
            if "_components/core/refreshTokens/documents.jsonl" in archive.namelist():
                raise ValueError("Input is already beta; expected an alpha snapshot")

        kept, omitted = {}, {}
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as output:
            destination.chmod(0o600)
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
                for info in archive.infolist():
                    name = info.filename
                    if name.startswith("/") or ".." in Path(name).parts:
                        raise ValueError("Unexpected archive path")
                    keep = not name.startswith("_components/") or name.split("/")[1] in AUTH_COMPONENTS
                    if name.endswith("/documents.jsonl") and not name.endswith("_tables/documents.jsonl"):
                        rows = len([line for line in archive.read(info).splitlines() if line.strip()])
                        (kept if keep else omitted)[name.removesuffix("/documents.jsonl")] = rows
                    if keep:
                        target.writestr(info, changes.get(name, archive.read(info)))
        return {
            "stage": stage,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "output_sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "app_rows": sum(n for name, n in kept.items() if not name.startswith("_")),
            "users": len(users), "password_logins": len(passwords),
            "canonical_accounts": len(canonical),
            "obsolete_accounts_removed": len(stale) if stage == "beta" else 0,
            "sessions_removed": len(sessions) if stage == "beta" else 0,
            "omitted_rehearsal_components": sorted({name.split('/')[1] for name in omitted}),
            "included_table_counts_before_transform": kept,
            "omitted_table_counts": omitted,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--stage", required=True, choices=["alpha", "beta"])
    args = parser.parse_args()
    print(json.dumps(transform(args.source, args.destination, args.stage), indent=2))
