"""T0a against one manually configured hidden event; only SMTP capture is allowed."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ["CAL_API_URL"].rstrip("/")
KEY = os.environ["CAL_API_KEY"]
EVENT = int(os.environ["T0_EVENT_TYPE_ID"])
RESULTS = {}
OPEN = set()
USED = set()
OUTPUT = Path(__file__).resolve().parents[2] / "rbln/evidence/T0a-results.json"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


HTTP = urllib.request.build_opener(NoRedirect())


def request(path, method="GET", body=None, auth=True, version="2024-08-13"):
    headers = {"Content-Type": "application/json", "cal-api-version": version}
    if auth:
        headers["Authorization"] = "Bearer " + KEY
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with HTTP.open(req, timeout=40) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read())
        except ValueError:
            payload = {}
        return error.code, payload


def record(name, success, **details):
    RESULTS[name] = {"status": "PASS" if success else "FAIL", **details}
    print(name + ": " + RESULTS[name]["status"], flush=True)
    if not success:
        raise RuntimeError(name + " failed; stop this branch and report before changing the plan")


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def slots():
    start = datetime.now(timezone.utc).date() + timedelta(days=2)
    query = urllib.parse.urlencode({"eventTypeId": EVENT, "start": str(start),
                                   "end": str(start + timedelta(days=10)), "timeZone": "UTC"})
    status, payload = request("/slots?" + query, version="2024-09-04")
    if status != 200:
        raise RuntimeError("Slots failed: HTTP " + str(status))
    return sorted(instant(slot["start"] if isinstance(slot, dict) else slot)
                  for rows in payload["data"].values() for slot in rows)


def booking_body(start):
    return {"eventTypeId": EVENT, "start": start.isoformat().replace("+00:00", "Z"),
            "attendee": {"name": "Ensayo T0", "email": "cal-t0@example.invalid",
                         "timeZone": "America/Asuncion", "language": "es"},
            "metadata": {"rblnTest": "T0a", "synthetic": "true"}}


def create(start, auth=True):
    code, payload = request("/bookings", "POST", booking_body(start), auth=auth)
    data = payload.get("data", {})
    if isinstance(data, dict) and data.get("uid"):
        OPEN.add(data["uid"])
        USED.add(data["uid"])
    return code, data


def capture():
    req = urllib.request.Request(os.environ["T0_SINK_URL"] + "/capture", headers={
        "Authorization": "Bearer " + os.environ["T0_ACCESS_TOKEN"]})
    with HTTP.open(req, timeout=20) as response:
        return json.load(response)


def main():
    if BASE != "https://cal-api-production-902f.up.railway.app/v2" or os.environ["SMTP_MODE"] != "capture":
        raise RuntimeError("T0 is restricted to rbln-cal with SMTP capture")
    code, me = request("/me", version="2024-06-11")
    record("api_key", code == 200 and me.get("data", {}).get("username") == "giuli", http=code)
    code, event = request(f"/event-types/{EVENT}", version="2024-06-14")
    config = event.get("data", {})
    record("hidden_authenticated_event", code == 200 and config.get("hidden") is True and
           config.get("bookingRequiresAuthentication") is True, http=code, event_type_id=EVENT)
    available = slots()
    record("slots_available", len(available) >= 3, count=len(available))
    first = available[0]
    second = next(slot for slot in available if slot >= first + timedelta(hours=2))
    code, _ = create(first, auth=False)
    record("anonymous_rejected", code in (401, 403), http=code)
    code, booking = create(first)
    record("pending_created", code in (200, 201) and booking.get("status") == "pending", http=code,
           state=booking.get("status"))
    uid = booking["uid"]
    record("uid_format", isinstance(uid, str) and bool(uid), length=len(uid),
           uuid=bool(re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", uid)),
           alphanumeric=uid.isalnum(), sha256=hashlib.sha256(uid.encode()).hexdigest())
    record("pending_blocks_slot", first not in slots())
    code, duplicate = create(first)
    record("duplicate_blocked", code in (400, 409, 422) and not duplicate.get("uid"), http=code)
    code, confirmed = request(f"/bookings/{uid}/confirm", "POST", {})
    record("confirm", code in (200, 201) and confirmed.get("data", {}).get("status") == "accepted", http=code)
    before_repeat = len(capture()["webhooks"])
    repeat_code, _ = request(f"/bookings/{uid}/confirm", "POST", {})
    code, state = request(f"/bookings/{uid}")
    record("confirm_repeated", code == 200 and repeat_code < 500 and state.get("data", {}).get("status") == "accepted",
           repeat_http=repeat_code, final_state=state.get("data", {}).get("status"),
           captured_webhooks_before=before_repeat)
    code, rescheduled = request(f"/bookings/{uid}/reschedule", "POST", {
        "start": second.isoformat().replace("+00:00", "Z"),
        "rescheduledBy": os.environ["CAL_ADMIN_EMAIL"], "reschedulingReason": "Ensayo T0"})
    moved = rescheduled.get("data", {})
    if moved.get("uid"):
        OPEN.discard(uid)
        OPEN.add(moved["uid"])
        USED.add(moved["uid"])
    record("reschedule", code in (200, 201) and bool(moved.get("uid")), http=code)
    code, cancelled = request(f"/bookings/{moved['uid']}/cancel", "POST", {"cancellationReason": "Ensayo T0"})
    record("cancel", code in (200, 201) and cancelled.get("data", {}).get("status") == "cancelled", http=code)
    OPEN.discard(moved["uid"])
    code, pending = create(first)
    record("new_pending", code in (200, 201) and pending.get("status") == "pending", http=code)
    code, declined = request(f"/bookings/{pending['uid']}/decline", "POST", {"reason": "Ensayo T0"})
    record("decline", code in (200, 201) and declined.get("data", {}).get("status") == "rejected", http=code)
    OPEN.discard(pending["uid"])
    record("decline_releases_slot", first in slots())
    expected = {"BOOKING_REQUESTED", "BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED", "BOOKING_REJECTED"}
    for attempt in range(15):
        received = capture()
        hooks = [hook for hook in received["webhooks"] if hook["payload"].get("triggerEvent") in expected and
                 hook["payload"].get("payload", {}).get("uid") in USED]
        triggers = {hook["payload"]["triggerEvent"] for hook in hooks}
        if expected <= triggers:
            break
        time.sleep(1)
    record("signed_webhooks", expected <= triggers and all(hook["verified"] for hook in hooks),
           triggers=sorted(triggers), capture_count=len(hooks), captured_mail_count=len(received["mails"]))


if __name__ == "__main__":
    failed = False
    try:
        main()
    except Exception as error:
        failed = True
        RESULTS["stopped"] = {"status": "FAIL", "reason": str(error) if isinstance(error, RuntimeError)
                              else "Unexpected response; details withheld"}
        print(RESULTS["stopped"]["reason"], flush=True)
    finally:
        for uid in list(OPEN):
            try:
                code, payload = request(f"/bookings/{uid}")
                state = payload.get("data", {}).get("status")
                action = "decline" if state == "pending" else "cancel"
                if state in ("pending", "accepted"):
                    body = {"reason": "Ensayo T0"} if action == "decline" else {"cancellationReason": "Ensayo T0"}
                    code, _ = request(f"/bookings/{uid}/{action}", "POST", body)
                if code in (200, 201):
                    OPEN.discard(uid)
            except Exception:
                pass
        RESULTS["cleanup"] = {"status": "PASS" if not OPEN else "FAIL", "remaining": len(OPEN)}
        OUTPUT.write_text(json.dumps({"at": datetime.now(timezone.utc).isoformat(),
                          "upstream_sha": "54343aa685ae8f33159d2f485ec4a57bad5c574a",
                          "checks": RESULTS}, indent=2) + "\n")
    raise SystemExit(1 if failed or OPEN else 0)
