#!/usr/bin/env python3
"""Extract validated canonical alpha accounts for an EMPTY beta auth/accounts.

Does not deploy or import anything. Output contains private account identifiers.
Use `convex import --component auth --table accounts FILE --deployment TARGET`.
Deliberately omit --replace, --append and --replace-all: a nonempty target must
fail, rather than overwrite accounts that already own beta sessions.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location("transform", Path(__file__).with_name("transform-auth-snapshot.py"))
transformer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transformer)


def prepare(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError("Output must be a new file, distinct from the source")
    # Reuse the rehearsal's strict identity, credential and reference checks.
    with tempfile.TemporaryDirectory() as temporary:
        validated = Path(temporary) / "validated.zip"
        report = transformer.transform(source, validated, "beta")
        with zipfile.ZipFile(validated) as archive:
            data = archive.read("_components/core/accounts/documents.jsonl")
    with destination.open("xb") as output:
        destination.chmod(0o600)
        output.write(data)
    return {"source_sha256": report["source_sha256"],
            "output_sha256": hashlib.sha256(data).hexdigest(),
            "canonical_accounts": report["canonical_accounts"],
            "target": "auth/accounts", "other_tables_imported": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("destination")
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.destination), indent=2))
