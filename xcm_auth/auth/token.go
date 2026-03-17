package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/models"
)

// ── JWT access tokens ─────────────────────────────────────────────────────────

// Claims holds the payload embedded in every JWT access token.
type Claims struct {
	UserID   int64  `json:"uid"`
	Username string `json:"usr"`
	Email    string `json:"eml"`
	Role     string `json:"role"`
	TokenUse string `json:"use,omitempty"`
	jwt.RegisteredClaims
}

const (
	TokenUseAccess    = "access"
	TokenUseChallenge = "challenge"
)

// IssueAccessToken creates a signed JWT access token for the given user.
func IssueAccessToken(user *models.User, cfg *config.JWTConfig) (string, time.Time, error) {
	return issueTokenWithUse(user, cfg, TokenUseAccess)
}

// IssueChallengeToken creates a short-lived challenge token for pre-2FA flows.
func IssueChallengeToken(user *models.User, cfg *config.JWTConfig) (string, time.Time, error) {
	return issueTokenWithUse(user, cfg, TokenUseChallenge)
}

func issueTokenWithUse(user *models.User, cfg *config.JWTConfig, tokenUse string) (string, time.Time, error) {
	if user == nil {
		return "", time.Time{}, fmt.Errorf("[auth/token] IssueAccessToken: nil user")
	}
	if tokenUse == "" {
		tokenUse = TokenUseAccess
	}
	expiresAt := time.Now().UTC().Add(time.Duration(cfg.AccessExpiryMinutes) * time.Minute)
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
		TokenUse: tokenUse,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", user.ID),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(cfg.AccessSecret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("[auth/token] IssueAccessToken sign: %w", err)
	}
	log.Printf("[auth/token] issued %s token for user %d (expires %s)", tokenUse, user.ID, expiresAt.Format(time.RFC3339))
	return signed, expiresAt, nil
}

// ParseAccessToken validates and parses a JWT access token string.
// Returns nil claims and a non-nil error if the token is invalid or expired.
func ParseAccessToken(tokenStr string, cfg *config.JWTConfig) (*Claims, error) {
	if tokenStr == "" {
		return nil, fmt.Errorf("[auth/token] ParseAccessToken: empty token string")
	}
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("[auth/token] unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(cfg.AccessSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("[auth/token] ParseAccessToken: %w", err)
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("[auth/token] ParseAccessToken: invalid claims")
	}
	return claims, nil
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

const refreshTokenBytes = 48 // 384 bits

// GenerateRefreshToken creates a cryptographically random opaque refresh token
// and returns both the raw token (to send to the client) and its SHA-256 hash
// (to store in the database - never store the raw token).
func GenerateRefreshToken() (raw, hash string, err error) {
	buf := make([]byte, refreshTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("[auth/token] GenerateRefreshToken: rand.Read: %w", err)
	}
	raw = hex.EncodeToString(buf)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return raw, hash, nil
}

// HashRefreshToken returns the SHA-256 hex hash of a raw refresh token.
// Used when the client presents a refresh token for validation.
func HashRefreshToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// RefreshExpiresAt returns the absolute expiry time for a new refresh token.
func RefreshExpiresAt(cfg *config.JWTConfig) time.Time {
	return time.Now().UTC().Add(time.Duration(cfg.RefreshExpiryDays) * 24 * time.Hour)
}
