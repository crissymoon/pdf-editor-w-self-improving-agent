package auth

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"net/http"
	"time"

	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/models"
)

// DeviceFingerprint builds a stable device identifier from request headers.
// It does NOT use IP address so the same device is recognised across IPs.
// The result is a hex-encoded SHA-256 hash suitable for database storage.
func DeviceFingerprint(r *http.Request) string {
	parts := []string{
		r.Header.Get("User-Agent"),
		r.Header.Get("Accept-Language"),
		r.Header.Get("Accept-Encoding"),
		r.Header.Get("Sec-CH-UA-Platform"),      // Hints API on Chrome
		r.Header.Get("Sec-CH-UA"),
	}
	combined := ""
	for _, p := range parts {
		combined += "|" + p
	}
	sum := sha256.Sum256([]byte(combined))
	return fmt.Sprintf("%x", sum[:])
}

// GetOrCreateDevice looks up the device by (userID, fingerprint). If not
// found, a new device row is created. The device LastSeenAt is always updated.
func GetOrCreateDevice(
	ctx context.Context,
	store db.Store,
	userID int64,
	r *http.Request,
) (*models.Device, error) {
	fp := DeviceFingerprint(r)
	ip := ClientIP(r)

	existing, err := store.GetDeviceByFingerprint(ctx, userID, fp)
	if err != nil {
		return nil, fmt.Errorf("[auth/device] GetDeviceByFingerprint: %w", err)
	}
	if existing != nil {
		// Update last seen + latest IP
		if touchErr := store.TouchDevice(ctx, existing.ID, ip, time.Now().UTC()); touchErr != nil {
			log.Printf("[auth/device] TouchDevice %d: %v", existing.ID, touchErr)
		}
		existing.LastSeenAt = time.Now().UTC()
		existing.IPAddress  = ip
		return existing, nil
	}

	// New device
	ua := r.UserAgent()
	if len(ua) > 512 {
		ua = ua[:512]
	}
	d := &models.Device{
		UserID:      userID,
		Fingerprint: fp,
		UserAgent:   ua,
		IPAddress:   ip,
		Name:        "Unknown device",
		Trusted:     false,
	}
	id, err := store.CreateDevice(ctx, d)
	if err != nil {
		return nil, fmt.Errorf("[auth/device] CreateDevice: %w", err)
	}
	d.ID          = id
	d.FirstSeenAt = time.Now().UTC()
	d.LastSeenAt  = time.Now().UTC()
	log.Printf("[auth/device] registered new device %d for user %d (fp %s...)", id, userID, fp[:12])
	return d, nil
}

// ClientIP extracts the real client IP from common proxy headers, falling
// back to RemoteAddr. It never panics.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// First IP in X-Forwarded-For is the original client
		for i := 0; i < len(xff); i++ {
			if xff[i] == ',' {
				return xff[:i]
			}
		}
		return xff
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return xri
	}
	// Strip port from RemoteAddr
	addr := r.RemoteAddr
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
