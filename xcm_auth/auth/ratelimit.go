package auth

import (
	"context"
	"fmt"
	"log"
	"time"

	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
)

// RateLimitResult is returned by CheckRateLimit so callers can react precisely.
type RateLimitResult struct {
	Blocked      bool
	Attempts     int
	BlockedUntil time.Time
}

// CheckRateLimit looks up the current rate state for (key, action) and returns
// whether the caller is currently blocked.  key should be "ip:1.2.3.4" or
// "user:42".  action should be "login", "resend_2fa", etc.
func CheckRateLimit(
	ctx context.Context,
	store db.Store,
	key, action string,
	cfg *config.RateConfig,
) (RateLimitResult, error) {
	rec, err := store.GetRateLimit(ctx, key, action)
	if err != nil {
		log.Printf("[auth/rate] CheckRateLimit %q/%q: db error: %v", key, action, err)
		return RateLimitResult{}, fmt.Errorf("[auth/rate] CheckRateLimit: %w", err)
	}
	if rec == nil {
		return RateLimitResult{}, nil // no record yet - not blocked
	}

	// Still within an active block window?
	if rec.BlockedUntil.After(time.Now().UTC()) {
		remaining := time.Until(rec.BlockedUntil).Round(time.Second)
		log.Printf("[auth/rate] %q is blocked for %q for another %s", key, action, remaining)
		return RateLimitResult{Blocked: true, BlockedUntil: rec.BlockedUntil, Attempts: rec.Attempts}, nil
	}

	// Determine window and max attempts
	windowMinutes, maxAttempts := windowAndMax(action, cfg)
	windowStart := time.Now().UTC().Add(-time.Duration(windowMinutes) * time.Minute)

	// If the window has rolled over, treat it as a fresh start
	if rec.WindowStart.Before(windowStart) {
		return RateLimitResult{Attempts: 0}, nil
	}

	if rec.Attempts >= maxAttempts {
		blockUntil := time.Now().UTC().Add(time.Duration(cfg.BlockDurationMinutes) * time.Minute)
		if setErr := store.SetRateBlock(ctx, key, action, blockUntil); setErr != nil {
			log.Printf("[auth/rate] CheckRateLimit: failed to set block for %q: %v", key, setErr)
		}
		log.Printf("[auth/rate] %q exceeded %d attempts for %q - blocked until %s", key, maxAttempts, action, blockUntil.Format(time.RFC3339))
		return RateLimitResult{Blocked: true, BlockedUntil: blockUntil, Attempts: rec.Attempts}, nil
	}

	return RateLimitResult{Attempts: rec.Attempts}, nil
}

// RecordAttempt increments the attempt counter for (key, action), creating
// the rate-limit row if it does not exist.  Should be called after every
// failed auth attempt.
func RecordAttempt(ctx context.Context, store db.Store, key, action string, cfg *config.RateConfig) error {
	// window_start is the absolute time this window began (now), NOT now-minus-window.
	// CheckRateLimit uses rec.WindowStart to decide whether the window has expired:
	//   if rec.WindowStart.Before(now - windowDuration) the window has rolled over.
	// Storing now-minus-window would make every subsequent check see the record as
	// expired (since rec.WindowStart would always be before now-minus-window).
	windowStart := time.Now().UTC()

	_, err := store.UpsertRateLimit(ctx, key, action, windowStart)
	if err != nil {
		log.Printf("[auth/rate] RecordAttempt upsert %q/%q: %v", key, action, err)
		return fmt.Errorf("[auth/rate] RecordAttempt: %w", err)
	}
	if err := store.IncrementRateAttempts(ctx, key, action); err != nil {
		log.Printf("[auth/rate] RecordAttempt increment %q/%q: %v", key, action, err)
		return fmt.Errorf("[auth/rate] RecordAttempt increment: %w", err)
	}
	log.Printf("[auth/rate] attempt recorded for %q/%q", key, action)
	return nil
}

// ClearAttempts resets the counter on a successful auth event so normal users
// are not permanently penalised for past failures.
func ClearAttempts(ctx context.Context, store db.Store, key, action string) {
	if err := store.ResetRateLimit(ctx, key, action); err != nil {
		// Non-fatal - log and continue
		log.Printf("[auth/rate] ClearAttempts %q/%q: %v", key, action, err)
	}
}

func windowAndMax(action string, cfg *config.RateConfig) (windowMinutes, max int) {
	switch action {
	case "login_account":
		return cfg.AccountLoginWindowMinutes, cfg.AccountLoginMax
	default: // "login", "resend_2fa", etc. - use IP limits
		return cfg.IPLoginWindowMinutes, cfg.IPLoginMax
	}
}
