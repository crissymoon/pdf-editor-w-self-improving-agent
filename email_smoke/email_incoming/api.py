"""
api.py
HTTP inbox API  --  listens on localhost:HTTP_PORT (default 8025).

Endpoints:
  GET  /               -- JSON: { "count": N, "smtp_port": 1025, "http_port": 8025 }
  GET  /messages       -- JSON: list of message summaries (newest first)
  GET  /messages?to=x  -- filter by recipient envelope address
  GET  /messages?q=x   -- filter by subject substring
  GET  /message/<id>   -- JSON: full message including "raw" body
  GET  /message/<id>/raw -- raw DATA payload as text/plain
  POST /clear          -- flush inbox, returns { "cleared": N }

All JSON responses use UTF-8 and include CORS headers so a browser
or any local HTTP client can access them.

No external dependencies -- pure Python stdlib (http.server + json).
"""

import json
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from .inbox import get_inbox
from .server import SMTP_PORT

HTTP_PORT = 8025
HTTP_HOST = "127.0.0.1"


class _Handler(BaseHTTPRequestHandler):
    # silence the default per-request access log; we do our own
    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path   = parsed.path.rstrip("/")
        qs     = urllib.parse.parse_qs(parsed.query)
        inbox  = get_inbox()

        try:
            if path == "" or path == "/":
                body = {
                    "status":    "ok",
                    "count":     inbox.count(),
                    "smtp_port": SMTP_PORT,
                    "http_port": HTTP_PORT,
                }
                self._json(body)

            elif path == "/messages":
                to_filter = qs.get("to",  [None])[0] or ""
                q_filter  = qs.get("q",   [None])[0] or ""
                if to_filter or q_filter:
                    msgs = inbox.search(to_addr=to_filter, subject_contains=q_filter)
                else:
                    msgs = inbox.list(limit=200)
                self._json(msgs)

            elif path.startswith("/message/"):
                rest = path[len("/message/"):]
                parts = rest.split("/", 1)
                try:
                    msg_id = int(parts[0])
                except ValueError:
                    self._err(400, "message id must be an integer")
                    return

                msg = inbox.get(msg_id)
                if msg is None:
                    self._err(404, f"message {msg_id} not found")
                    return

                if len(parts) == 2 and parts[1] == "raw":
                    raw = msg.get("raw", "")
                    self._send(200, raw.encode("utf-8", errors="replace"),
                               content_type="text/plain; charset=utf-8")
                else:
                    self._json(msg)

            else:
                self._err(404, "unknown endpoint")

        except Exception as exc:
            _err(f"GET {self.path}: unhandled error: {exc}")
            self._err(500, f"internal error: {exc}")

    # ------------------------------------------------------------------
    def do_POST(self):
        path  = self.path.rstrip("/")
        inbox = get_inbox()

        try:
            if path == "/clear":
                n = inbox.clear()
                self._json({"cleared": n})
            else:
                self._err(404, "unknown endpoint")
        except Exception as exc:
            _err(f"POST {self.path}: unhandled error: {exc}")
            self._err(500, f"internal error: {exc}")

    # ------------------------------------------------------------------
    def _json(self, data, status: int = 200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self._send(status, body, "application/json; charset=utf-8")

    def _err(self, status: int, msg: str):
        self._json({"error": msg, "status": status}, status=status)

    def _send(self, status: int, body: bytes, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass


# ------------------------------------------------------------------
# Server lifecycle
# ------------------------------------------------------------------
class InboxAPIServer:
    """
    Threaded HTTP inbox query server.

    Usage:
        api = InboxAPIServer()
        api.start()
        ...
        api.stop()
    """

    def __init__(self, host: str = HTTP_HOST, port: int = HTTP_PORT):
        self._host    = host
        self._port    = port
        self._httpd:  HTTPServer | None      = None
        self._thread: threading.Thread | None = None

    def start(self):
        try:
            self._httpd = HTTPServer((self._host, self._port), _Handler)
            self._httpd.timeout = 1.0
            _log(f"HTTP inbox API listening on http://{self._host}:{self._port}")
        except OSError as exc:
            _err(f"InboxAPIServer.start: bind to {self._host}:{self._port} failed: {exc}")
            raise

        self._thread = threading.Thread(
            target=self._httpd.serve_forever,
            daemon=True,
            name="inbox-api",
        )
        self._thread.start()

    def stop(self, timeout: float = 3.0):
        if self._httpd:
            self._httpd.shutdown()
        if self._thread:
            self._thread.join(timeout=timeout)
        _log("HTTP inbox API stopped")

    @property
    def port(self) -> int:
        return self._port


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _log(msg: str):
    print(f"[inbox-api] {msg}", file=sys.stderr, flush=True)

def _err(msg: str):
    print(f"[inbox-api] ERROR {msg}", file=sys.stderr, flush=True)
