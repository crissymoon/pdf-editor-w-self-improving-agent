# xcm_auth -- Separate-Host Migration Plan

Covers what must change in the live-css PHP app and the xcm_auth Go service
when they run on different machines or containers.

---

## Current Architecture

```
[browser]
   |
   | form POST / fetch
   v
[PHP server]  pb_admin/auth.php  <-- single XCMAUTH_BASE_URL constant
   |
   | file_get_contents (HTTP)
   v
[Go server]  xcm_auth :9100  (same machine, same filesystem, `go run ./cmd/main.go`)
   |
   | SQLite read/write
   v
xcm_auth_dev.db  (local file)
```

After migration:

```
[browser]
   |
   v
[PHP server]  (live-css host, e.g. php.yourdomain.com)
   |
   | HTTPS / internal network
   v
[Go server]  (auth host, e.g. auth.yourdomain.com or internal IP:9100)
   |
   v
SQLite or Postgres  (on the auth host only)
```

---

## What Already Works with No Code Change

The proxy pattern is already correct for remote hosting.  These files
require zero edits once the env var and CORS are set:

| File | Why it is already safe |
|---|---|
| `pb_admin/auth.php` | Every call goes through `xcm_request()` which builds the URL from `XCMAUTH_BASE_URL`. Bearer tokens are attached server-side and never reach the browser. |
| `pb_admin/api_proxy.php` (all cases except `db_browser_status`) | Delegates entirely to `xcm_get()` / `xcm_post()` / `xcm_request()`. |
| `pb_admin/config.php` | Already reads `getenv('XCMAUTH_BASE_URL')`. Setting the env var on the PHP host is the only required runtime change. |

---

## Things That Must Change

### 1. pb_admin/config.php -- set the env var on the PHP host

The constant already supports the env var.  On the PHP host set:

```
XCMAUTH_BASE_URL=https://auth.yourdomain.com
```

No code change needed.  The default fallback `http://localhost:9100` only
applies when the env var is absent, so remove that default or leave it for
local dev.

---

### 2. pb_admin/setup.php -- direct SQLite write must become an API call

This is the largest breaking change.  After registration, `setup.php`
promotes the new user to `admin` by opening the SQLite file directly:

```php
$dbPath = __DIR__ . '/../xcm_auth/xcm_auth_dev.db';
$db = new SQLite3($dbPath);
$stmt = $db->prepare('UPDATE users SET role = "admin" WHERE id = :id');
```

When auth is on a separate host, that file is unreachable.

**Fix:** Add a bootstrap endpoint to xcm_auth and call it from `setup.php`
instead of writing to SQLite directly.

Option A (recommended for production): add `POST /admin/promote` protected
by a one-time setup token stored in the xcm_auth env.

Option B (simpler for single-admin dev setups): connect via SSH/exec after
registration and run the SQL remotely.  Not suitable beyond dev.

Option C: remove direct promotion from `setup.php` entirely and show the
manual SQL instruction unconditionally.  The admin runs it once on the auth
host and the app moves on.

The relevant block is around line 56 of `pb_admin/setup.php`:

```php
// Lines that must be replaced or removed:
$dbPath  = __DIR__ . '/../xcm_auth/xcm_auth_dev.db';
// ... SQLite3 open, UPDATE users SET role = "admin"
```

---

### 3. pb_admin/api_proxy.php -- db_browser_status lists a local path

The `db_browser_status` action hardcodes the path to the auth database:

```php
'/Users/mac/Documents/live-css/xcm_auth/xcm_auth_dev.db',
```

When the auth server is remote, that file does not exist on the PHP host.
Remove `xcm_auth_dev.db` from the `$dbScan` array, or replace it with a
call to a new `GET /admin/db-status` endpoint on xcm_auth.

---

### 4. pb_admin/start-auth.sh -- co-located launcher must be split

The script assumes both servers are on the same machine.  For separate
hosting, replace it with two independent launchers:

`start-auth-local.sh` (auth host):
```bash
cd /path/to/xcm_auth
TWOFA_ENABLED=false SERVER_ADDR=:9100 go run ./cmd/main.go
```

`start-php-local.sh` (PHP host):
```bash
XCMAUTH_BASE_URL=https://auth.yourdomain.com php -S 0.0.0.0:8080 -t /path/to/live-css
```

The existing `start-auth.sh` can remain for local single-machine dev.

---

### 5. xcm_auth CORS -- allow the PHP server origin

The Go service currently binds without explicit CORS headers.  When the PHP
server and the auth server are on different origins the browser will not
directly reach xcm_auth (the proxy pattern prevents this), but `/health`
is called directly from `login.php` via `fetch`:

```javascript
fetch('api_proxy.php?action=health')  // proxied -- safe
```

That `health` call goes through the PHP proxy, so no browser-to-auth CORS
issue today.  Verify the entire JS in `login.php` and `dashboard.php` stays
behind `api_proxy.php` and never calls the auth server URL directly.  If it
ever does, CORS headers must be added in `xcm_auth/api/handlers_auth.go` or
middleware.

---

### 6. xcm_auth JWT secret -- must be identical on all hosts

If anything outside xcm_auth ever parses access tokens (e.g. a future PHP
or another Go microservice calling `ParseAccessToken`), the `JWT_SECRET`
env var must match.  Currently only xcm_auth issues and parses tokens, so
this is a heads-up for any future consumers.

Store the secret in a shared secrets manager rather than in `.env` files
checked in to the repo.  The `.env.example` shows the expected keys.

---

### 7. xcm_auth database -- SQLite is fine, but keep it local to the auth host

SQLite works for a single-instance auth server.  It must live on the auth
host only.  Do not mount it over NFS or a shared volume.  If you need more
than one auth instance, replace the SQLite driver with Postgres and update
`xcm_auth/db/sqlite.go` to a `pgx`-backed implementation that satisfies the
`db.Store` interface.  No callers outside `xcm_auth/` reference the store
directly, so that swap is isolated to the `xcm_auth/db/` package.

---

## File Change Summary

| File | Type of change | Priority |
|---|---|---|
| `pb_admin/config.php` | Env var on PHP host only, no code edit | Required |
| `pb_admin/setup.php` | Replace direct SQLite write with API call or manual SQL | Required |
| `pb_admin/api_proxy.php` | Remove xcm_auth_dev.db from db_browser_status scan list | Required |
| `pb_admin/start-auth.sh` | Split into two host-specific scripts | Required for deploy, optional for dev |
| `xcm_auth/cmd/main.go` | Add `POST /admin/promote` bootstrap endpoint (if Option A) | Conditional |
| `xcm_auth/.env` + `.env.example` | Add `SETUP_TOKEN` for bootstrap promotion (if Option A) | Conditional |
| `xcm_auth/api/handlers_auth.go` | Add CORS middleware if browser ever calls auth host directly | Conditional |

---

## Migration Steps (ordered)

1. Deploy xcm_auth to the auth host.  Run `go build ./cmd/main.go` and start
   the binary.  Confirm `GET /health` returns `{"ok":true}`.

2. Set `XCMAUTH_BASE_URL=https://auth.yourdomain.com` on the PHP host.

3. Test `pb_admin/api_proxy.php?action=health` from the PHP host.  This
   verifies the PHP-to-Go HTTP path.

4. Fix `pb_admin/setup.php` (Option A, B, or C above).

5. Remove the xcm_auth db path from `pb_admin/api_proxy.php` db_browser_status.

6. Run the smoke suite against the remote auth server:
   ```
   XCMAUTH_BASE_URL=https://auth.yourdomain.com go test ./smoke/... -race -timeout 90s
   ```
   The integration tests use in-memory SQLite and do not hit the network,
   so they pass regardless of the remote URL.  Write a separate end-to-end
   test (HTTP client against the live server) for full remote verification.

7. Remove or downgrade `start-auth.sh` to a local-dev-only script.  Add a
   note at the top that it is not used in production.
