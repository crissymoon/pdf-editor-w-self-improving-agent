"""
sender.py
smtplib wrapper that sends to the local smoke SMTP server.

All errors are caught and re-raised as SenderError (a plain RuntimeError
subclass) so callers always have a clear failure message in the console.

Usage:
    from email_sender.sender import Sender
    s = Sender()                        # connects to localhost:1025
    s.send(msg_dict)                    # msg_dict from templates.py
    s.disconnect()

Or as a context manager:
    with Sender() as s:
        s.send(msg_dict)
"""

import smtplib
import sys
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email.mime.base      import MIMEBase
from email               import encoders

from ..email_incoming.server import SMTP_HOST, SMTP_PORT


class SenderError(RuntimeError):
    """Raised when a send operation fails.  Message is always console-printable."""


class Sender:
    """
    Thin wrapper around smtplib.SMTP connecting to the local smoke server.
    """

    def __init__(self, host: str = SMTP_HOST, port: int = SMTP_PORT, timeout: float = 10.0):
        self._host    = host
        self._port    = port
        self._timeout = timeout
        self._smtp: smtplib.SMTP | None = None
        self.connect()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def connect(self):
        try:
            self._smtp = smtplib.SMTP(self._host, self._port, timeout=self._timeout)
            self._smtp.ehlo("smoke-test-client")
            _log(f"connected to {self._host}:{self._port}")
        except Exception as exc:
            _err(f"connect to {self._host}:{self._port} failed: {exc}")
            raise SenderError(f"cannot connect to local SMTP on {self._host}:{self._port}: {exc}") from exc

    def disconnect(self):
        if self._smtp:
            try:
                self._smtp.quit()
            except Exception:
                pass
            self._smtp = None
            _log("disconnected")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.disconnect()

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------
    def send(self, msg_dict: dict) -> dict:
        """
        Send an email described by msg_dict (see templates.py for format).

        msg_dict keys:
            from_addr   str      sender address
            to_addrs    [str]    recipient list
            subject     str
            body_text   str      plain-text body (optional)
            body_html   str      HTML body (optional)
            headers     dict     extra headers e.g. {"Reply-To": "x@y"}
            attachments [{name, data, mime_type}]   optional

        Returns a dict:
            {"ok": True,  "from": ..., "to": ..., "subject": ...}
            {"ok": False, "error": "...", "traceback": "..."}
        """
        if self._smtp is None:
            raise SenderError("not connected -- call connect() first")

        try:
            mime = self._build_mime(msg_dict)
            from_addr = msg_dict["from_addr"]
            to_addrs  = msg_dict["to_addrs"]

            refused = self._smtp.sendmail(from_addr, to_addrs, mime.as_string())
            if refused:
                _err(f"some recipients refused: {refused}")

            _log(f"sent  from={from_addr!r}  to={to_addrs}  subject={msg_dict.get('subject','')!r}")
            return {
                "ok":      True,
                "from":    from_addr,
                "to":      to_addrs,
                "subject": msg_dict.get("subject", ""),
                "refused": refused,
            }

        except smtplib.SMTPServerDisconnected:
            # server closed connection between sends -- reconnect once and retry
            _err("server disconnected mid-session, reconnecting")
            try:
                self.connect()
                mime = self._build_mime(msg_dict)
                self._smtp.sendmail(msg_dict["from_addr"], msg_dict["to_addrs"], mime.as_string())
                _log("retry send succeeded")
                return {"ok": True, "from": msg_dict["from_addr"], "to": msg_dict["to_addrs"],
                        "subject": msg_dict.get("subject", ""), "refused": {}}
            except Exception as exc2:
                tb = traceback.format_exc()
                _err(f"retry send also failed: {exc2}\n{tb[:300]}")
                return {"ok": False, "error": str(exc2), "traceback": tb}

        except Exception as exc:
            tb = traceback.format_exc()
            _err(f"send failed: {exc}\n{tb[:300]}")
            return {"ok": False, "error": str(exc), "traceback": tb}

    # ------------------------------------------------------------------
    # MIME builder
    # ------------------------------------------------------------------
    @staticmethod
    def _build_mime(msg_dict: dict) -> MIMEMultipart:
        body_text  = msg_dict.get("body_text", "")
        body_html  = msg_dict.get("body_html", "")
        attachments = msg_dict.get("attachments", [])

        # choose top-level structure
        if attachments:
            outer = MIMEMultipart("mixed")
        elif body_html:
            outer = MIMEMultipart("alternative")
        else:
            outer = MIMEMultipart("mixed")

        # set headers
        outer["From"]    = msg_dict["from_addr"]
        outer["To"]      = ", ".join(msg_dict["to_addrs"])
        outer["Subject"] = msg_dict.get("subject", "(no subject)")

        for k, v in msg_dict.get("headers", {}).items():
            outer[k] = v

        # bodies
        if body_text:
            outer.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            outer.attach(MIMEText(body_html, "html", "utf-8"))
        if not body_text and not body_html:
            outer.attach(MIMEText("(empty message body)", "plain", "utf-8"))

        # attachments
        for att in attachments:
            try:
                name      = att.get("name", "attachment.bin")
                data      = att.get("data", b"")
                mime_type = att.get("mime_type", "application/octet-stream")
                main, sub = mime_type.split("/", 1) if "/" in mime_type else ("application", "octet-stream")
                part = MIMEBase(main, sub)
                if isinstance(data, str):
                    data = data.encode("utf-8")
                part.set_payload(data)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=name)
                outer.attach(part)
            except Exception as exc:
                _err(f"could not attach {att.get('name')!r}: {exc}")

        return outer


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _log(msg: str):
    print(f"[sender] {msg}", file=sys.stderr, flush=True)

def _err(msg: str):
    print(f"[sender] ERROR {msg}", file=sys.stderr, flush=True)
