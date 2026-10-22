import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("transform", Path(__file__).with_name("transform-auth-snapshot.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
verify_spec = importlib.util.spec_from_file_location("verify", Path(__file__).with_name("verify-auth-snapshot.py"))
verification = importlib.util.module_from_spec(verify_spec)
verify_spec.loader.exec_module(verification)


class TransformTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "source.zip"
        self.dest = Path(self.directory.name) / "result.zip"
        self.rows = {
            "users": [{"_id": "user1", "_creationTime": 1, "name": "Reader"}],
            "memberships": [{"_id": "member1", "userId": "user1", "clubId": "club1"}],
            "_components/authUsername/usernames": [{"_id": "username1", "userId": "user1", "username": "Reader", "usernameNormalized": "reader"}],
            "_components/authPasswordProvider/passwords": [{"_id": "password1", "userId": "user1", "passwordHashPHC": "$argon2id$fixture"}],
            "_components/core/accounts": [
                {"_id": "account1", "userId": "user1", "provider": "password", "providerAccountId": "user1"},
                {"_id": "accountOld", "userId": "user1", "provider": "password", "providerAccountId": "reader"},
            ],
            "_components/core/sessions": [{"_id": "session1", "userId": "user1", "accountId": "accountOld"}],
            "_components/core/_tables": [{"name": "accounts", "id": 10001}, {"name": "sessions", "id": 10002}],
            "_components/pushNotifications/pushTokens": [{"_id": "token1", "token": "fixture"}],
            "_components/staticHosting/staticAssets": [{"_id": "asset1", "path": "/index.html"}],
        }

    def write(self):
        with zipfile.ZipFile(self.source, "w") as z:
            for table, rows in self.rows.items():
                z.writestr(table + "/documents.jsonl", "".join(json.dumps(r) + "\n" for r in rows))

    def test_beta_preserves_ids_credentials_and_app_bytes(self):
        self.write()
        before = self.source.read_bytes()
        report = module.transform(self.source, self.dest, "beta")
        self.assertEqual(self.source.read_bytes(), before)
        self.assertEqual(report["sessions_removed"], 1)
        self.assertEqual(report["obsolete_accounts_removed"], 1)
        with zipfile.ZipFile(self.source) as source, zipfile.ZipFile(self.dest) as target:
            for table in ["users", "memberships", "_components/authUsername/usernames", "_components/authPasswordProvider/passwords", "_components/core/_tables"]:
                self.assertEqual(source.read(table + "/documents.jsonl"), target.read(table + "/documents.jsonl"))
            self.assertEqual(module.documents(target, "_components/core/sessions"), [])
            self.assertEqual(module.documents(target, "_components/core/accounts"), [self.rows["_components/core/accounts"][0]])
            self.assertFalse(any("pushNotifications" in n or "staticHosting" in n for n in target.namelist()))

    def test_alpha_preserves_sessions_and_all_accounts(self):
        self.write()
        module.transform(self.source, self.dest, "alpha")
        with zipfile.ZipFile(self.dest) as target:
            for table in ["_components/core/accounts", "_components/core/sessions"]:
                self.assertEqual(module.documents(target, table), self.rows[table])

    def test_missing_canonical_account_refused(self):
        self.rows["_components/core/accounts"].pop(0)
        self.write()
        with self.assertRaisesRegex(ValueError, "canonical"):
            module.transform(self.source, self.dest, "beta")

    def test_unrecognized_legacy_identity_refused(self):
        self.rows["_components/core/accounts"][1]["providerAccountId"] = "somebody_else"
        self.write()
        with self.assertRaisesRegex(ValueError, "Unrecognized legacy"):
            module.transform(self.source, self.dest, "beta")

    def test_duplicate_username_refused(self):
        self.rows["_components/authUsername/usernames"].append(copy.deepcopy(self.rows["_components/authUsername/usernames"][0]))
        self.write()
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            module.transform(self.source, self.dest, "beta")

    def test_dangling_session_refused(self):
        self.rows["_components/core/sessions"][0]["accountId"] = "missing"
        self.write()
        with self.assertRaisesRegex(ValueError, "session"):
            module.transform(self.source, self.dest, "beta")

    def test_source_and_existing_output_cannot_be_overwritten(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "new file"):
            module.transform(self.source, self.source, "beta")
        self.dest.write_text("keep")
        with self.assertRaisesRegex(ValueError, "new file"):
            module.transform(self.source, self.dest, "beta")
        self.assertEqual(self.dest.read_text(), "keep")

    def test_verification_accepts_exact_migration(self):
        self.write()
        module.transform(self.source, self.dest, "beta")
        report = verification.verify(self.source, self.dest)
        self.assertEqual(report["app_documents_exactly_equal"], 2)
        self.assertEqual(report["password_hash_records_exactly_equal"], 1)

    def test_verification_rejects_data_loss_credential_changes_and_sessions(self):
        for table, row, message in [
            ("users", {"_id": "user1", "name": "changed"}, "App data changed"),
            ("_components/authPasswordProvider/passwords", {"_id": "password1", "userId": "user1", "passwordHashPHC": "changed"}, "Credentials changed"),
            ("_components/core/sessions", {"_id": "leftover"}, "Expected empty sessions"),
        ]:
            with self.subTest(table=table):
                self.write()
                self.dest.unlink(missing_ok=True)
                module.transform(self.source, self.dest, "beta")
                with zipfile.ZipFile(self.dest) as z:
                    entries = {n: z.read(n) for n in z.namelist()}
                entries[table + "/documents.jsonl"] = (json.dumps(row) + "\n").encode()
                with zipfile.ZipFile(self.dest, "w") as z:
                    for name, content in entries.items():
                        z.writestr(name, content)
                with self.assertRaisesRegex(ValueError, message):
                    verification.verify(self.source, self.dest)


if __name__ == "__main__":
    unittest.main()
