// Package db provides the SQLite implementation of the Store interface.
// Uses modernc.org/sqlite (pure Go, no CGO required).
// Time values are stored as RFC3339 strings for readability and portability.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"xcaliburmoon.net/xcm_auth/models"

	_ "modernc.org/sqlite"
)

const timeLayout = time.RFC3339

// SQLiteStore implements Store against a SQLite database file.
type SQLiteStore struct {
	db      *rebindDB
	dialect string
}

type placeholderStyle int

const (
	placeholderQuestion placeholderStyle = iota
	placeholderDollar
)

type rebindDB struct {
	raw   *sql.DB
	style placeholderStyle
}

func (r *rebindDB) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return r.raw.ExecContext(ctx, rebindPlaceholders(query, r.style), args...)
}

func (r *rebindDB) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return r.raw.QueryContext(ctx, rebindPlaceholders(query, r.style), args...)
}

func (r *rebindDB) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	return r.raw.QueryRowContext(ctx, rebindPlaceholders(query, r.style), args...)
}

func (r *rebindDB) Close() error {
	return r.raw.Close()
}

func (r *rebindDB) Ping() error {
	return r.raw.Ping()
}

func (r *rebindDB) SetMaxOpenConns(n int) {
	r.raw.SetMaxOpenConns(n)
}

func rebindPlaceholders(query string, style placeholderStyle) string {
	if style != placeholderDollar || !strings.Contains(query, "?") {
		return query
	}
	var b strings.Builder
	b.Grow(len(query) + 8)
	i := 1
	for _, ch := range query {
		if ch == '?' {
			b.WriteString(fmt.Sprintf("$%d", i))
			i++
			continue
		}
		b.WriteRune(ch)
	}
	return b.String()
}

func splitSQLStatements(schema string) []string {
	parts := strings.Split(schema, ";")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		stmt := strings.TrimSpace(p)
		if stmt == "" {
			continue
		}
		out = append(out, stmt)
	}
	return out
}

func placeholderStyleForDialect(dialect string) placeholderStyle {
	if dialect == "postgres" {
		return placeholderDollar
	}
	return placeholderQuestion
}

// OpenSQLite opens (or creates) a SQLite database at the given DSN path and
// returns a fully initialised SQLiteStore. Call Migrate() to create tables.
func OpenSQLite(dsn string) (*SQLiteStore, error) {
	if dsn == "" {
		dsn = "./xcm_auth.db"
	}
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] open %q: %w", dsn, err)
	}
	// SQLite works best with a single writer; allow multiple readers.
	rdb := &rebindDB{raw: sqlDB, style: placeholderStyleForDialect("sqlite")}
	rdb.SetMaxOpenConns(1)
	if err := rdb.Ping(); err != nil {
		return nil, fmt.Errorf("[db/sqlite] ping: %w", err)
	}
	log.Printf("[db/sqlite] opened database at %q", dsn)
	return &SQLiteStore{db: rdb, dialect: "sqlite"}, nil
}

// Close closes the underlying database connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

// Migrate runs all schema creation statements. Safe to call on every startup.
func (s *SQLiteStore) Migrate(ctx context.Context) error {
	schema := schemaForDialect(s.dialect)
	for _, stmt := range splitSQLStatements(schema) {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("[db/%s] migrate: %w", s.dialect, err)
		}
	}
	log.Printf("[db/%s] migration complete", s.dialect)
	return nil
}

// ── time helpers ─────────────────────────────────────────────────────────────

func encodeTime(t time.Time) string {
	if t.IsZero() {
		return "0001-01-01T00:00:00Z"
	}
	return t.UTC().Format(timeLayout)
}

func decodeTime(s string) time.Time {
	if s == "" || s == "0001-01-01T00:00:00Z" {
		return time.Time{}
	}
	t, err := time.Parse(timeLayout, s)
	if err != nil {
		// Try without Z suffix (older rows)
		t2, err2 := time.Parse("2006-01-02T15:04:05", s)
		if err2 != nil {
			log.Printf("[db/sqlite] decodeTime: cannot parse %q: %v", s, err)
			return time.Time{}
		}
		return t2.UTC()
	}
	return t.UTC()
}

// ── Users ─────────────────────────────────────────────────────────────────────

const createUserSQL = `
INSERT INTO users (username, email, password_hash, role, is_active, is_verified, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`

func (s *SQLiteStore) CreateUser(ctx context.Context, u *models.User) (int64, error) {
	now := encodeTime(time.Now().UTC())
	id, err := s.insertID(ctx, createUserSQL,
		u.Username, u.Email, u.PasswordHash, orDefault(u.Role, models.RoleUser),
		boolInt(u.IsActive), boolInt(u.IsVerified), now, now,
	)
	if err != nil {
		return 0, fmt.Errorf("[db/sqlite] CreateUser %q: %w", u.Email, err)
	}
	return id, nil
}

func (s *SQLiteStore) GetUserByID(ctx context.Context, id int64) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id)
	return scanUser(row)
}

func (s *SQLiteStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE email = ?`, email)
	return scanUser(row)
}

func (s *SQLiteStore) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE username = ?`, username)
	return scanUser(row)
}

func (s *SQLiteStore) UpdateUser(ctx context.Context, u *models.User) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET username=?, email=?, role=?, is_active=?, is_verified=?, updated_at=? WHERE id=?`,
		u.Username, u.Email, u.Role, boolInt(u.IsActive), boolInt(u.IsVerified),
		encodeTime(time.Now().UTC()), u.ID,
	)
	return wrapErr("[db/sqlite] UpdateUser", err)
}

func (s *SQLiteStore) UpdateUserPassword(ctx context.Context, userID int64, newHash string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash=?, updated_at=? WHERE id=?`,
		newHash, encodeTime(time.Now().UTC()), userID,
	)
	return wrapErr("[db/sqlite] UpdateUserPassword", err)
}

func (s *SQLiteStore) UpdateUserLastLogin(ctx context.Context, userID int64, at time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET last_login_at=? WHERE id=?`, encodeTime(at), userID,
	)
	return wrapErr("[db/sqlite] UpdateUserLastLogin", err)
}

func (s *SQLiteStore) SetUserActive(ctx context.Context, userID int64, active bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET is_active=?, updated_at=? WHERE id=?`,
		boolInt(active), encodeTime(time.Now().UTC()), userID)
	return wrapErr("[db/sqlite] SetUserActive", err)
}

func (s *SQLiteStore) SetUserVerified(ctx context.Context, userID int64, verified bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE users SET is_verified=?, updated_at=? WHERE id=?`,
		boolInt(verified), encodeTime(time.Now().UTC()), userID)
	return wrapErr("[db/sqlite] SetUserVerified", err)
}

func (s *SQLiteStore) ListUsers(ctx context.Context, limit, offset int) ([]*models.User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+userCols+` FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] ListUsers: %w", err)
	}
	defer rows.Close()
	var users []*models.User
	for rows.Next() {
		u, err := scanUserRow(rows)
		if err != nil {
			return nil, fmt.Errorf("[db/sqlite] ListUsers scan: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

const userCols = `id, username, email, password_hash, role, is_active, is_verified, created_at, updated_at, last_login_at`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(row *sql.Row) (*models.User, error) {
	u := &models.User{}
	var isActive, isVerified int
	var createdAt, updatedAt, lastLoginAt string
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role,
		&isActive, &isVerified, &createdAt, &updatedAt, &lastLoginAt)
	if err == sql.ErrNoRows {
		return nil, nil // caller expected to handle nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] scanUser: %w", err)
	}
	u.IsActive   = isActive > 0
	u.IsVerified = isVerified > 0
	u.CreatedAt  = decodeTime(createdAt)
	u.UpdatedAt  = decodeTime(updatedAt)
	u.LastLoginAt = decodeTime(lastLoginAt)
	return u, nil
}

func scanUserRow(rows *sql.Rows) (*models.User, error) {
	u := &models.User{}
	var isActive, isVerified int
	var createdAt, updatedAt, lastLoginAt string
	err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role,
		&isActive, &isVerified, &createdAt, &updatedAt, &lastLoginAt)
	if err != nil {
		return nil, err
	}
	u.IsActive    = isActive > 0
	u.IsVerified  = isVerified > 0
	u.CreatedAt   = decodeTime(createdAt)
	u.UpdatedAt   = decodeTime(updatedAt)
	u.LastLoginAt = decodeTime(lastLoginAt)
	return u, nil
}

// ── Sessions ──────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreateSession(ctx context.Context, sess *models.Session) (int64, error) {
	id, err := s.insertID(ctx,
		`INSERT INTO sessions (user_id, refresh_token_hash, device_id, ip_address, user_agent, created_at, expires_at, last_used_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		sess.UserID, sess.RefreshTokenHash, sess.DeviceID,
		sess.IPAddress, sess.UserAgent,
		encodeTime(time.Now().UTC()), encodeTime(sess.ExpiresAt), encodeTime(time.Now().UTC()),
	)
	if err != nil {
		return 0, fmt.Errorf("[db/sqlite] CreateSession: %w", err)
	}
	return id, nil
}

func (s *SQLiteStore) GetSessionByID(ctx context.Context, id int64) (*models.Session, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM sessions WHERE id=?`, id)
	return scanSession(row)
}

func (s *SQLiteStore) GetSessionByTokenHash(ctx context.Context, hash string) (*models.Session, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+sessionCols+` FROM sessions WHERE refresh_token_hash=?`, hash)
	return scanSession(row)
}

func (s *SQLiteStore) ListSessionsByUser(ctx context.Context, userID int64) ([]*models.Session, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+sessionCols+` FROM sessions WHERE user_id=? AND revoked=0 AND expires_at > ? ORDER BY created_at DESC`,
		userID, encodeTime(time.Now().UTC()))
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] ListSessionsByUser: %w", err)
	}
	defer rows.Close()
	var out []*models.Session
	for rows.Next() {
		sess := &models.Session{}
		if err := scanSessionRow(rows, sess); err != nil {
			return nil, err
		}
		out = append(out, sess)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) TouchSession(ctx context.Context, id int64, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET last_used_at=? WHERE id=?`, encodeTime(at), id)
	return wrapErr("[db/sqlite] TouchSession", err)
}

func (s *SQLiteStore) RevokeSession(ctx context.Context, id int64, reason string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1, revoked_reason=? WHERE id=?`, reason, id)
	return wrapErr("[db/sqlite] RevokeSession", err)
}

func (s *SQLiteStore) RevokeAllUserSessions(ctx context.Context, userID int64, reason string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked=1, revoked_reason=? WHERE user_id=? AND revoked=0`, reason, userID)
	return wrapErr("[db/sqlite] RevokeAllUserSessions", err)
}

func (s *SQLiteStore) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, encodeTime(time.Now().UTC()))
	return wrapErr("[db/sqlite] DeleteExpiredSessions", err)
}

const sessionCols = `id, user_id, refresh_token_hash, device_id, ip_address, user_agent, created_at, expires_at, last_used_at, revoked, revoked_reason`

func scanSession(row *sql.Row) (*models.Session, error) {
	sess := &models.Session{}
	var revoked int
	var createdAt, expiresAt, lastUsedAt string
	err := row.Scan(&sess.ID, &sess.UserID, &sess.RefreshTokenHash, &sess.DeviceID,
		&sess.IPAddress, &sess.UserAgent, &createdAt, &expiresAt, &lastUsedAt, &revoked, &sess.RevokedReason)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] scanSession: %w", err)
	}
	sess.Revoked    = revoked > 0
	sess.CreatedAt  = decodeTime(createdAt)
	sess.ExpiresAt  = decodeTime(expiresAt)
	sess.LastUsedAt = decodeTime(lastUsedAt)
	return sess, nil
}

func scanSessionRow(rows *sql.Rows, sess *models.Session) error {
	var revoked int
	var createdAt, expiresAt, lastUsedAt string
	err := rows.Scan(&sess.ID, &sess.UserID, &sess.RefreshTokenHash, &sess.DeviceID,
		&sess.IPAddress, &sess.UserAgent, &createdAt, &expiresAt, &lastUsedAt, &revoked, &sess.RevokedReason)
	if err != nil {
		return fmt.Errorf("[db/sqlite] scanSessionRow: %w", err)
	}
	sess.Revoked    = revoked > 0
	sess.CreatedAt  = decodeTime(createdAt)
	sess.ExpiresAt  = decodeTime(expiresAt)
	sess.LastUsedAt = decodeTime(lastUsedAt)
	return nil
}

// ── Devices ───────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreateDevice(ctx context.Context, d *models.Device) (int64, error) {
	now := encodeTime(time.Now().UTC())
	id, err := s.insertID(ctx,
		`INSERT INTO devices (user_id, fingerprint, user_agent, ip_address, name, trusted, first_seen_at, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		d.UserID, d.Fingerprint, d.UserAgent, d.IPAddress, d.Name, boolInt(d.Trusted), now, now,
	)
	if err != nil {
		return 0, fmt.Errorf("[db/sqlite] CreateDevice: %w", err)
	}
	return id, nil
}

func (s *SQLiteStore) GetDeviceByID(ctx context.Context, id int64) (*models.Device, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+deviceCols+` FROM devices WHERE id=?`, id)
	return scanDevice(row)
}

func (s *SQLiteStore) GetDeviceByFingerprint(ctx context.Context, userID int64, fp string) (*models.Device, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+deviceCols+` FROM devices WHERE user_id=? AND fingerprint=?`, userID, fp)
	return scanDevice(row)
}

func (s *SQLiteStore) ListDevicesByUser(ctx context.Context, userID int64) ([]*models.Device, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+deviceCols+` FROM devices WHERE user_id=? ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] ListDevicesByUser: %w", err)
	}
	defer rows.Close()
	var out []*models.Device
	for rows.Next() {
		d := &models.Device{}
		if err := scanDeviceRow(rows, d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *SQLiteStore) MarkDeviceTrusted(ctx context.Context, id int64, trusted bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE devices SET trusted=? WHERE id=?`, boolInt(trusted), id)
	return wrapErr("[db/sqlite] MarkDeviceTrusted", err)
}

func (s *SQLiteStore) TouchDevice(ctx context.Context, id int64, ip string, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE devices SET ip_address=?, last_seen_at=? WHERE id=?`, ip, encodeTime(at), id)
	return wrapErr("[db/sqlite] TouchDevice", err)
}

const deviceCols = `id, user_id, fingerprint, user_agent, ip_address, name, trusted, first_seen_at, last_seen_at`

func scanDevice(row *sql.Row) (*models.Device, error) {
	d := &models.Device{}
	var trusted int
	var firstSeenAt, lastSeenAt string
	err := row.Scan(&d.ID, &d.UserID, &d.Fingerprint, &d.UserAgent, &d.IPAddress, &d.Name, &trusted, &firstSeenAt, &lastSeenAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] scanDevice: %w", err)
	}
	d.Trusted      = trusted > 0
	d.FirstSeenAt  = decodeTime(firstSeenAt)
	d.LastSeenAt   = decodeTime(lastSeenAt)
	return d, nil
}

func scanDeviceRow(rows *sql.Rows, d *models.Device) error {
	var trusted int
	var firstSeenAt, lastSeenAt string
	err := rows.Scan(&d.ID, &d.UserID, &d.Fingerprint, &d.UserAgent, &d.IPAddress, &d.Name, &trusted, &firstSeenAt, &lastSeenAt)
	if err != nil {
		return fmt.Errorf("[db/sqlite] scanDeviceRow: %w", err)
	}
	d.Trusted     = trusted > 0
	d.FirstSeenAt = decodeTime(firstSeenAt)
	d.LastSeenAt  = decodeTime(lastSeenAt)
	return nil
}

// ── 2FA codes ─────────────────────────────────────────────────────────────────

func (s *SQLiteStore) Create2FACode(ctx context.Context, c *models.TwoFACode) (int64, error) {
	id, err := s.insertID(ctx,
		`INSERT INTO twofa_codes (user_id, code_hash, purpose, expires_at, used, attempts, created_at)
		 VALUES (?, ?, ?, ?, 0, 0, ?)`,
		c.UserID, c.CodeHash, string(c.Purpose), encodeTime(c.ExpiresAt), encodeTime(time.Now().UTC()),
	)
	if err != nil {
		return 0, fmt.Errorf("[db/sqlite] Create2FACode: %w", err)
	}
	return id, nil
}

func (s *SQLiteStore) GetActive2FACode(ctx context.Context, userID int64, purpose models.TwoFAPurpose) (*models.TwoFACode, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, code_hash, purpose, expires_at, used, attempts, created_at
		 FROM twofa_codes
		 WHERE user_id=? AND purpose=? AND used=0 AND expires_at > ?
		 ORDER BY created_at DESC LIMIT 1`,
		userID, string(purpose), encodeTime(time.Now().UTC()),
	)
	c := &models.TwoFACode{}
	var used, attempts int
	var expiresAt, createdAt, purposeStr string
	err := row.Scan(&c.ID, &c.UserID, &c.CodeHash, &purposeStr, &expiresAt, &used, &attempts, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] GetActive2FACode: %w", err)
	}
	c.Purpose   = models.TwoFAPurpose(purposeStr)
	c.Used      = used > 0
	c.Attempts  = attempts
	c.ExpiresAt = decodeTime(expiresAt)
	c.CreatedAt = decodeTime(createdAt)
	return c, nil
}

func (s *SQLiteStore) Increment2FAAttempts(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE twofa_codes SET attempts = attempts + 1 WHERE id=?`, id)
	return wrapErr("[db/sqlite] Increment2FAAttempts", err)
}

func (s *SQLiteStore) Mark2FACodeUsed(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE twofa_codes SET used=1 WHERE id=?`, id)
	return wrapErr("[db/sqlite] Mark2FACodeUsed", err)
}

func (s *SQLiteStore) Invalidate2FACodes(ctx context.Context, userID int64, purpose models.TwoFAPurpose) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE twofa_codes SET used=1 WHERE user_id=? AND purpose=? AND used=0`, userID, string(purpose))
	return wrapErr("[db/sqlite] Invalidate2FACodes", err)
}

func (s *SQLiteStore) DeleteExpired2FACodes(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM twofa_codes WHERE expires_at < ?`, encodeTime(time.Now().UTC()))
	return wrapErr("[db/sqlite] DeleteExpired2FACodes", err)
}

// ── IP records ────────────────────────────────────────────────────────────────

func (s *SQLiteStore) UpsertIPRecord(ctx context.Context, ip string) (*models.IPRecord, error) {
	now := encodeTime(time.Now().UTC())
	query := `INSERT INTO ip_records (ip_address, request_count, first_seen_at, last_seen_at)
		 VALUES (?, 1, ?, ?)
		 ON CONFLICT(ip_address) DO UPDATE SET
		     request_count = ip_records.request_count + 1,
		     last_seen_at  = EXCLUDED.last_seen_at`
	if s.dialect == "mysql" {
		query = `INSERT INTO ip_records (ip_address, request_count, first_seen_at, last_seen_at)
			VALUES (?, 1, ?, ?)
			ON DUPLICATE KEY UPDATE
				request_count = request_count + 1,
				last_seen_at = VALUES(last_seen_at)`
	}
	_, err := s.db.ExecContext(ctx, query, ip, now, now)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] UpsertIPRecord %q: %w", ip, err)
	}
	return s.GetIPRecord(ctx, ip)
}

func (s *SQLiteStore) GetIPRecord(ctx context.Context, ip string) (*models.IPRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, ip_address, request_count, blocked, blocked_reason, blocked_until, first_seen_at, last_seen_at
		 FROM ip_records WHERE ip_address=?`, ip)
	rec := &models.IPRecord{}
	var blocked int
	var blockedUntil, firstSeenAt, lastSeenAt string
	err := row.Scan(&rec.ID, &rec.IPAddress, &rec.RequestCount, &blocked,
		&rec.BlockedReason, &blockedUntil, &firstSeenAt, &lastSeenAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] GetIPRecord %q: %w", ip, err)
	}
	rec.Blocked      = blocked > 0
	rec.BlockedUntil = decodeTime(blockedUntil)
	rec.FirstSeenAt  = decodeTime(firstSeenAt)
	rec.LastSeenAt   = decodeTime(lastSeenAt)
	return rec, nil
}

func (s *SQLiteStore) BlockIP(ctx context.Context, ip, reason string, until time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE ip_records SET blocked=1, blocked_reason=?, blocked_until=? WHERE ip_address=?`,
		reason, encodeTime(until), ip)
	return wrapErr("[db/sqlite] BlockIP", err)
}

func (s *SQLiteStore) UnblockIP(ctx context.Context, ip string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE ip_records SET blocked=0, blocked_reason='', blocked_until='0001-01-01T00:00:00Z' WHERE ip_address=?`, ip)
	return wrapErr("[db/sqlite] UnblockIP", err)
}

func (s *SQLiteStore) IncrementIPRequests(ctx context.Context, ip string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE ip_records SET request_count=request_count+1, last_seen_at=? WHERE ip_address=?`,
		encodeTime(time.Now().UTC()), ip)
	return wrapErr("[db/sqlite] IncrementIPRequests", err)
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

func (s *SQLiteStore) GetRateLimit(ctx context.Context, key, action string) (*models.RateLimit, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, key_field, action, attempts, window_start, blocked_until FROM rate_limits WHERE key_field=? AND action=?`,
		key, action)
	rl := &models.RateLimit{}
	var windowStart, blockedUntil string
	err := row.Scan(&rl.ID, &rl.Key, &rl.Action, &rl.Attempts, &windowStart, &blockedUntil)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] GetRateLimit %q/%q: %w", key, action, err)
	}
	rl.WindowStart  = decodeTime(windowStart)
	rl.BlockedUntil = decodeTime(blockedUntil)
	return rl, nil
}

func (s *SQLiteStore) UpsertRateLimit(ctx context.Context, key, action string, windowStart time.Time) (*models.RateLimit, error) {
	query := `INSERT INTO rate_limits (key_field, action, attempts, window_start, blocked_until)
		 VALUES (?, ?, 0, ?, '0001-01-01T00:00:00Z')
		 ON CONFLICT(key_field, action) DO NOTHING`
	if s.dialect == "mysql" {
		query = `INSERT INTO rate_limits (key_field, action, attempts, window_start, blocked_until)
			VALUES (?, ?, 0, ?, '0001-01-01T00:00:00Z')
			ON DUPLICATE KEY UPDATE
				id = id`
	}
	_, err := s.db.ExecContext(ctx, query, key, action, encodeTime(windowStart))
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] UpsertRateLimit: %w", err)
	}
	return s.GetRateLimit(ctx, key, action)
}

func (s *SQLiteStore) IncrementRateAttempts(ctx context.Context, key, action string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE rate_limits SET attempts=attempts+1 WHERE key_field=? AND action=?`, key, action)
	return wrapErr("[db/sqlite] IncrementRateAttempts", err)
}

func (s *SQLiteStore) SetRateBlock(ctx context.Context, key, action string, until time.Time) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE rate_limits SET blocked_until=? WHERE key_field=? AND action=?`, encodeTime(until), key, action)
	return wrapErr("[db/sqlite] SetRateBlock", err)
}

func (s *SQLiteStore) ResetRateLimit(ctx context.Context, key, action string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE rate_limits SET attempts=0, window_start=?, blocked_until='0001-01-01T00:00:00Z' WHERE key_field=? AND action=?`,
		encodeTime(time.Now().UTC()), key, action)
	return wrapErr("[db/sqlite] ResetRateLimit", err)
}

func (s *SQLiteStore) CleanExpiredRateLimits(ctx context.Context) error {
	// Remove rows where the window is old (> 2 hours) and not currently blocked
	cutoff := encodeTime(time.Now().UTC().Add(-2 * time.Hour))
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM rate_limits WHERE window_start < ? AND blocked_until < ?`,
		cutoff, encodeTime(time.Now().UTC()))
	return wrapErr("[db/sqlite] CleanExpiredRateLimits", err)
}

// ── Audit log ─────────────────────────────────────────────────────────────────

func (s *SQLiteStore) CreateAuditLog(ctx context.Context, entry *models.AuditLog) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO audit_log (user_id, ip_address, action, detail, success, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		entry.UserID, entry.IPAddress, entry.Action, entry.Detail,
		boolInt(entry.Success), encodeTime(time.Now().UTC()),
	)
	return wrapErr("[db/sqlite] CreateAuditLog", err)
}

func (s *SQLiteStore) ListAuditLogByUser(ctx context.Context, userID int64, limit, offset int) ([]*models.AuditLog, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, ip_address, action, detail, success, created_at FROM audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] ListAuditLogByUser: %w", err)
	}
	defer rows.Close()
	return scanAuditRows(rows)
}

func (s *SQLiteStore) ListAuditLogByIP(ctx context.Context, ip string, limit, offset int) ([]*models.AuditLog, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, ip_address, action, detail, success, created_at FROM audit_log WHERE ip_address=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
		ip, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("[db/sqlite] ListAuditLogByIP: %w", err)
	}
	defer rows.Close()
	return scanAuditRows(rows)
}

func scanAuditRows(rows *sql.Rows) ([]*models.AuditLog, error) {
	var out []*models.AuditLog
	for rows.Next() {
		a := &models.AuditLog{}
		var success int
		var createdAt string
		if err := rows.Scan(&a.ID, &a.UserID, &a.IPAddress, &a.Action, &a.Detail, &success, &createdAt); err != nil {
			return nil, fmt.Errorf("[db/sqlite] scanAuditRows: %w", err)
		}
		a.Success   = success > 0
		a.CreatedAt = decodeTime(createdAt)
		out = append(out, a)
	}
	return out, rows.Err()
}

// ── misc helpers ──────────────────────────────────────────────────────────────

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func wrapErr(prefix string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", prefix, err)
}

func (s *SQLiteStore) insertID(ctx context.Context, query string, args ...any) (int64, error) {
	if s.dialect == "postgres" {
		q := strings.TrimSpace(query)
		q = strings.TrimSuffix(q, ";") + " RETURNING id"
		var id int64
		if err := s.db.QueryRowContext(ctx, q, args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}
