"""Fail closed on private build inputs; inspect names, never print values."""
import argparse
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Name-only snapshot: RBLN /cal, bridge /crm, and runtime SMTP/OAuth additions.
CATALOG = set("""
API_URL BOOKING_MODE CALCOM_TELEMETRY_DISABLED CALENDSO_ENCRYPTION_KEY
CAL_ADMIN_EMAIL CAL_ADMIN_INITIAL_PASSWORD CAL_API_SERVICE_ID CAL_API_URL
CAL_WEB_SERVICE_ID DATABASE_DIRECT_URL DATABASE_HOST DATABASE_READ_URL
DATABASE_URL DATABASE_WRITE_URL EMAIL_FROM EMAIL_FROM_NAME ENABLE_ASYNC_TASKER
JWT_SECRET NEXTAUTH_SECRET NEXTAUTH_URL NEXT_PUBLIC_API_V2_URL NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_WEBAPP_URL POSTGRES_PASSWORD POSTGRES_SERVICE_ID RAILWAY_ENVIRONMENT_ID
RAILWAY_PROJECT_ID REDIS_PASSWORD REDIS_SERVICE_ID REDIS_URL SMTP_MODE T0_ACCESS_TOKEN
T0_SINK_SERVICE_ID T0_SINK_URL CAL_API_KEY CAL_API_KEY_CRM CAL_WEBHOOK_SECRET
BOOKING_TEST_TO GOOGLE_API_CREDENTIALS CALCOM_SERVICE_ACCOUNT_ENCRYPTION_KEY
EMAIL_SERVER_HOST EMAIL_SERVER_PORT EMAIL_SERVER_USER EMAIL_SERVER_PASSWORD
""".split())
PUBLIC_ARGS = set("""
NEXT_PUBLIC_LICENSE_CONSENT NEXT_PUBLIC_WEBSITE_TERMS_URL
NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL CALCOM_TELEMETRY_DISABLED
MAX_OLD_SPACE_SIZE NEXT_PUBLIC_API_V2_URL NEXT_PUBLIC_APP_NAME CSP_POLICY
NEXT_PUBLIC_SINGLE_ORG_SLUG ORGANIZATIONS_ENABLED NEXT_PUBLIC_WEBAPP_URL
""".split())


def private_names(text):
    names = set(re.findall(r"\b[A-Z][A-Z0-9_]+\b", text))
    return {name for name in names - PUBLIC_ARGS if name in CATALOG or
            re.search(r"(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|PRIVATE_KEY|API_KEY)", name)}


def build_args(workflow):
    result = []
    lines = workflow.splitlines()
    for index, line in enumerate(lines):
        if not re.match(r"\s*build-args:\s*\|\s*$", line):
            continue
        indent = len(line) - len(line.lstrip())
        for entry in lines[index + 1:]:
            if entry.strip() and len(entry) - len(entry.lstrip()) <= indent:
                break
            if entry.strip():
                result.append(entry.strip())
    return result


def inspect_source(root):
    errors = set()
    for path in (root / "Dockerfile", root / "apps/api/v2/Dockerfile"):
        content = path.read_text().replace("\\\n", " ")
        for line in content.splitlines():
            if re.match(r"\s*(ARG|ENV)\s", line):
                errors.update(private_names(line))
            if line.startswith("ARG "):
                name = line.split()[1].split("=")[0]
                if name not in PUBLIC_ARGS:
                    errors.add(name)
    workflow = (root / ".github/workflows/image.yml").read_text()
    for entry in build_args(workflow):
        name = entry.split("=", 1)[0]
        if name not in PUBLIC_ARGS or "${{" in entry:
            errors.add(name)
    if re.search(r"leer\.py|cargar\.py|infisical", workflow, re.I):
        errors.add("INFISICAL_ACCESS_IN_BUILD")
    for name in re.findall(r"secrets\.([A-Za-z_0-9]+)", workflow):
        if name != "GITHUB_TOKEN":
            errors.add(name)
    # These literal fixtures have no access to any persistent environment.
    expected = {
        "export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/calendso",
        "export DATABASE_DIRECT_URL=postgresql://postgres@127.0.0.1:5432/calendso",
        "export NEXTAUTH_SECRET=ci-only-no-production-access",
        "export CALENDSO_ENCRYPTION_KEY=00000000000000000000000000000000",
    }
    actual = {line.strip() for line in (root / "deploy/build-fixtures.sh").read_text().splitlines()
              if line.strip() and not line.lstrip().startswith("#")}
    if actual != expected:
        errors.add("UNAPPROVED_BUILD_FIXTURES")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image")
    args = parser.parse_args()
    errors = inspect_source(ROOT)
    if args.image:
        for command in (["docker", "history", "--no-trunc", "--format", "{{.CreatedBy}}", args.image],
                        ["docker", "image", "inspect", "--format", "{{json .Config.Env}}", args.image]):
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode:
                raise SystemExit("Image metadata could not be inspected; publication blocked")
            errors.update(private_names(result.stdout))
    if errors:
        raise SystemExit("Publication blocked by names: " + ", ".join(sorted(errors)))
    print("Public image policy: source" + (", history and environment" if args.image else "") + " PASS")


if __name__ == "__main__":
    main()
