"""
inbox.py
Shared in-memory mailbox.

The SMTP capture server writes here via Inbox.store().
The HTTP API and run_smoke.py read via Inbox.list() and Inbox.get().

All operations are thread-safe.  No external dependencies.

Messages are stored as plain dicts:
    {
        "id":          int      -- auto-incrementing message id
        "from_addr":   str      -- MAIL FROM envelope address
        "to_addrs":    [str]    -- RCPT TO envelope addresses
        "raw":         str      -- full raw DATA payload (headers + body)
        "subject":     str      -- parsed Subject header (empty if missing)
        "received_at": str      -- ISO-8601 timestamp (UTC)
        "size":        int      -- byte length of raw
    }
"""

# Deferred annotation evaluation -- prevents the class-level `list` method
# from shadowing the built-in in annotation expressions.
from __future__ import annotations

import threading
import datetime
import email as _email_lib
import sys


class Inbox:
    def __init__(self):
        self._lock    = threading.Lock()
        self._msgs:   list[dict] = []
        self._counter = 0

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    def store(self, from_addr: str, to_addrs: list, raw: str) -> int:
        """
        Store one captured incoming message.
        Returns the assigned message id.
        """
        subject = ""
        try:
            parsed  = _email_lib.message_from_string(raw)
            subject = parsed.get("Subject", "") or ""
        except Exception as exc:
            _warn(f"inbox.store: could not parse headers: {exc}")

        now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        with self._lock:
            self._counter += 1
            msg_id = self._counter
            entry = {
                "id":          msg_id,
                "from_addr":   from_addr,
                "to_addrs":    list(to_addrs),
                "raw":         raw,
                "subject":     subject,
                "received_at": now,
                "size":        len(raw.encode("utf-8", errors="replace")),
            }
            self._msgs.append(entry)

        _log(f"stored msg id={msg_id} from={from_addr!r} subject={subject!r} size={entry['size']}b")
        return msg_id

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    def count(self) -> int:
        with self._lock:
            return len(self._msgs)

    def list(self, limit: int = 100) -> list[dict]:
        """Return summary dicts (no raw body) newest first."""
        with self._lock:
            recent = self._msgs[-limit:][::-1]
        return [
            {k: v for k, v in m.items() if k != "raw"}
            for m in recent
        ]

    def get(self, msg_id: int) -> dict | None:
        """Return full message dict including raw, or None if not found."""
        with self._lock:
            for m in self._msgs:
                if m["id"] == msg_id:
                    return dict(m)
        return None

    def search(self, to_addr: str = "", subject_contains: str = "") -> list[dict]:
        """Filter by envelope recipient and/or subject substring."""
        with self._lock:
            pool = list(self._msgs)
        results = []
        for m in pool:
            if to_addr and to_addr.lower() not in [a.lower() for a in m["to_addrs"]]:
                continue
            if subject_contains and subject_contains.lower() not in m["subject"].lower():
                continue
            results.append({k: v for k, v in m.items() if k != "raw"})
        return results[::-1]

    def clear(self) -> int:
        """Flush all messages. Returns count cleared."""
        with self._lock:
            n = len(self._msgs)
            self._msgs.clear()
            self._counter = 0
        _log(f"inbox cleared ({n} messages removed)")
        return n

    # ------------------------------------------------------------------
    # Convenience: wait for a message matching a predicate
    # ------------------------------------------------------------------
    def wait_for(
        self,
        predicate,
        timeout: float = 10.0,
        poll_interval: float = 0.2,
    ) -> dict | None:
        """
        Block until a message matching predicate(msg_dict) arrives or
        timeout expires.  Returns the matching message dict or None.
        Uses the summary dict (no raw body) for the predicate check.
        """
        import time
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                for m in self._msgs:
                    summary = {k: v for k, v in m.items() if k != "raw"}
                    try:
                        if predicate(summary):
                            return summary
                    except Exception:
                        pass
            time.sleep(poll_interval)
        return None


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------
_inbox = Inbox()

def get_inbox() -> Inbox:
    """Return the shared Inbox singleton."""
    return _inbox


# ------------------------------------------------------------------
# Internal helpers
# ------------------------------------------------------------------
def _log(msg: str):
    print(f"[inbox] {msg}", file=sys.stderr, flush=True)

def _warn(msg: str):
    print(f"[inbox] WARN {msg}", file=sys.stderr, flush=True)
