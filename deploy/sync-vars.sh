#!/usr/bin/env bash
set -euo pipefail
set +x
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
reader="$HOME/.config/infisical/leer.py"
mode=${1:---dry-run}
case "$mode" in --dry-run|--apply|--apply-no-deploy) ;; *) echo 'Usage: deploy/sync-vars.sh [--dry-run|--apply|--apply-no-deploy]' >&2; exit 2 ;; esac
google=()
if python3 "$reader" RBLN /cal GOOGLE_API_CREDENTIALS -- true >/dev/null 2>&1; then
  google=(python3 "$reader" RBLN /cal GOOGLE_API_CREDENTIALS --)
fi
exec "${google[@]}" python3 "$reader" RBLN /railway RAILWAY_API_TOKEN -- \
  python3 "$reader" RBLN /crm CAL_WEBHOOK_SECRET -- \
  python3 "$reader" RBLN /mailgun MAILGUN_SMTP_HOST MAILGUN_SMTP_PORT MAILGUN_SMTP_USER MAILGUN_SMTP_PASSWORD -- \
  python3 "$reader" RBLN /cal \
  RAILWAY_PROJECT_ID RAILWAY_ENVIRONMENT_ID POSTGRES_SERVICE_ID REDIS_SERVICE_ID \
  CAL_WEB_SERVICE_ID CAL_API_SERVICE_ID T0_SINK_SERVICE_ID \
  POSTGRES_PASSWORD REDIS_PASSWORD DATABASE_URL DATABASE_DIRECT_URL DATABASE_READ_URL DATABASE_WRITE_URL DATABASE_HOST REDIS_URL \
  NEXTAUTH_SECRET CALENDSO_ENCRYPTION_KEY JWT_SECRET NEXT_PUBLIC_WEBAPP_URL NEXTAUTH_URL API_URL NEXT_PUBLIC_API_V2_URL \
  NEXT_PUBLIC_APP_NAME CALCOM_TELEMETRY_DISABLED ENABLE_ASYNC_TASKER \
  EMAIL_FROM EMAIL_FROM_NAME \
  SMTP_MODE T0_ACCESS_TOKEN -- python3 "$root/sync-vars.py" "$mode"
