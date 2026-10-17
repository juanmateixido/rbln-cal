import contextlib
import importlib.util
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("sync", Path(__file__).with_name("sync-vars.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncSafety(unittest.TestCase):
    def setUp(self):
        self.env = {
            "RAILWAY_PROJECT_ID": "e9436072-a192-43c7-b0fd-6d6723264525",
            "RAILWAY_ENVIRONMENT_ID": "test", "SMTP_MODE": "capture",
        }
        names = """DATABASE_URL DATABASE_DIRECT_URL DATABASE_HOST NEXTAUTH_SECRET CALENDSO_ENCRYPTION_KEY
        NEXT_PUBLIC_WEBAPP_URL NEXTAUTH_URL NEXT_PUBLIC_APP_NAME NEXT_PUBLIC_API_V2_URL
        CALCOM_TELEMETRY_DISABLED ENABLE_ASYNC_TASKER EMAIL_FROM EMAIL_FROM_NAME DATABASE_READ_URL
        DATABASE_WRITE_URL REDIS_URL JWT_SECRET API_URL POSTGRES_PASSWORD REDIS_PASSWORD T0_ACCESS_TOKEN
        CAL_WEBHOOK_SECRET POSTGRES_SERVICE_ID REDIS_SERVICE_ID T0_SINK_SERVICE_ID CAL_WEB_SERVICE_ID
        CAL_API_SERVICE_ID MAILGUN_SMTP_HOST MAILGUN_SMTP_PORT MAILGUN_SMTP_USER MAILGUN_SMTP_PASSWORD"""
        self.env.update({key: "test-value-" + key for key in names.split()})

    def run_main(self, handler, project=None):
        env = self.env | ({"RAILWAY_PROJECT_ID": project} if project else {})
        output = io.StringIO()
        with patch.dict(os.environ, env, clear=True), patch.object(sync.sys, "argv", ["sync", "--apply"]), \
             patch.object(sync, "railway", side_effect=handler), contextlib.redirect_stdout(output):
            sync.main()
        return output.getvalue()

    def test_all_writes_precede_one_deployment_per_service(self):
        calls = []
        def api(query, variables):
            calls.append((query, variables))
            return {"serviceInstanceDeployV2": "test-deployment"}
        output = self.run_main(api)
        self.assertEqual(len(calls), 10)
        for query, variables in calls[:5]:
            self.assertIn("variableCollectionUpsert", query)
            self.assertTrue(variables["input"]["skipDeploys"])
            self.assertFalse(variables["input"]["replace"])
        services = [variables["serviceId"] for _, variables in calls[5:]]
        self.assertEqual(len(set(services)), 5)
        self.assertNotIn("test-value-", output)

    def test_failed_write_never_deploys(self):
        calls = []
        def api(query, variables):
            calls.append(query)
            if len(calls) == 3:
                raise RuntimeError("test write failure")
            return {}
        with self.assertRaises(RuntimeError):
            self.run_main(api)
        self.assertTrue(all("variableCollectionUpsert" in query for query in calls))

    def test_wrong_project_has_no_side_effects(self):
        def unexpected(*args):
            self.fail("Should reject before contacting Railway")
        with self.assertRaises(RuntimeError):
            self.run_main(unexpected, "crm-project")

    def test_capture_cannot_use_mailgun_credentials(self):
        with patch.dict(os.environ, self.env, clear=True):
            groups = sync.collections()
        for name in ("cal-web", "cal-api"):
            self.assertEqual(groups[name]["EMAIL_SERVER_HOST"], "t0-sink.railway.internal")
            self.assertEqual(groups[name]["EMAIL_SERVER_PASSWORD"], "")
        self.assertEqual(groups["cal-api"]["STRIPE_API_KEY"], "sk_test_unused")

    def test_real_smtp_reads_only_original_mailgun_source(self):
        with patch.dict(os.environ, self.env | {"SMTP_MODE": "mailgun", "EMAIL_SERVER_PASSWORD": "stale-copy"}, clear=True):
            groups = sync.collections()
        self.assertEqual(groups["cal-web"]["EMAIL_SERVER_PASSWORD"], self.env["MAILGUN_SMTP_PASSWORD"])

    def test_deployed_log_levels_suppress_sensitive_informational_logs(self):
        with patch.dict(os.environ, self.env, clear=True):
            groups = sync.collections()
        self.assertEqual(groups["cal-api"]["LOG_LEVEL"], "warn")
        self.assertEqual(groups["cal-web"]["NEXTAUTH_DEBUG"], "")
        self.assertEqual(groups["cal-web"]["NEXT_PUBLIC_LOGGER_LEVEL"], "4")


if __name__ == "__main__":
    unittest.main()
