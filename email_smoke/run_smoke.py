"""
run_smoke.py
Local email smoke test runner.

Starts two local servers:
  Port 1025  --  SMTP capture server (receives outgoing mail)
  Port 8025  --  HTTP inbox API      (queries captured mail as JSON)

Sends 8 test emails through Sender -> Port 1025.
Verifies each arrived in the inbox (via local HTTP check).
Prints a pass/fail table and exits 0 on all-pass, 1 on any failure.

Usage:
    python run_smoke.py            # run all tests
    python run_smoke.py --list     # list test names
    python run_smoke.py <name>     # run one test by name
    python run_smoke.py --keep     # keep servers running after tests (Ctrl-C to stop)
    python run_smoke.py --no-api   # skip HTTP API server (inbox still works via Python)

Console output goes to stdout.
Server/protocol debug output goes to stderr.

No external dependencies -- pure Python stdlib + openai (already installed).
"""

import argparse
import json
import socket
import sys
import time
import traceback
import urllib.request
import urllib.error
import os

# allow running as a script without installing the package
# Python auto-adds the script's own dir (email_smoke/) to sys.path;
# we need the parent (live-css/) so that "import email_smoke" resolves.
_HERE  = os.path.dirname(os.path.abspath(__file__))          # email_smoke/
_ROOT  = os.path.dirname(_HERE)                               # live-css/
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
if _HERE in sys.path:
    sys.path.remove(_HERE)   # remove the bare package dir to avoid shadow imports

from email_smoke.email_incoming.inbox  import get_inbox
from email_smoke.email_incoming.server import SMTPServer, SMTP_PORT
from email_smoke.email_incoming.api    import InboxAPIServer, HTTP_PORT
from email_smoke.email_sender.sender   import Sender, SenderError
from email_smoke.email_sender          import templates as T

# ------------------------------------------------------------------
# ANSI color helpers (disabled automatically when not a tty)
# ------------------------------------------------------------------
_USE_COLOR = sys.stdout.isatty()

def _green(s):  return f"\033[32m{s}\033[0m" if _USE_COLOR else s
def _red(s):    return f"\033[31m{s}\033[0m" if _USE_COLOR else s
def _cyan(s):   return f"\033[36m{s}\033[0m" if _USE_COLOR else s
def _yellow(s): return f"\033[33m{s}\033[0m" if _USE_COLOR else s
def _bold(s):   return f"\033[1m{s}\033[0m"  if _USE_COLOR else s


# ------------------------------------------------------------------
# Test definitions
# ------------------------------------------------------------------
def _make_tests() -> list[dict]:
    """
    Each test dict:
        name        str   display name
        factory     fn    msg_dict factory from templates.py
        verify      fn    predicate(msg_summary) -> bool
        description str   one-liner
    """
    inbox = get_inbox()

    def _check_subject(contains: str):
        return lambda m: contains.lower() in m.get("subject", "").lower()

    def _check_to(addr: str):
        return lambda m: any(addr.lower() in a.lower() for a in m.get("to_addrs", []))

    return [
        {
            "name":        "plain_text",
            "description": "Plain text email to single recipient",
            "factory":     T.plain_text,
            "verify":      _check_subject("plain text"),
        },
        {
            "name":        "html_email",
            "description": "Multipart email with HTML and plain-text fallback",
            "factory":     T.html_email,
            "verify":      _check_subject("html email"),
        },
        {
            "name":        "multi_recipient",
            "description": "One message to 3 recipients",
            "factory":     T.multi_recipient,
            "verify":      _check_to("alice@smoke.local"),
        },
        {
            "name":        "extra_headers",
            "description": "Email with Reply-To and custom headers",
            "factory":     T.extra_headers,
            "verify":      _check_subject("extra headers"),
        },
        {
            "name":        "utf8_content",
            "description": "UTF-8 body with Chinese, Arabic, accented chars",
            "factory":     T.utf8_content,
            "verify":      _check_subject("utf-8"),
        },
        {
            "name":        "with_attachment",
            "description": "Email with a base64-encoded CSV attachment",
            "factory":     T.with_attachment,
            "verify":      _check_subject("attachment"),
        },
        {
            "name":        "large_body",
            "description": "64 KB plain-text body stress test",
            "factory":     lambda: T.large_body(size_kb=64),
            "verify":      lambda m: m.get("size", 0) >= 60_000,
        },
        {
            "name":        "auto_responder",
            "description": "HTML auto-responder with Precedence: bulk header",
            "factory":     T.auto_responder,
            "verify":      _check_subject("auto:"),
        },
    ]


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _wait_for_port(host: str, port: int, timeout: float = 5.0) -> bool:
    """Block until a TCP port accepts connections or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            time.sleep(0.1)
    return False


def _http_get(url: str, timeout: float = 5.0) -> dict | None:
    """GET a JSON endpoint; returns parsed dict or None on error."""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"  [http] GET {url} failed: {exc}", file=sys.stderr, flush=True)
        return None


def _print_table(results: list[dict]):
    """Print a formatted pass/fail table to stdout."""
    max_name = max(len(r["name"]) for r in results)
    max_desc = max(len(r["description"]) for r in results)

    header = f"  {'TEST':<{max_name}}  {'DESCRIPTION':<{max_desc}}  RESULT"
    print(_bold(header))
    print("  " + "-" * (len(header) - 2))

    for r in results:
        status = _green("PASS") if r["passed"] else _red("FAIL")
        note   = ""
        if not r["passed"]:
            note = f"  <- {r.get('error', 'did not arrive in inbox')}"
        print(f"  {r['name']:<{max_name}}  {r['description']:<{max_desc}}  {status}{note}")

    passed = sum(1 for r in results if r["passed"])
    total  = len(results)
    print()
    if passed == total:
        print(_bold(_green(f"  All {total} tests passed.")))
    else:
        print(_bold(_red(f"  {total - passed}/{total} tests failed.")))


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
def run(test_names: list[str] | None = None, start_api: bool = True, keep: bool = False):
    inbox = get_inbox()
    inbox.clear()

    # ------------------------------------------------------------------
    # Start SMTP server
    # ------------------------------------------------------------------
    smtp = SMTPServer()
    try:
        smtp.start()
    except OSError as exc:
        print(_red(f"[run_smoke] FATAL: cannot start SMTP server on port {SMTP_PORT}: {exc}"),
              file=sys.stderr, flush=True)
        print("[run_smoke] TIP: check nothing else is using port 1025 (lsof -i :1025)",
              file=sys.stderr, flush=True)
        sys.exit(1)

    if not _wait_for_port("127.0.0.1", SMTP_PORT, timeout=4.0):
        print(_red(f"[run_smoke] SMTP server did not become ready on :{SMTP_PORT}"),
              file=sys.stderr, flush=True)
        smtp.stop()
        sys.exit(1)

    print(_cyan(f"[run_smoke] SMTP capture server ready on port {SMTP_PORT}"))

    # ------------------------------------------------------------------
    # Start HTTP inbox API
    # ------------------------------------------------------------------
    api: InboxAPIServer | None = None
    if start_api:
        api = InboxAPIServer()
        try:
            api.start()
        except OSError as exc:
            print(_yellow(f"[run_smoke] WARNING: cannot start HTTP API on port {HTTP_PORT}: {exc}"),
                  file=sys.stderr, flush=True)
            print("[run_smoke] Continuing without HTTP API -- inbox checks will use Python directly",
                  file=sys.stderr, flush=True)
            api = None

        if api and not _wait_for_port("127.0.0.1", HTTP_PORT, timeout=4.0):
            print(_yellow(f"[run_smoke] WARNING: HTTP API did not become ready on :{HTTP_PORT}"),
                  file=sys.stderr, flush=True)
            api = None

        if api:
            print(_cyan(f"[run_smoke] HTTP inbox API ready on http://127.0.0.1:{HTTP_PORT}"))

    # ------------------------------------------------------------------
    # Connect sender
    # ------------------------------------------------------------------
    try:
        sender = Sender()
    except SenderError as exc:
        print(_red(f"[run_smoke] cannot connect sender: {exc}"), file=sys.stderr, flush=True)
        smtp.stop()
        if api:
            api.stop()
        sys.exit(1)

    # ------------------------------------------------------------------
    # Run tests
    # ------------------------------------------------------------------
    all_tests = _make_tests()
    if test_names:
        filtered = [t for t in all_tests if t["name"] in test_names]
        unknown  = set(test_names) - {t["name"] for t in all_tests}
        if unknown:
            print(_yellow(f"[run_smoke] unknown test names: {sorted(unknown)}"),
                  file=sys.stderr, flush=True)
        tests = filtered
    else:
        tests = all_tests

    print()
    print(_bold(f"[run_smoke] Running {len(tests)} test(s)...\n"))

    results = []
    for test in tests:
        name   = test["name"]
        desc   = test["description"]
        result = {"name": name, "description": desc, "passed": False, "error": ""}

        try:
            msg  = test["factory"]()
            send = sender.send(msg)

            if not send.get("ok"):
                result["error"] = f"send failed: {send.get('error', 'unknown')}"
                print(f"  {name}: {_red('send FAILED')} -- {result['error']}")
                results.append(result)
                continue

            # wait up to 3 s for message to appear in inbox
            arrived = inbox.wait_for(test["verify"], timeout=3.0)

            if arrived:
                result["passed"] = True
                print(f"  {name}: {_green('PASS')}  id={arrived.get('id')} size={arrived.get('size')}b")
            else:
                result["error"] = "message did not arrive in inbox within 3 s"
                print(f"  {name}: {_red('FAIL')}  -- {result['error']}")

        except Exception as exc:
            tb = traceback.format_exc()
            result["error"] = str(exc)
            print(f"  {name}: {_red('ERROR')} -- {exc}")
            print(tb[:400], file=sys.stderr, flush=True)

        results.append(result)

    sender.disconnect()
    print()

    # ------------------------------------------------------------------
    # HTTP API sanity check
    # ------------------------------------------------------------------
    if api:
        print(_bold("[run_smoke] HTTP API spot-check..."))
        status = _http_get(f"http://127.0.0.1:{HTTP_PORT}/")
        if status:
            print(f"  GET /  ->  count={status.get('count')}  smtp_port={status.get('smtp_port')}")
        msgs = _http_get(f"http://127.0.0.1:{HTTP_PORT}/messages")
        if msgs is not None:
            print(f"  GET /messages  ->  {len(msgs)} message(s) returned")
        if msgs:
            first_id = msgs[0].get("id")
            detail = _http_get(f"http://127.0.0.1:{HTTP_PORT}/message/{first_id}")
            if detail:
                print(f"  GET /message/{first_id}  ->  subject={detail.get('subject')!r}")
        print()

    # ------------------------------------------------------------------
    # Summary table
    # ------------------------------------------------------------------
    _print_table(results)
    print()

    # ------------------------------------------------------------------
    # Keep running (for manual inspection) or stop
    # ------------------------------------------------------------------
    if keep:
        print(_cyan(f"[run_smoke] servers still running -- press Ctrl-C to stop"))
        print(f"  SMTP: localhost:{SMTP_PORT}")
        if api:
            print(f"  HTTP: http://127.0.0.1:{HTTP_PORT}/messages")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[run_smoke] stopping...")

    smtp.stop()
    if api:
        api.stop()

    failed = sum(1 for r in results if not r["passed"])
    return failed


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        prog="run_smoke",
        description="Local email smoke test -- starts SMTP:1025 + HTTP:8025 and runs email feature tests",
    )
    parser.add_argument("tests", nargs="*", metavar="TEST_NAME",
                        help="run specific tests by name (omit for all)")
    parser.add_argument("--list",   action="store_true", help="print test names and exit")
    parser.add_argument("--keep",   action="store_true", help="keep servers running after tests")
    parser.add_argument("--no-api", action="store_true", help="skip HTTP inbox API server")
    parser.add_argument("--quiet",  action="store_true", help="suppress server debug output")

    args = parser.parse_args()

    if args.quiet:
        import os as _os
        # redirect stderr to /dev/null to silence server debug lines
        sys.stderr = open(_os.devnull, "w")

    if args.list:
        print("Available tests:")
        for t in _make_tests():
            print(f"  {t['name']:<20}  {t['description']}")
        sys.exit(0)

    failed = run(
        test_names=args.tests or None,
        start_api=not args.no_api,
        keep=args.keep,
    )
    sys.exit(0 if failed == 0 else 1)
