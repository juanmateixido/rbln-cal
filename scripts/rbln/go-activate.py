"""Run only inside the approved GO wizard; never touches CRM configuration."""
import os
from pathlib import Path
import subprocess
import time
import urllib.request


def main():
    if os.environ.get("CAL_GO_APPROVED") != "yes":
        raise RuntimeError("GO is required")
    root = Path(__file__).resolve().parents[2]
    writer = str(Path.home() / ".config/infisical/cargar.py")
    for name, value in {"SMTP_MODE": "mailgun", "NEXTAUTH_URL": "https://agenda.rebelion.training",
                        "NEXT_PUBLIC_WEBAPP_URL": "https://agenda.rebelion.training"}.items():
        subprocess.run(["python3", writer, "RBLN", "/cal", name], input=value, text=True, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run([str(root / "deploy/sync-vars.sh"), "--apply"], check=True,
                   env=os.environ | {"CAL_SYNC_WAIT_DEPLOYS": "yes"})
    for url in ("https://agenda.rebelion.training/auth/login",
                "https://cal-api-production-902f.up.railway.app/health"):
        for attempt in range(60):
            try:
                with urllib.request.urlopen(url, timeout=10) as response:
                    if response.status == 200:
                        break
            except Exception:
                pass
            time.sleep(5)
        else:
            raise RuntimeError("Deployment did not become healthy; stop before reset")
    print("GO deployment healthy; BOOKING_MODE remains off")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("GO activation failed; inspect deployment state, no secret values logged")
