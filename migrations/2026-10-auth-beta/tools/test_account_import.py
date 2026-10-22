import importlib.util
import json
from pathlib import Path
import unittest
import zipfile
import test_transform_auth_snapshot as fixtures


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

prepare = load('prepare-account-import').prepare
verify = load('verify-account-import').verify


class AccountImportTest(unittest.TestCase):
    setUp = fixtures.TransformTest.setUp
    write = fixtures.TransformTest.write

    def test_narrow_import_preserves_account_ids_and_never_copies_credentials(self):
        self.write()
        original = self.source.read_bytes()
        report = prepare(self.source, self.dest)
        rows = [json.loads(line) for line in self.dest.read_text().splitlines()]
        self.assertEqual(rows, [self.rows['_components/core/accounts'][0]])
        self.assertEqual(report['other_tables_imported'], 0)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(self.dest.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ValueError):
            prepare(self.source, self.dest)
        self.assertEqual(rows, [json.loads(line) for line in self.dest.read_text().splitlines()])

    def test_ambiguous_identity_never_produces_import(self):
        self.rows['_components/core/accounts'].append(self.rows['_components/core/accounts'][0])
        self.write()
        with self.assertRaises(ValueError):
            prepare(self.source, self.dest)
        self.assertFalse(self.dest.exists())

    def beta(self):
        self.rows['_components/auth/accounts'] = [self.rows['_components/core/accounts'][0]]
        with zipfile.ZipFile(self.dest, 'w') as archive:
            for table, rows in self.rows.items():
                archive.writestr(table + '/documents.jsonl', ''.join(json.dumps(r) + '\n' for r in rows))

    def test_verifies_default_namespace_and_rejects_changed_credentials(self):
        self.write()
        self.beta()
        self.assertEqual(verify(self.source, self.dest)['canonical_accounts_equal'], 1)
        self.rows['_components/authPasswordProvider/passwords'][0]['passwordHashPHC'] = '$argon2id$changed'
        self.beta()
        with self.assertRaisesRegex(ValueError, 'Identity/credential'):
            verify(self.source, self.dest)

    def test_refuses_nonempty_beta_session_store(self):
        self.write()
        self.rows['_components/auth/sessions'] = [{'_id':'sessionBeta'}]
        self.beta()
        with self.assertRaisesRegex(ValueError, 'Expected empty beta'):
            verify(self.source, self.dest)

    def test_verifier_rejects_regenerated_account_id(self):
        self.write()
        self.rows['_components/core/accounts'][0]['_id'] = 'replaced'
        self.beta()
        with self.assertRaisesRegex(ValueError, 'Canonical accounts'):
            verify(self.source, self.dest)
