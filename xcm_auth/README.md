# xcm_auth

xcm_auth is a standalone HTTP authentication service for web apps, sites, and tools in any language.

It exposes JSON endpoints and bearer-token auth over HTTP, so your frontend/backend can be JavaScript, Python, PHP, C#, Go, or anything else that can call REST.

## What It Supports

- User registration/login/logout
- JWT access tokens + refresh tokens
- Optional 2FA by email
- Session/device tracking
- Audit logs and rate limiting
- Admin user management endpoints
- Database backends: sqlite, mysql, postgres

## Run Locally

### Option A: VS Code Launch (recommended)

A launch profile is available in [../../.vscode/launch.json](../../.vscode/launch.json).

Use configuration: xcm_auth: Live Local (SQLite)

It starts on http://127.0.0.1:9100 with local sqlite settings.

### Option B: CLI

```powershell
# From workspace root
Set-Location page-builder/xcm_auth
$env:SERVER_ADDR=":9100"
$env:DB_DRIVER="sqlite"
$env:DB_DSN="./xcm_auth_dev.db"
$env:TWOFA_ENABLED="false"
& "C:\Program Files\Go\bin\go.exe" run ./cmd
```

## Local Email 2FA Smoke

For a full local email-based 2FA check, use the smoke runner in [smoke/README.md](smoke/README.md):

```powershell
Set-Location page-builder/xcm_auth
./smoke/smoke_email_2fa.ps1
```

It starts or reuses the local inbox capture service, runs xcm_auth with SMTP pointed at that inbox, performs login, captures the emailed code, verifies 2FA, and then shuts down any temporary processes it started.

After smoke runs, you can clear runtime state without removing users:

```powershell
./smoke/reset_dev_state.ps1
```

## Database Configuration

Select backend with DB_DRIVER and DB_DSN.

### sqlite

```env
DB_DRIVER=sqlite
DB_DSN=./xcm_auth_dev.db
```

### mysql

```env
DB_DRIVER=mysql
DB_DSN=user:pass@tcp(127.0.0.1:3306)/xcm_auth?parseTime=true&charset=utf8mb4
```

### postgres

```env
DB_DRIVER=postgres
DB_DSN=postgres://user:pass@127.0.0.1:5432/xcm_auth?sslmode=disable
```

## Optional Security Add-on: prompt_inj_guard

xcm_auth can optionally call prompt_inj_guard as a request screening add-on.
It is disabled by default and is not a hard dependency.

Guard service source: [../../dev-tools/agent-flow/prompt_inj_guard/README.md](../../dev-tools/agent-flow/prompt_inj_guard/README.md)

Enable add-on mode via environment:

```env
PROMPT_GUARD_ENABLED=true
PROMPT_GUARD_URL=http://127.0.0.1:8765
PROMPT_GUARD_MODE=monitor
PROMPT_GUARD_FAIL_OPEN=true
PROMPT_GUARD_TIMEOUT_MS=1200
PROMPT_GUARD_BLOCK_THRESHOLD=0.90
PROMPT_GUARD_ENDPOINTS=register,login,forgot-password,reset-password,admin-create-user
```

Modes:

- monitor: classify and log flagged input, never blocks requests.
- block: block flagged requests when confidence is >= PROMPT_GUARD_BLOCK_THRESHOLD.

If PROMPT_GUARD_FAIL_OPEN=true and the add-on is unreachable, requests continue.
If PROMPT_GUARD_FAIL_OPEN=false and the add-on is unreachable, guarded endpoints return 503.

Strict profile for production hardening:

```env
SECURITY_PROFILE=strict
PROMPT_GUARD_ENABLED=true
PROMPT_GUARD_URL=http://127.0.0.1:8765
```

`SECURITY_PROFILE=strict` enforces:

- `REQUIRE_HTTPS=true`
- `PROMPT_GUARD_FAIL_OPEN=false`
- `PROMPT_GUARD_STARTUP_HEALTHCHECK=true` (server startup is gated on guard health)

## Core Endpoints

- GET /health
- POST /auth/register
- POST /auth/login
- POST /auth/verify-2fa
- POST /auth/refresh
- POST /auth/logout
- GET /user/me
- GET /user/sessions
- GET /user/devices
- GET /user/audit
- GET /admin/users

## Client Integration Example

### JavaScript

```javascript
const login = await fetch("http://127.0.0.1:9100/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: "you@example.com", password: "your-password" })
});
const data = await login.json();
```

### Python

```python
import requests

r = requests.post(
    "http://127.0.0.1:9100/auth/login",
    json={"identifier": "you@example.com", "password": "your-password"},
    timeout=10,
)
print(r.json())
```

### PHP

```php
<?php
$ch = curl_init("http://127.0.0.1:9100/auth/login");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
    CURLOPT_POSTFIELDS => json_encode([
        "identifier" => "you@example.com",
        "password" => "your-password"
    ]),
    CURLOPT_RETURNTRANSFER => true,
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;
```

### C#

```csharp
using System.Net.Http;
using System.Text;

var client = new HttpClient();
var body = new StringContent("{\"identifier\":\"you@example.com\",\"password\":\"your-password\"}", Encoding.UTF8, "application/json");
var res = await client.PostAsync("http://127.0.0.1:9100/auth/login", body);
var json = await res.Content.ReadAsStringAsync();
Console.WriteLine(json);
```
