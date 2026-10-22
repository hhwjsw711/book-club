#!/usr/bin/env python3
"""Compare an original alpha snapshot with a freshly exported beta rehearsal.

Run before publishing the trial or letting users sign in, since the expected
session/refresh-token stores are empty. Prints counts only, never row contents.
"""
import argparse
import json
import zipfile


def rows(archive, table):
    path = table + "/documents.jsonl"
    if path not in archive.namelist():
        return []
    return sorted((json.loads(line) for line in archive.read(path).splitlines() if line.strip()), key=lambda r: r["_id"])


def verify(source, migrated):
    with zipfile.ZipFile(source) as before, zipfile.ZipFile(migrated) as after:
        app_tables = sorted(name.removesuffix("/documents.jsonl") for name in before.namelist() if name.endswith("/documents.jsonl") and not name.startswith("_"))
        imported_tables = sorted(name.removesuffix("/documents.jsonl") for name in after.namelist() if name.endswith("/documents.jsonl") and not name.startswith("_"))
        if app_tables != imported_tables:
            raise ValueError("App table set changed")
        for table in app_tables:
            if rows(before, table) != rows(after, table):
                raise ValueError(f"App data changed: {table}")
        for table in ["_components/authUsername/usernames", "_components/authPasswordProvider/passwords"]:
            if rows(before, table) != rows(after, table):
                raise ValueError(f"Credentials changed: {table}")
        canonical = [r for r in rows(before, "_components/core/accounts") if r["provider"] == "password" and r["providerAccountId"] == r["userId"]]
        if canonical != rows(after, "_components/core/accounts"):
            raise ValueError("Canonical accounts changed")
        for table in ["sessions", "refreshTokens"]:
            if rows(after, "_components/core/" + table):
                raise ValueError(f"Expected empty {table}")
        if any(name.startswith("_components/pushNotifications/") for name in after.namelist()):
            raise ValueError("Push component unexpectedly installed")
        return {
            "app_tables_exactly_equal": len(app_tables),
            "app_documents_exactly_equal": sum(len(rows(before, t)) for t in app_tables),
            "password_hash_records_exactly_equal": len(rows(before, "_components/authPasswordProvider/passwords")),
            "username_records_exactly_equal": len(rows(before, "_components/authUsername/usernames")),
            "canonical_accounts_exactly_equal": len(canonical),
            "sessions": 0,
            "refresh_tokens": 0,
            "push_component_installed": False,
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("migrated")
    args = parser.parse_args()
    print(json.dumps(verify(args.source, args.migrated), indent=2))
