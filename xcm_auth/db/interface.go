// Package db defines the data-access interface used by xcm_auth.
// The interface can be satisfied by SQLite, MySQL, Postgres, or any
// other SQL backend.  This file contains only the interface definition.
// Each driver provides its own concrete implementation.
package db

import (
	"context"
	"time"

	"xcaliburmoon.net/xcm_auth/models"
)

// Store is the unified data-access interface. All methods accept a context
// so callers can enforce request-level deadlines.
type Store interface {
	// ── Lifecycle ──────────────────────────────────────────────────────────
	// Migrate creates or upgrades all tables required by xcm_auth.
	Migrate(ctx context.Context) error
	// Close releases any underlying connection pool resources.
	Close() error

	// ── Users ──────────────────────────────────────────────────────────────
	CreateUser(ctx context.Context, u *models.User) (int64, error)
	GetUserByID(ctx context.Context, id int64) (*models.User, error)
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUserByUsername(ctx context.Context, username string) (*models.User, error)
	UpdateUser(ctx context.Context, u *models.User) error
	UpdateUserPassword(ctx context.Context, userID int64, newHash string) error
	UpdateUserLastLogin(ctx context.Context, userID int64, at time.Time) error
	SetUserActive(ctx context.Context, userID int64, active bool) error
	SetUserVerified(ctx context.Context, userID int64, verified bool) error
	ListUsers(ctx context.Context, limit, offset int) ([]*models.User, error)

	// ── Sessions ───────────────────────────────────────────────────────────
	CreateSession(ctx context.Context, s *models.Session) (int64, error)
	GetSessionByID(ctx context.Context, id int64) (*models.Session, error)
	GetSessionByTokenHash(ctx context.Context, hash string) (*models.Session, error)
	ListSessionsByUser(ctx context.Context, userID int64) ([]*models.Session, error)
	TouchSession(ctx context.Context, id int64, at time.Time) error
	RevokeSession(ctx context.Context, id int64, reason string) error
	RevokeAllUserSessions(ctx context.Context, userID int64, reason string) error
	DeleteExpiredSessions(ctx context.Context) error

	// ── Devices ────────────────────────────────────────────────────────────
	CreateDevice(ctx context.Context, d *models.Device) (int64, error)
	GetDeviceByID(ctx context.Context, id int64) (*models.Device, error)
	GetDeviceByFingerprint(ctx context.Context, userID int64, fp string) (*models.Device, error)
	ListDevicesByUser(ctx context.Context, userID int64) ([]*models.Device, error)
	MarkDeviceTrusted(ctx context.Context, id int64, trusted bool) error
	TouchDevice(ctx context.Context, id int64, ip string, at time.Time) error

	// ── 2FA codes ──────────────────────────────────────────────────────────
	Create2FACode(ctx context.Context, c *models.TwoFACode) (int64, error)
	GetActive2FACode(ctx context.Context, userID int64, purpose models.TwoFAPurpose) (*models.TwoFACode, error)
	Increment2FAAttempts(ctx context.Context, id int64) error
	Mark2FACodeUsed(ctx context.Context, id int64) error
	Invalidate2FACodes(ctx context.Context, userID int64, purpose models.TwoFAPurpose) error
	DeleteExpired2FACodes(ctx context.Context) error

	// ── IP records ─────────────────────────────────────────────────────────
	UpsertIPRecord(ctx context.Context, ip string) (*models.IPRecord, error)
	GetIPRecord(ctx context.Context, ip string) (*models.IPRecord, error)
	BlockIP(ctx context.Context, ip, reason string, until time.Time) error
	UnblockIP(ctx context.Context, ip string) error
	IncrementIPRequests(ctx context.Context, ip string) error

	// ── Rate limiting ──────────────────────────────────────────────────────
	GetRateLimit(ctx context.Context, key, action string) (*models.RateLimit, error)
	UpsertRateLimit(ctx context.Context, key, action string, windowStart time.Time) (*models.RateLimit, error)
	IncrementRateAttempts(ctx context.Context, key, action string) error
	SetRateBlock(ctx context.Context, key, action string, until time.Time) error
	ResetRateLimit(ctx context.Context, key, action string) error
	CleanExpiredRateLimits(ctx context.Context) error

	// ── Audit log ──────────────────────────────────────────────────────────
	CreateAuditLog(ctx context.Context, entry *models.AuditLog) error
	ListAuditLogByUser(ctx context.Context, userID int64, limit, offset int) ([]*models.AuditLog, error)
	ListAuditLogByIP(ctx context.Context, ip string, limit, offset int) ([]*models.AuditLog, error)
}
