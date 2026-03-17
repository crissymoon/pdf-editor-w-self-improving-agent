package auth

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/models"
)

// GenerateTwoFACode creates a random numeric code of the configured length,
// hashes it with bcrypt, stores the hash in the DB, and returns the plaintext
// code (to be sent via email).
func GenerateTwoFACode(
	ctx context.Context,
	store db.Store,
	userID int64,
	purpose models.TwoFAPurpose,
	cfg *config.TwoFAConfig,
	bcryptCost int,
) (plainCode string, err error) {
	// Invalidate any existing unused code for this user+purpose so only one
	// code is active at a time.
	if invErr := store.Invalidate2FACodes(ctx, userID, purpose); invErr != nil {
		log.Printf("[auth/twofa] GenerateTwoFACode: failed to invalidate prior codes for user %d: %v", userID, invErr)
		// Not fatal - continue
	}

	code, err := randomNumericCode(cfg.CodeLength)
	if err != nil {
		return "", fmt.Errorf("[auth/twofa] GenerateTwoFACode: %w", err)
	}

	hash, err := HashPassword(code, bcryptCost)
	if err != nil {
		return "", fmt.Errorf("[auth/twofa] GenerateTwoFACode: hash: %w", err)
	}

	rec := &models.TwoFACode{
		UserID:    userID,
		CodeHash:  hash,
		Purpose:   purpose,
		ExpiresAt: time.Now().UTC().Add(time.Duration(cfg.ExpiryMinutes) * time.Minute),
	}
	id, err := store.Create2FACode(ctx, rec)
	if err != nil {
		return "", fmt.Errorf("[auth/twofa] GenerateTwoFACode: store: %w", err)
	}
	log.Printf("[auth/twofa] issued %s code id=%d for user %d (expires in %d min)", purpose, id, userID, cfg.ExpiryMinutes)
	return code, nil
}

// VerifyTwoFACode checks the code the user submitted against the stored hash.
// It increments attempt counters and invalidates the code on success or when
// max attempts are exceeded.  Returns (true, nil) on success.
type VerifyResult struct {
	OK          bool
	Expired     bool   // code existed but was past its ExpiresAt
	MaxAttempts bool   // too many wrong attempts
	NotFound    bool   // no active code found
}

func VerifyTwoFACode(
	ctx context.Context,
	store db.Store,
	userID int64,
	purpose models.TwoFAPurpose,
	submitted string,
	cfg *config.TwoFAConfig,
) (VerifyResult, error) {
	submitted = strings.TrimSpace(submitted)
	if submitted == "" {
		return VerifyResult{}, fmt.Errorf("[auth/twofa] VerifyTwoFACode: empty code submitted")
	}

	rec, err := store.GetActive2FACode(ctx, userID, purpose)
	if err != nil {
		return VerifyResult{}, fmt.Errorf("[auth/twofa] VerifyTwoFACode: db lookup: %w", err)
	}
	if rec == nil {
		log.Printf("[auth/twofa] VerifyTwoFACode: no active %s code for user %d", purpose, userID)
		return VerifyResult{NotFound: true}, nil
	}

	// Double-check expiry (GetActive2FACode filters by expires_at but guard anyway)
	if time.Now().UTC().After(rec.ExpiresAt) {
		log.Printf("[auth/twofa] VerifyTwoFACode: code %d for user %d expired at %s", rec.ID, userID, rec.ExpiresAt)
		return VerifyResult{Expired: true}, nil
	}

	if rec.Attempts >= cfg.MaxAttempts {
		log.Printf("[auth/twofa] VerifyTwoFACode: code %d for user %d has reached max attempts (%d)", rec.ID, userID, cfg.MaxAttempts)
		// Invalidate so a fresh code must be requested
		_ = store.Mark2FACodeUsed(ctx, rec.ID)
		return VerifyResult{MaxAttempts: true}, nil
	}

	ok, err := CheckPassword(rec.CodeHash, submitted)
	if err != nil {
		log.Printf("[auth/twofa] VerifyTwoFACode: bcrypt error (code %d, user %d): %v", rec.ID, userID, err)
		return VerifyResult{}, err
	}

	if !ok {
		if incrErr := store.Increment2FAAttempts(ctx, rec.ID); incrErr != nil {
			log.Printf("[auth/twofa] VerifyTwoFACode: failed to increment attempts for code %d: %v", rec.ID, incrErr)
		}
		log.Printf("[auth/twofa] VerifyTwoFACode: wrong code for user %d (attempt %d/%d)", userID, rec.Attempts+1, cfg.MaxAttempts)
		return VerifyResult{OK: false}, nil
	}

	// Consume the code
	if markErr := store.Mark2FACodeUsed(ctx, rec.ID); markErr != nil {
		log.Printf("[auth/twofa] VerifyTwoFACode: failed to mark code %d used: %v", rec.ID, markErr)
	}
	log.Printf("[auth/twofa] VerifyTwoFACode: success for user %d (code %d)", userID, rec.ID)
	return VerifyResult{OK: true}, nil
}

// randomNumericCode returns a cryptographically random numeric string of
// exactly length digits (zero-padded on the left if necessary).
func randomNumericCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	var digits strings.Builder
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("[auth/twofa] randomNumericCode: rand.Int: %w", err)
		}
		digits.WriteString(n.String())
	}
	return digits.String(), nil
}
