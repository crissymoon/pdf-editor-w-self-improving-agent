#!/usr/bin/env python3
"""
Send a PDF attachment through the local email_smoke sender.

This script expects the `email_smoke` package to be importable from repo root.
It sends to the local SMTP capture server (default 127.0.0.1:1025).
"""

import argparse
import pathlib
import sys
import time


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send PDF via local email_smoke SMTP sender")
    parser.add_argument("--pdf", required=True, help="Path to PDF file to attach")
    parser.add_argument("--to", required=True, help="Recipient email")
    parser.add_argument("--subject", default="XCM-PDF document", help="Email subject")
    parser.add_argument("--body", default="Attached is your PDF from XCM-PDF.", help="Plain text body")
    parser.add_argument("--from", dest="from_addr", default="no-reply@xcmpdf.local", help="From email")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    repo_root = pathlib.Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    try:
        from email_smoke.email_sender.sender import Sender, SenderError  # type: ignore
        from email_smoke.email_incoming.server import SMTPServer  # type: ignore
    except Exception as exc:
        print(f"ERROR: failed to import email_smoke sender: {exc}", file=sys.stderr)
        return 2

    pdf_path = pathlib.Path(args.pdf).resolve()
    if not pdf_path.exists() or not pdf_path.is_file():
        print(f"ERROR: PDF file not found: {pdf_path}", file=sys.stderr)
        return 2

    try:
        attachment_bytes = pdf_path.read_bytes()
    except Exception as exc:
        print(f"ERROR: failed to read PDF: {exc}", file=sys.stderr)
        return 2

    message = {
        "from_addr": args.from_addr,
        "to_addrs": [args.to],
        "subject": args.subject,
        "body_text": args.body,
        "attachments": [
            {
                "name": pdf_path.name,
                "data": attachment_bytes,
                "mime_type": "application/pdf",
            }
        ],
    }

    smtp_server = None
    try:
        try:
            sender = Sender()
        except SenderError:
            smtp_server = SMTPServer()
            smtp_server.start()
            time.sleep(0.2)
            sender = Sender()

        with sender:
            result = sender.send(message)
    except Exception as exc:
        print(f"ERROR: sender failure: {exc}", file=sys.stderr)
        return 1
    finally:
        if smtp_server is not None:
            try:
                smtp_server.stop()
            except Exception:
                pass

    if not result.get("ok"):
        print(f"ERROR: send failed: {result.get('error', 'unknown error')}", file=sys.stderr)
        return 1

    print(f"OK: sent PDF to {args.to} with subject {args.subject}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
