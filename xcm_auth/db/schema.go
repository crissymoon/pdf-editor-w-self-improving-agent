package db

// sqliteSchema contains all CREATE TABLE statements for the SQLite backend.
// Each table uses IF NOT EXISTS so Migrate() is safe to call on every startup.
// Column types follow SQLite conventions; the same logical schema translates
// directly to MySQL / Postgres with minor type substitutions (see comments).
const sqliteSchema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ── users ────────────────────────────────────────────────────────────────────
-- MySQL equiv: INT AUTO_INCREMENT, VARCHAR, TINYINT(1), DATETIME
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_verified   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_login_at TEXT    NOT NULL DEFAULT '0001-01-01T00:00:00Z'
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── sessions ─────────────────────────────────────────────────────────────────
-- Stores refresh token hashes (sha256). Access tokens are stateless JWT.
CREATE TABLE IF NOT EXISTS sessions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash  TEXT    NOT NULL UNIQUE,
    device_id           INTEGER NOT NULL DEFAULT 0,
    ip_address          TEXT    NOT NULL DEFAULT '',
    user_agent          TEXT    NOT NULL DEFAULT '',
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    expires_at          TEXT    NOT NULL,
    last_used_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    revoked             INTEGER NOT NULL DEFAULT 0,
    revoked_reason      TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(refresh_token_hash);

-- ── devices ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint  TEXT    NOT NULL,
    user_agent   TEXT    NOT NULL DEFAULT '',
    ip_address   TEXT    NOT NULL DEFAULT '',
    name         TEXT    NOT NULL DEFAULT '',
    trusted      INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_seen_at  TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_fp ON devices(user_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_user_id        ON devices(user_id);

-- ── twofa_codes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS twofa_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT    NOT NULL,
    purpose    TEXT    NOT NULL DEFAULT 'login',
    expires_at TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_twofa_user_purpose ON twofa_codes(user_id, purpose, used);

-- ── ip_records ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address     TEXT    NOT NULL UNIQUE,
    request_count  INTEGER NOT NULL DEFAULT 0,
    blocked        INTEGER NOT NULL DEFAULT 0,
    blocked_reason TEXT    NOT NULL DEFAULT '',
    blocked_until  TEXT    NOT NULL DEFAULT '0001-01-01T00:00:00Z',
    first_seen_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_seen_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ip_records_ip ON ip_records(ip_address);

-- ── rate_limits ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    key_field     TEXT    NOT NULL,
    action        TEXT    NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    window_start  TEXT    NOT NULL,
    blocked_until TEXT    NOT NULL DEFAULT '0001-01-01T00:00:00Z'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_key_action ON rate_limits(key_field, action);

-- ── audit_log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT    NOT NULL DEFAULT '',
    action     TEXT    NOT NULL,
    detail     TEXT    NOT NULL DEFAULT '',
    success    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_ip        ON audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at);
`
