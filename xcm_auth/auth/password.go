// Package auth provides high-level authentication helpers for xcm_auth.
// All public functions include structured logging so failures are always
// visible in the console without requiring a debugger.
package auth

import (
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword hashes a plaintext password with bcrypt at the given cost.
// cost should be at least 12 in production (configured via BCRYPT_COST).
func HashPassword(plain string, cost int) (string, error) {
	if plain == "" {
		return "", fmt.Errorf("[auth/password] HashPassword: plaintext password is empty")
	}
	if cost < bcrypt.MinCost {
		log.Printf("[auth/password] HashPassword: cost %d is below bcrypt minimum %d - using minimum", cost, bcrypt.MinCost)
		cost = bcrypt.MinCost
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		return "", fmt.Errorf("[auth/password] HashPassword: bcrypt error: %w", err)
	}
	return string(hash), nil
}

// CheckPassword returns true if plain matches the stored bcrypt hash.
// Uses constant-time comparison internally (bcrypt.CompareHashAndPassword).
// Always returns false on any error; the error is also returned for logging.
func CheckPassword(hash, plain string) (bool, error) {
	if hash == "" || plain == "" {
		return false, fmt.Errorf("[auth/password] CheckPassword: empty hash or plaintext")
	}
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
	if err == bcrypt.ErrMismatchedHashAndPassword {
		return false, nil // wrong password - not a system error
	}
	if err != nil {
		return false, fmt.Errorf("[auth/password] CheckPassword: %w", err)
	}
	return true, nil
}

// PasswordStrength returns a non-nil error if the password does not meet
// minimum security requirements: at least 8 chars, mixed case, a digit.
func PasswordStrength(plain string) error {
	if len(plain) < 8 {
		return fmt.Errorf("[auth/password] password must be at least 8 characters")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, c := range plain {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		}
	}
	if !hasUpper {
		return fmt.Errorf("[auth/password] password must contain at least one uppercase letter")
	}
	if !hasLower {
		return fmt.Errorf("[auth/password] password must contain at least one lowercase letter")
	}
	if !hasDigit {
		return fmt.Errorf("[auth/password] password must contain at least one digit")
	}
	return nil
}
