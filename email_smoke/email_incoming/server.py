"""
server.py
Minimal local SMTP capture server.

Listens on localhost:SMTP_PORT (default 1025).
Accepts connections, speaks a just-enough subset of SMTP, and
writes every received message to the shared Inbox singleton.

No external dependencies -- pure Python stdlib (socket + threading).

Supported commands: EHLO, HELO, MAIL FROM, RCPT TO, DATA, RSET, NOOP, QUIT
Unsupported features (and gracefully refused): AUTH, STARTTLS, VRFY, EXPN
SIZE / 8BITMIME / SMTPUTF8 are advertised in EHLO to avoid fussiness from
Python's smtplib but not enforced.
"""

import socket
import select
import threading
import sys
import re
import traceback

from .inbox import get_inbox

SMTP_PORT    = 1025
SMTP_HOST    = "127.0.0.1"
SMTP_BANNER  = "local-smoke-smtp"
MAX_MSG_SIZE = 4 * 1024 * 1024   # 4 MB hard limit

# regex for MAIL FROM:<addr> and RCPT TO:<addr>
_ADDR_RE = re.compile(r"<([^>]*)>")


def _addr(line: str) -> str:
    """Extract address from MAIL FROM:<x> or RCPT TO:<x>."""
    m = _ADDR_RE.search(line)
    if m:
        return m.group(1).strip()
    # fallback: take everything after the colon
    parts = line.split(":", 1)
    if len(parts) == 2:
        return parts[1].strip().strip("<>")
    return line.strip()


class _SMTPSession(threading.Thread):
    """
    One thread per accepted TCP connection.
    Implements the SMTP state machine.
    """

    def __init__(self, conn: socket.socket, addr: tuple):
        super().__init__(daemon=True)
        self._conn   = conn
        self._addr   = addr
        self._inbox  = get_inbox()
        # conversation state
        self._from:  str        = ""
        self._to:    list[str]  = []
        self._data:  str        = ""

    # ------------------------------------------------------------------
    def run(self):
        try:
            self._serve()
        except Exception as exc:
            _err(f"session {self._addr}: unhandled error: {exc}")
            _err(traceback.format_exc()[:400])
        finally:
            try:
                self._conn.close()
            except Exception:
                pass

    def _serve(self):
        f = self._conn.makefile("r", encoding="utf-8", errors="replace")
        # makefile() default uses universal newlines; \r\n is normalized to \n
        self._send("220 localhost ESMTP " + SMTP_BANNER + " ready")

        while True:
            try:
                line = f.readline()
            except Exception as exc:
                _err(f"session {self._addr}: readline error: {exc}")
                return
            if not line:
                _log(f"session {self._addr}: connection closed by client")
                return

            line = line.rstrip("\r\n")
            _log(f"session {self._addr} <<  {line[:120]}")

            upper = line.upper().strip()

            if upper.startswith("EHLO") or upper.startswith("HELO"):
                self._reset_envelope()
                self._send("250-localhost greets you")
                self._send("250-8BITMIME")
                self._send("250-SMTPUTF8")
                self._send(f"250-SIZE {MAX_MSG_SIZE}")
                self._send("250 OK")

            elif upper.startswith("MAIL FROM"):
                self._reset_envelope()
                self._from = _addr(line)
                self._send("250 OK")

            elif upper.startswith("RCPT TO"):
                if not self._from:
                    self._send("503 Need MAIL FROM first")
                else:
                    self._to.append(_addr(line))
                    self._send("250 OK")

            elif upper.startswith("DATA"):
                if not self._from or not self._to:
                    self._send("503 Need MAIL FROM and RCPT TO first")
                    continue
                self._send("354 End data with <CR><LF>.<CR><LF>")
                raw_lines = []
                total_bytes = 0
                overflow = False
                while True:
                    try:
                        dl = f.readline()
                    except Exception as exc:
                        _err(f"session {self._addr}: DATA readline: {exc}")
                        return
                    if not dl:
                        _err(f"session {self._addr}: connection dropped during DATA")
                        return
                    # dot-unstuff: if line starts with "..", strip one dot
                    if dl.rstrip("\r\n") == ".":
                        # end of DATA
                        if overflow:
                            self._send("552 Message too large")
                            self._reset_envelope()
                        else:
                            raw = "\n".join(raw_lines)
                            msg_id = self._inbox.store(self._from, self._to, raw)
                            self._send(f"250 OK message id={msg_id} queued")
                            self._reset_envelope()
                        break
                    if dl.startswith(".."):
                        dl = dl[1:]
                    raw_lines.append(dl.rstrip("\r\n"))
                    total_bytes += len(dl)
                    if total_bytes > MAX_MSG_SIZE and not overflow:
                        _err(f"session {self._addr}: message too large ({total_bytes} bytes), discarding body")
                        overflow = True
                        raw_lines.clear()   # drop what we have; keep reading to drain

            elif upper.startswith("RSET"):
                self._reset_envelope()
                self._send("250 OK")

            elif upper.startswith("NOOP"):
                self._send("250 OK")

            elif upper.startswith("QUIT"):
                self._send("221 Bye")
                return

            elif upper.startswith("AUTH") or upper.startswith("STARTTLS"):
                self._send("502 Not implemented in smoke mode")

            else:
                self._send("500 Unrecognized command")

    def _send(self, text: str):
        _log(f"session {self._addr} >>  {text[:120]}")
        try:
            self._conn.sendall((text + "\r\n").encode("utf-8", errors="replace"))
        except Exception as exc:
            _err(f"session {self._addr}: send error: {exc}")

    def _reset_envelope(self):
        self._from = ""
        self._to   = []
        self._data = ""


# ------------------------------------------------------------------
# Server lifecycle
# ------------------------------------------------------------------
class SMTPServer:
    """
    Threaded SMTP capture server.

    Usage:
        srv = SMTPServer()
        srv.start()          # non-blocking, returns immediately
        ...
        srv.stop()
    """

    def __init__(self, host: str = SMTP_HOST, port: int = SMTP_PORT):
        self._host    = host
        self._port    = port
        self._sock:   socket.socket | None = None
        self._thread: threading.Thread     | None = None
        self._stop    = threading.Event()

    def start(self):
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._sock.bind((self._host, self._port))
            self._sock.listen(16)
            # NOTE: do NOT set a timeout on the listening socket.
            # On macOS/BSD, accepted sockets inherit the listening socket's timeout,
            # which would cause session readline() calls to time out.
            # Use select() in the accept loop instead to poll the stop flag.
            _log(f"SMTP server listening on {self._host}:{self._port}")
        except OSError as exc:
            _err(f"SMTPServer.start: bind to {self._host}:{self._port} failed: {exc}")
            raise

        self._thread = threading.Thread(target=self._accept_loop, daemon=True, name="smtp-server")
        self._thread.start()

    def stop(self, timeout: float = 3.0):
        self._stop.set()
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
        if self._thread:
            self._thread.join(timeout=timeout)
        _log("SMTP server stopped")

    @property
    def port(self) -> int:
        return self._port

    def _accept_loop(self):
        while not self._stop.is_set():
            # Use select() with a 1 s timeout so we can poll stop_event
            # without setting any timeout on the listening socket itself.
            try:
                ready, _, _ = select.select([self._sock], [], [], 1.0)
            except OSError:
                break
            if not ready:
                continue
            try:
                conn, addr = self._sock.accept()
            except OSError:
                break
            conn.setblocking(True)   # ensure fully blocking regardless of platform
            _log(f"new connection from {addr}")
            _SMTPSession(conn, addr).start()


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _log(msg: str):
    print(f"[smtp-server] {msg}", file=sys.stderr, flush=True)

def _err(msg: str):
    print(f"[smtp-server] ERROR {msg}", file=sys.stderr, flush=True)
