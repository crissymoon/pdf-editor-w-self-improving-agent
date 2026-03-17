// Package models defines all database-backed data structures used by xcm_auth.
// Every field purposefully avoids *string / *int pointers where possible so
// consumers never have to nil-guard scalar values.
package models

import "time"

// ── User ─────────────────────────────────────────────────────────────────────

// Role constants
const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

// User represents an account in the system.
type User struct {
	ID           int64
	Username     string
	Email        string
	PasswordHash string // bcrypt hash - never include in JSON responses
	Role         string
	IsActive     bool
	IsVerified   bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
	LastLoginAt  time.Time
}

// SafeUser is the public-safe representation (no password hash).
type SafeUser struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	IsActive    bool      `json:"is_active"`
	IsVerified  bool      `json:"is_verified"`
	CreatedAt   time.Time `json:"created_at"`
	LastLoginAt time.Time `json:"last_login_at"`
}

func (u *User) Safe() SafeUser {
	return SafeUser{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		Role:        u.Role,
		IsActive:    u.IsActive,
		IsVerified:  u.IsVerified,
		CreatedAt:   u.CreatedAt,
		LastLoginAt: u.LastLoginAt,
	}
}

// ── Session ───────────────────────────────────────────────────────────────────

// Session is an authenticated login session backed by a refresh token.
// Access tokens (JWT) are stateless; refresh tokens are stored here.
type Session struct {
	ID               int64
	UserID           int64
	RefreshTokenHash string // sha256 hash of the opaque refresh token; never return raw
	DeviceID         int64
	IPAddress        string
	UserAgent        string
	CreatedAt        time.Time
	ExpiresAt        time.Time
	LastUsedAt       time.Time
	Revoked          bool
	RevokedReason    string
}

// ── Device ────────────────────────────────────────────────────────────────────

// Device represents a known client device (identified by a stable fingerprint).
type Device struct {
	ID          int64
	UserID      int64
	Fingerprint string // stable hash of user-agent + accept-language + platform headers
	UserAgent   string
	IPAddress   string
	Name        string // optional human label, e.g. "iPhone 15 Safari"
	Trusted     bool
	FirstSeenAt time.Time
	LastSeenAt  time.Time
}

// ── TwoFACode ─────────────────────────────────────────────────────────────────

// TwoFAPurpose enumerates what a 2FA code was issued for.
type TwoFAPurpose string

const (
	PurposeLogin       TwoFAPurpose = "login"
	PurposeEmailVerify TwoFAPurpose = "email_verify"
	PurposePassReset   TwoFAPurpose = "pass_reset"
)

// TwoFACode holds a time-limited one-time code sent to the user's email.
type TwoFACode struct {
	ID        int64
	UserID    int64
	CodeHash  string       // bcrypt hash of the plaintext code
	Purpose   TwoFAPurpose
	ExpiresAt time.Time
	Used      bool
	Attempts  int  // wrong-attempt counter
	CreatedAt time.Time
}

// ── IPRecord ──────────────────────────────────────────────────────────────────

// IPRecord tracks activity from a given IP address.
type IPRecord struct {
	ID             int64
	IPAddress      string
	RequestCount   int
	Blocked        bool
	BlockedReason  string
	BlockedUntil   time.Time
	FirstSeenAt    time.Time
	LastSeenAt     time.Time
}

// ── RateLimit ─────────────────────────────────────────────────────────────────

// RateLimit tracks login attempt buckets. Key is either "ip:x.x.x.x" or
// "user:id" to allow independent limits per IP and per account.
type RateLimit struct {
	ID           int64
	Key          string    // "ip:1.2.3.4" or "user:42"
	Action       string    // e.g. "login", "resend_2fa"
	Attempts     int
	WindowStart  time.Time
	BlockedUntil time.Time
}

// ── AuditLog ──────────────────────────────────────────────────────────────────

// AuditLog records every security-relevant event for forensic analysis.
type AuditLog struct {
	ID        int64
	UserID    int64  // 0 if unauthenticated
	IPAddress string
	Action    string // e.g. "login_ok", "login_fail", "2fa_ok", "password_reset"
	Detail    string // JSON or free-text detail
	Success   bool
	CreatedAt time.Time
}

// ── Token pair returned on successful auth ────────────────────────────────────

// TokenPair holds the access + refresh tokens issued after a completed login.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"` // unix timestamp
	TokenType    string `json:"token_type"` // "Bearer"
}
