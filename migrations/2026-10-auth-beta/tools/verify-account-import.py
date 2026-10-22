#!/usr/bin/env python3
"""Check account namespace migration and untouched identity/credential records.

Run immediately after account import, before beta sign-in creates sessions.
Other app tables can change normally while the live deployment remains active.
Never prints account IDs, password hashes, tokens, or user data.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import zipfile

spec = importlib.util.spec_from_file_location("verify", Path(__file__).with_name("verify-auth-snapshot.py"))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
rows = verifier.rows


def verify(source, migrated):
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(migrated) as after:
        report = {}
        for table in ["users", "memberships", "_components/authUsername/usernames", "_components/authPasswordProvider/passwords"]:
            original, actual = rows(before, table), rows(after, table)
            if original != actual:
                raise ValueError(f"Identity/credential records changed; review before proceeding: {table}")
            report[table] = len(actual)
        canonical = [r for r in rows(before, "_components/core/accounts") if r["provider"] == "password" and r["providerAccountId"] == r["userId"]]
        if not canonical or canonical != rows(after, "_components/auth/accounts"):
            raise ValueError("Canonical accounts not preserved in default auth namespace")
        for table in ["sessions", "refreshTokens"]:
            if rows(after, "_components/auth/" + table):
                raise ValueError(f"Expected empty beta {table} before first login")
        app_tables = [n.removesuffix("/documents.jsonl") for n in before.namelist() if n.endswith("/documents.jsonl") and not n.startswith("_")]
        changed = [t for t in app_tables if rows(before,t) != rows(after,t)]
        return {"equal_identity_tables": report, "canonical_accounts_equal": len(canonical),
                "beta_sessions": 0, "beta_refresh_tokens": 0,
                "app_tables_changed_during_migration": changed,
                "app_documents_equal": sum(len(rows(before,t)) for t in app_tables if t not in changed)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("migrated")
    args = parser.parse_args()
    print(json.dumps(verify(args.source, args.migrated), indent=2))
