"""
templates.py
Factory functions that return msg_dict objects ready for Sender.send().

Each function returns a plain dict with these keys:
    from_addr   str
    to_addrs    [str]
    subject     str
    body_text   str      (optional)
    body_html   str      (optional)
    headers     dict     (optional)
    attachments [dict]   (optional, each: {name, data, mime_type})

Nothing is sent here -- these are just data builders.
"""

import datetime


_DOMAIN_FROM = "sender@smoke.local"
_DOMAIN_TO   = "inbox@smoke.local"


# ------------------------------------------------------------------
# 1. Plain text
# ------------------------------------------------------------------
def plain_text(
    subject: str = "Smoke Test -- plain text",
    body:    str = "",
    to:      str = _DOMAIN_TO,
    frm:     str = _DOMAIN_FROM,
) -> dict:
    """Simplest possible email: one recipient, plain text only."""
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   subject,
        "body_text": body or f"Hello from smoke test at {_now()}.",
    }


# ------------------------------------------------------------------
# 2. HTML email
# ------------------------------------------------------------------
def html_email(
    subject: str = "Smoke Test -- HTML email",
    to:      str = _DOMAIN_TO,
    frm:     str = _DOMAIN_FROM,
) -> dict:
    """Email with both a plain-text fallback and an HTML part."""
    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{subject}</title></head>
<body>
  <h1 style="color:#2a6496;">Smoke Test</h1>
  <p>This is the <strong>HTML</strong> part of a smoke-test email.</p>
  <p>Sent at: <code>{_now()}</code></p>
</body>
</html>"""
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   subject,
        "body_text": f"Smoke Test\nThis is the plain-text fallback.\nSent: {_now()}",
        "body_html": html,
    }


# ------------------------------------------------------------------
# 3. Multi-recipient
# ------------------------------------------------------------------
def multi_recipient(
    to_list: list[str] | None = None,
    frm:     str = _DOMAIN_FROM,
) -> dict:
    if to_list is None:
        to_list = ["alice@smoke.local", "bob@smoke.local", "carol@smoke.local"]
    return {
        "from_addr": frm,
        "to_addrs":  to_list,
        "subject":   f"Smoke Test -- multi-recipient ({len(to_list)} recipients)",
        "body_text": (
            f"This message was sent to {len(to_list)} recipients.\n"
            f"Sent: {_now()}"
        ),
    }


# ------------------------------------------------------------------
# 4. Extra headers (Reply-To, CC, X-Custom)
# ------------------------------------------------------------------
def extra_headers(
    to:  str = _DOMAIN_TO,
    frm: str = _DOMAIN_FROM,
) -> dict:
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   "Smoke Test -- extra headers",
        "body_text": "This email has Reply-To and X-Smoke-Tag headers.\n",
        "headers": {
            "Reply-To":     "reply@smoke.local",
            "X-Smoke-Tag":  "extra-headers-test",
            "X-Priority":   "3",
        },
    }


# ------------------------------------------------------------------
# 5. UTF-8 / international content
# ------------------------------------------------------------------
def utf8_content(
    to:  str = _DOMAIN_TO,
    frm: str = _DOMAIN_FROM,
) -> dict:
    body = (
        "UTF-8 smoke test\n"
        "English: Hello World\n"
        "Spanish: Hola Mundo\n"
        "Chinese: \u4f60\u597d\u4e16\u754c\n"
        "Arabic: \u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0627\u0644\u0639\u0627\u0644\u0645\n"
        "Emoji (text): :rocket: ship it\n"
        f"Sent: {_now()}\n"
    )
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   "Smoke Test -- UTF-8 \u00e9\u00e0\u00fc",
        "body_text": body,
    }


# ------------------------------------------------------------------
# 6. Attachment
# ------------------------------------------------------------------
def with_attachment(
    to:  str = _DOMAIN_TO,
    frm: str = _DOMAIN_FROM,
) -> dict:
    csv_data = "id,name,value\n1,alpha,100\n2,beta,200\n3,gamma,300\n"
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   "Smoke Test -- CSV attachment",
        "body_text": "Please find the attached CSV file.\n",
        "attachments": [
            {
                "name":      "smoke_data.csv",
                "data":      csv_data.encode("utf-8"),
                "mime_type": "text/csv",
            }
        ],
    }


# ------------------------------------------------------------------
# 7. Large body (stress / size check)
# ------------------------------------------------------------------
def large_body(
    size_kb: int = 64,
    to:      str = _DOMAIN_TO,
    frm:     str = _DOMAIN_FROM,
) -> dict:
    line  = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789\n"
    reps  = max(1, (size_kb * 1024) // len(line))
    body  = line * reps
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   f"Smoke Test -- large body ({size_kb} KB)",
        "body_text": body,
    }


# ------------------------------------------------------------------
# 8. Auto-responder simulation (sender = system, reply-to varies)
# ------------------------------------------------------------------
def auto_responder(
    to:  str = _DOMAIN_TO,
    frm: str = "noreply@smoke.local",
) -> dict:
    html = f"""\
<!DOCTYPE html>
<html lang="en">
<body style="font-family:sans-serif;color:#333;">
  <p>Hi,</p>
  <p>This is an automated message. Please do not reply.</p>
  <p>Reference: SMOKE-{_now().replace(':', '').replace('-', '').replace('T', '-').replace('Z', '')}</p>
  <p>If you did not request this, please ignore it.</p>
  <hr>
  <small style="color:#999;">Sent by smoke-test system</small>
</body>
</html>"""
    return {
        "from_addr": frm,
        "to_addrs":  [to],
        "subject":   "Auto: Smoke Test confirmation",
        "body_text": "This is an automated message. Please do not reply.",
        "body_html": html,
        "headers": {
            "X-Auto-Response-Suppress": "OOF, DR, RN, NRN",
            "Precedence":               "bulk",
        },
    }


# ------------------------------------------------------------------
# Convenience: all templates as a list of (name, factory_fn)
# ------------------------------------------------------------------
ALL_TEMPLATES = [
    ("plain_text",      plain_text),
    ("html_email",      html_email),
    ("multi_recipient", multi_recipient),
    ("extra_headers",   extra_headers),
    ("utf8_content",    utf8_content),
    ("with_attachment", with_attachment),
    ("large_body",      large_body),
    ("auto_responder",  auto_responder),
]


def _now() -> str:
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
