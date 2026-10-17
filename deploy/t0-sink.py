"""Ephemeral T0 SMTP/webhook receiver. No delivery, disk writes or payload logs."""
import asyncore
import base64
from collections import deque
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import smtpd
import threading

MAILS = deque(maxlen=100)
WEBHOOKS = deque(maxlen=100)
TOKEN = os.environ["T0_ACCESS_TOKEN"]
SECRET = os.environ["CAL_WEBHOOK_SECRET"]
if len(TOKEN) < 32 or len(SECRET) < 32:
    raise RuntimeError("T0 secrets must contain at least 32 characters")


class SMTP(smtpd.SMTPServer):
    def process_message(self, peer, mailfrom, rcpttos, data, **kwargs):
        MAILS.append({"from": mailfrom, "to": rcpttos, "raw": base64.b64encode(data).decode()})


class HTTP(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        if not self.authorized():
            return self.reply(401, {"error": "unauthorized"})
        if self.path == "/capture":
            return self.reply(200, {"mails": list(MAILS), "webhooks": list(WEBHOOKS)})
        self.reply(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/webhook":
            return self.reply(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400, {"error": "length"})
        if length <= 0 or length > 1024 * 1024:
            return self.reply(413, {"error": "size"})
        self.connection.settimeout(10)
        raw = self.rfile.read(length)
        signature = self.headers.get("X-Cal-Signature-256", "")
        expected = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return self.reply(401, {"error": "signature"})
        try:
            payload = json.loads(raw)
        except ValueError:
            return self.reply(400, {"error": "json"})
        WEBHOOKS.append({"verified": True, "sha256": hashlib.sha256(raw).hexdigest(), "payload": payload})
        self.reply(200, {"ok": True})


if __name__ == "__main__":
    smtp = SMTP(("::", 1025), None, data_size_limit=2 * 1024 * 1024, decode_data=False)
    threading.Thread(target=asyncore.loop, kwargs={"timeout": 1}, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), HTTP).serve_forever()
