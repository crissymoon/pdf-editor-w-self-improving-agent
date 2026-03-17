#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict


def b32_decode(secret: str) -> bytes:
    clean = ''.join(secret.strip().upper().split())
    pad_len = (-len(clean)) % 8
    clean += '=' * pad_len
    return base64.b32decode(clean, casefold=True)


def totp(secret: str, period: int, digits: int, algorithm: str, at_time: float | None = None) -> str:
    current = at_time if at_time is not None else time.time()
    counter = int(current // period)
    key = b32_decode(secret)
    msg = counter.to_bytes(8, 'big')

    algo = algorithm.lower()
    if algo not in ('sha1', 'sha256', 'sha512'):
        algo = 'sha1'

    digest = hmac.new(key, msg, getattr(hashlib, algo)).digest()
    offset = digest[-1] & 0x0F
    dbc = ((digest[offset] & 0x7F) << 24) | ((digest[offset + 1] & 0xFF) << 16) | ((digest[offset + 2] & 0xFF) << 8) | (digest[offset + 3] & 0xFF)
    return str(dbc % (10 ** digits)).zfill(digits)


def verify_totp(secret: str, code: str, period: int, digits: int, algorithm: str, skew_steps: int = 1) -> bool:
    candidate = ''.join(ch for ch in code if ch.isdigit())
    if len(candidate) != digits:
        return False

    now = time.time()
    for step in range(-skew_steps, skew_steps + 1):
        if totp(secret, period, digits, algorithm, now + (step * period)) == candidate:
            return True
    return False


class BridgeState:
    def __init__(self, auth_url: str, creds: Dict[str, Any], secret: str, issuer: str, label: str, period: int, digits: int, algorithm: str, page_path: Path):
        self.auth_url = auth_url.rstrip('/')
        self.creds = creds
        self.secret = secret
        self.issuer = issuer
        self.label = label
        self.period = period
        self.digits = digits
        self.algorithm = algorithm
        self.page_path = page_path
        self.sessions: Dict[str, Dict[str, Any]] = {}

    @property
    def otpauth_uri(self) -> str:
        import urllib.parse

        account = urllib.parse.quote(f"{self.issuer}:{self.label}")
        q = urllib.parse.urlencode(
            {
                'secret': self.secret,
                'issuer': self.issuer,
                'algorithm': self.algorithm,
                'digits': str(self.digits),
                'period': str(self.period),
            }
        )
        return f"otpauth://totp/{account}?{q}"


class Handler(BaseHTTPRequestHandler):
    state: BridgeState = None  # type: ignore[assignment]

    def _json(self, status: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(raw)

    def _html(self, status: int, html: str) -> None:
        raw = html.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0:
            return {}
        body = self.rfile.read(length)
        if not body:
            return {}
        return json.loads(body.decode('utf-8'))

    def _forward_login(self, identifier: str, password: str) -> Dict[str, Any]:
        payload = json.dumps({'identifier': identifier, 'password': password}).encode('utf-8')
        req = urllib.request.Request(
            url=f"{self.state.auth_url}/auth/login",
            data=payload,
            method='POST',
            headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read().decode('utf-8')
                return {'status': resp.status, 'json': json.loads(data)}
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8') if e.fp else '{}'
            parsed = {}
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = {'message': body or str(e)}
            return {'status': e.code, 'json': parsed}
        except Exception as e:
            return {'status': 0, 'json': {'ok': False, 'message': str(e)}}

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ('/', '/index.html'):
            self._html(200, self.state.page_path.read_text(encoding='utf-8'))
            return

        if self.path == '/health':
            self._json(200, {'ok': True, 'data': {'status': 'ok'}})
            return

        if self.path == '/api/bootstrap':
            self._json(
                200,
                {
                    'ok': True,
                    'data': {
                        'auth_url': self.state.auth_url,
                        'identifier': self.state.creds.get('email') or self.state.creds.get('username') or '',
                        'issuer': self.state.issuer,
                        'label': self.state.label,
                        'secret': self.state.secret,
                        'algorithm': self.state.algorithm,
                        'digits': self.state.digits,
                        'period': self.state.period,
                        'otpauth_uri': self.state.otpauth_uri,
                    },
                },
            )
            return

        self._json(404, {'ok': False, 'message': 'not found'})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == '/api/login':
            body = self._read_json()
            identifier = str(body.get('identifier') or '').strip()
            password = str(body.get('password') or '')

            if not identifier or not password:
                self._json(400, {'ok': False, 'message': 'identifier and password are required'})
                return

            result = self._forward_login(identifier, password)
            status = int(result.get('status', 0))
            payload = result.get('json', {})

            if status != 200 or not payload.get('ok'):
                self._json(401, {'ok': False, 'message': payload.get('message') or 'first-factor login failed', 'upstream': payload})
                return

            upstream_data = payload.get('data') or {}
            if upstream_data.get('twofa_required'):
                self._json(400, {'ok': False, 'message': 'xcm_auth returned twofa_required=true. Run auth server with TWOFA_ENABLED=false for app login flow.'})
                return

            session_id = secrets.token_urlsafe(18)
            self.state.sessions[session_id] = {
                'identifier': identifier,
                'first_factor_ok': True,
                'created_at': time.time(),
                'upstream': upstream_data,
            }
            self._json(200, {'ok': True, 'data': {'session_id': session_id, 'user': upstream_data.get('user')}})
            return

        if self.path == '/api/verify-code':
            body = self._read_json()
            session_id = str(body.get('session_id') or '').strip()
            code = str(body.get('code') or '').strip()

            if not session_id or not code:
                self._json(400, {'ok': False, 'message': 'session_id and code are required'})
                return

            session = self.state.sessions.get(session_id)
            if not session or not session.get('first_factor_ok'):
                self._json(401, {'ok': False, 'message': 'invalid session. login first.'})
                return

            if not verify_totp(self.state.secret, code, self.state.period, self.state.digits, self.state.algorithm):
                self._json(401, {'ok': False, 'message': 'invalid TOTP code'})
                return

            self._json(200, {'ok': True, 'data': {'access_granted': True, 'message': 'Second factor accepted. Page access granted.'}})
            return

        self._json(404, {'ok': False, 'message': 'not found'})


def main() -> None:
    parser = argparse.ArgumentParser(description='Bridge server: xcm_auth login + app TOTP verification')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=9400)
    parser.add_argument('--auth-url', default='http://127.0.0.1:9100')
    parser.add_argument('--credentials', default=str(Path(__file__).resolve().parent.parent / 'dev-credentials.json'))
    parser.add_argument('--secret', default='JBSWY3DPEHPK3PXP')
    parser.add_argument('--issuer', default='XcaliburMoon Test Site')
    parser.add_argument('--label', default='Crissy Login')
    parser.add_argument('--period', type=int, default=30)
    parser.add_argument('--digits', type=int, default=6)
    parser.add_argument('--algorithm', default='SHA1')
    args = parser.parse_args()

    creds_path = Path(args.credentials).resolve()
    page_path = Path(__file__).resolve().parent / 'login_2fa_test.html'

    creds: Dict[str, Any] = {}
    if creds_path.exists():
        creds = json.loads(creds_path.read_text(encoding='utf-8'))

    state = BridgeState(
        auth_url=args.auth_url,
        creds=creds,
        secret=args.secret,
        issuer=args.issuer,
        label=args.label,
        period=args.period,
        digits=args.digits,
        algorithm=args.algorithm,
        page_path=page_path,
    )

    Handler.state = state
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[totp-bridge] listening on http://{args.host}:{args.port}")
    print(f"[totp-bridge] xcm_auth upstream: {state.auth_url}")
    print(f"[totp-bridge] otpauth URI: {state.otpauth_uri}")
    server.serve_forever()


if __name__ == '__main__':
    main()
