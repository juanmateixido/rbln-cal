import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("policy", pathlib.Path(__file__).with_name("check-public-image.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class PublicImagePolicy(unittest.TestCase):
    def test_rejects_catalog_names_in_layers_without_printing_values(self):
        self.assertEqual(policy.private_names("ENV CAL_API_KEY_CRM=fake DATABASE_URL=fake"),
                         {"CAL_API_KEY_CRM", "DATABASE_URL"})

    def test_rejects_new_secret_names_not_yet_in_catalog(self):
        self.assertEqual(policy.private_names("ARG FUTURE_SERVICE_TOKEN"), {"FUTURE_SERVICE_TOKEN"})

    def test_allows_only_reviewed_public_configuration(self):
        self.assertEqual(policy.private_names("ENV NEXT_PUBLIC_WEBAPP_URL=public CALCOM_TELEMETRY_DISABLED=1"), set())
        self.assertEqual(policy.private_names("ARG NEXT_PUBLIC_API_KEY"), {"NEXT_PUBLIC_API_KEY"})

    def test_build_argument_parser_stops_before_other_workflow_fields(self):
        self.assertEqual(policy.build_args("  build-args: |\n    CAL_API_KEY=fake\n  secret-files: |\n    fixture=path"),
                         ["CAL_API_KEY=fake"])

    def test_current_source_policy(self):
        self.assertEqual(policy.inspect_source(policy.ROOT), set())


if __name__ == "__main__":
    unittest.main()
