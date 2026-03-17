package db

import "fmt"

func schemaForDialect(dialect string) string {
	switch dialect {
	case "sqlite", "sqlite3", "":
		return sqliteSchema
	case "mysql":
		return mysqlSchema
	case "postgres":
		return postgresSchema
	default:
		panic(fmt.Sprintf("unsupported dialect: %s", dialect))
	}
}

const mysqlSchema = `
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    last_login_at VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z'
);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    refresh_token_hash VARCHAR(191) NOT NULL UNIQUE,
    device_id BIGINT NOT NULL DEFAULT 0,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    expires_at VARCHAR(32) NOT NULL,
    last_used_at VARCHAR(32) NOT NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    revoked_reason TEXT NOT NULL,
    INDEX idx_sessions_user_id (user_id),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    fingerprint VARCHAR(191) NOT NULL,
    user_agent TEXT NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    name VARCHAR(191) NOT NULL DEFAULT '',
    trusted TINYINT(1) NOT NULL DEFAULT 0,
    first_seen_at VARCHAR(32) NOT NULL,
    last_seen_at VARCHAR(32) NOT NULL,
    UNIQUE KEY idx_devices_user_fp (user_id, fingerprint),
    INDEX idx_devices_user_id (user_id),
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS twofa_codes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    code_hash VARCHAR(191) NOT NULL,
    purpose VARCHAR(32) NOT NULL DEFAULT 'login',
    expires_at VARCHAR(32) NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL,
    INDEX idx_twofa_user_purpose (user_id, purpose, used),
    CONSTRAINT fk_twofa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ip_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL UNIQUE,
    request_count INT NOT NULL DEFAULT 0,
    blocked TINYINT(1) NOT NULL DEFAULT 0,
    blocked_reason TEXT NOT NULL,
    blocked_until VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z',
    first_seen_at VARCHAR(32) NOT NULL,
    last_seen_at VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    key_field VARCHAR(191) NOT NULL,
    action VARCHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    window_start VARCHAR(32) NOT NULL,
    blocked_until VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z',
    UNIQUE KEY idx_rate_limits_key_action (key_field, action)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL DEFAULT 0,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    action VARCHAR(128) NOT NULL,
    detail TEXT NOT NULL,
    success TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL,
    INDEX idx_audit_user_id (user_id),
    INDEX idx_audit_ip (ip_address),
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
);
`

const postgresSchema = `
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(191) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    last_login_at VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z'
);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(191) NOT NULL UNIQUE,
    device_id BIGINT NOT NULL DEFAULT 0,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    expires_at VARCHAR(32) NOT NULL,
    last_used_at VARCHAR(32) NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    revoked_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS devices (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint VARCHAR(191) NOT NULL,
    user_agent TEXT NOT NULL,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    name VARCHAR(191) NOT NULL DEFAULT '',
    trusted INTEGER NOT NULL DEFAULT 0,
    first_seen_at VARCHAR(32) NOT NULL,
    last_seen_at VARCHAR(32) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_fp ON devices(user_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS twofa_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(191) NOT NULL,
    purpose VARCHAR(32) NOT NULL DEFAULT 'login',
    expires_at VARCHAR(32) NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_twofa_user_purpose ON twofa_codes(user_id, purpose, used);

CREATE TABLE IF NOT EXISTS ip_records (
    id BIGSERIAL PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL UNIQUE,
    request_count INTEGER NOT NULL DEFAULT 0,
    blocked INTEGER NOT NULL DEFAULT 0,
    blocked_reason TEXT NOT NULL DEFAULT '',
    blocked_until VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z',
    first_seen_at VARCHAR(32) NOT NULL,
    last_seen_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ip_records_ip ON ip_records(ip_address);

CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGSERIAL PRIMARY KEY,
    key_field VARCHAR(191) NOT NULL,
    action VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start VARCHAR(32) NOT NULL,
    blocked_until VARCHAR(32) NOT NULL DEFAULT '0001-01-01T00:00:00Z'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_key_action ON rate_limits(key_field, action);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL DEFAULT 0,
    ip_address VARCHAR(64) NOT NULL DEFAULT '',
    action VARCHAR(128) NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    success INTEGER NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`
