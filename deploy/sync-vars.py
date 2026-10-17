"""Infisical -> Railway. Values stay in memory and curl's stdin, never argv/files."""
import json
import os
import subprocess
import sys
import time


def railway(query, variables):
    body = json.dumps({"query": query, "variables": variables})
    config = 'header = "Authorization: Bearer ' + os.environ["RAILWAY_API_TOKEN"] + '"\n'
    config += "data = " + json.dumps(body) + "\n"
    result = subprocess.run(
        ["curl", "--silent", "--show-error", "--max-time", "40", "--config", "-",
         "-H", "Content-Type: application/json", "https://backboard.railway.com/graphql/v2"],
        input=config, text=True, capture_output=True, check=False,
    )
    try:
        payload = json.loads(result.stdout)
    except ValueError:
        raise RuntimeError("Railway returned an invalid response") from None
    if result.returncode or payload.get("errors"):
        # Railway errors may echo the submitted secret values.
        raise RuntimeError("Railway rejected the operation; no response body logged")
    return payload["data"]


def selected(names):
    return {name: os.environ[name] for name in names.split()}


def collections():
    common = selected("DATABASE_URL DATABASE_DIRECT_URL DATABASE_HOST NEXTAUTH_SECRET "
                      "CALENDSO_ENCRYPTION_KEY NEXT_PUBLIC_WEBAPP_URL NEXTAUTH_URL "
                      "NEXT_PUBLIC_APP_NAME NEXT_PUBLIC_API_V2_URL CALCOM_TELEMETRY_DISABLED "
                      "ENABLE_ASYNC_TASKER EMAIL_FROM EMAIL_FROM_NAME")
    common.update(NODE_ENV="production", NEXTAUTH_DEBUG="", NEXT_PUBLIC_LOGGER_LEVEL="4")
    if os.environ.get("GOOGLE_API_CREDENTIALS"):
        common["GOOGLE_API_CREDENTIALS"] = os.environ["GOOGLE_API_CREDENTIALS"]
    smtp_mode = os.environ["SMTP_MODE"]
    if smtp_mode == "capture":
        common.update(EMAIL_SERVER_HOST="t0-sink.railway.internal", EMAIL_SERVER_PORT="1025",
                      EMAIL_SERVER_USER="", EMAIL_SERVER_PASSWORD="")
    elif smtp_mode == "mailgun":
        common.update({"EMAIL_SERVER_" + suffix: os.environ["MAILGUN_SMTP_" + suffix]
                       for suffix in ("HOST", "PORT", "USER", "PASSWORD")})
    else:
        raise RuntimeError("SMTP_MODE must be capture or mailgun")
    api = common | selected("DATABASE_READ_URL DATABASE_WRITE_URL REDIS_URL JWT_SECRET "
                            "API_URL")
    api.update(API_PORT="5555", PORT="5555", LOG_LEVEL="warn",
               STRIPE_API_KEY="sk_test_unused", STRIPE_WEBHOOK_SECRET="whsec_unused")
    return {
        "postgres": {"POSTGRES_PASSWORD": os.environ["POSTGRES_PASSWORD"],
                     "POSTGRES_USER": "postgres", "POSTGRES_DB": "calendso",
                     "PGDATA": "/var/lib/postgresql/data/pgdata"},
        "redis": selected("REDIS_PASSWORD"),
        "t0-sink": selected("T0_ACCESS_TOKEN CAL_WEBHOOK_SECRET") | {"PORT": "8080"},
        "cal-web": common | {"PORT": "3000", "NEXT_TELEMETRY_DISABLED": "1"},
        "cal-api": api,
    }


def main():
    mode = sys.argv[1]
    if mode not in ("--dry-run", "--apply", "--apply-no-deploy"):
        raise RuntimeError("Invalid mode")
    project = os.environ["RAILWAY_PROJECT_ID"]
    environment = os.environ["RAILWAY_ENVIRONMENT_ID"]
    if project != "e9436072-a192-43c7-b0fd-6d6723264525":
        raise RuntimeError("Refusing to sync /cal outside the approved rbln-cal project")
    groups = collections()
    for name, values in groups.items():
        print(name + ": " + ", ".join(sorted(values)), flush=True)
        if mode == "--dry-run":
            continue
        railway("mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}", {
            "input": {"projectId": project, "environmentId": environment,
                      "serviceId": os.environ[name.upper().replace("-", "_") + "_SERVICE_ID"],
                      "variables": values, "skipDeploys": True, "replace": False},
        })
    # Deploy only after every variable collection has succeeded, once per service.
    if mode == "--apply":
        deployments = []
        for name in groups:
            result = railway("mutation($serviceId:String!,$environmentId:String!){"
                    "serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId)}", {
                        "serviceId": os.environ[name.upper().replace("-", "_") + "_SERVICE_ID"],
                        "environmentId": environment,
                    })
            deployments.append((name, result["serviceInstanceDeployV2"]))
            print(name + ": deployment requested", flush=True)
        if os.environ.get("CAL_SYNC_WAIT_DEPLOYS") == "yes":
            for name, deployment_id in deployments:
                for attempt in range(120):
                    result = railway("query($id:String!){deployment(id:$id){status}}", {"id": deployment_id})
                    status = result["deployment"]["status"]
                    if status == "SUCCESS":
                        break
                    if status in ("FAILED", "CRASHED", "REMOVED", "SKIPPED"):
                        raise RuntimeError(name + ": deployment failed")
                    time.sleep(5)
                else:
                    raise RuntimeError(name + ": deployment timed out")
                print(name + ": deployment healthy", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Sync failed", file=sys.stderr)
        sys.exit(1)
