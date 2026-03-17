package api

import (
	"context"
	"log"
	"net/http"
	"strings"

	"xcaliburmoon.net/xcm_auth/auth"
	"xcaliburmoon.net/xcm_auth/config"
)

// contextKey is a private type for context keys to avoid collisions.
type contextKey string

const (
	ctxClaims contextKey = "claims"
)

// ── CORS middleware ───────────────────────────────────────────────────────────

// CORSMiddleware sets permissive CORS headers for configured origins.
func CORSMiddleware(origins []string) func(http.Handler) http.Handler {
	allowAll := len(origins) == 1 && origins[0] == "*"
	originSet := make(map[string]bool, len(origins))
	for _, o := range origins {
		originSet[o] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if allowAll || originSet[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Device-Name")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ── HTTPS enforcement ─────────────────────────────────────────────────────────

// RequireHTTPS rejects plain HTTP requests when enabled.
func RequireHTTPS(require bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if require {
				proto := r.Header.Get("X-Forwarded-Proto")
				if proto == "" {
					proto = r.URL.Scheme
				}
				if proto != "https" {
					log.Printf("[api/middleware] RequireHTTPS: rejected non-TLS request from %s", r.RemoteAddr)
					jsonErr(w, http.StatusForbidden, "HTTPS is required")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ── Security headers ──────────────────────────────────────────────────────────

// SecurityHeaders adds baseline secure HTTP headers to all responses.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'none'")
		next.ServeHTTP(w, r)
	})
}

// ── JWT auth middleware ───────────────────────────────────────────────────────

// RequireAuth validates a Bearer token and enforces access-token use.
// On success the parsed Claims are stored in the request context.
func RequireAuth(jwtCfg *config.JWTConfig) func(http.Handler) http.Handler {
	return RequireTokenUse(jwtCfg, auth.TokenUseAccess)
}

// RequireTokenUse validates a Bearer token and enforces an expected token use.
func RequireTokenUse(jwtCfg *config.JWTConfig, expectedUse string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				jsonErr(w, http.StatusUnauthorized, "Authorization header required")
				return
			}
			if !strings.HasPrefix(header, "Bearer ") {
				jsonErr(w, http.StatusUnauthorized, "Authorization header must be Bearer token")
				return
			}
			tokenStr := strings.TrimPrefix(header, "Bearer ")

			claims, err := auth.ParseAccessToken(tokenStr, jwtCfg)
			if err != nil {
				log.Printf("[api/middleware] RequireAuth: invalid token: %v", err)
				jsonErr(w, http.StatusUnauthorized, "Invalid or expired token")
				return
			}

			if expectedUse != "" {
				claimUse := strings.TrimSpace(strings.ToLower(claims.TokenUse))
				expected := strings.ToLower(expectedUse)

				// Backward compatibility: old tokens without explicit `use` are treated as access.
				if claimUse == "" {
					claimUse = auth.TokenUseAccess
				}

				if claimUse != expected {
					jsonErr(w, http.StatusUnauthorized, "Token is not valid for this endpoint")
					return
				}
			}

			ctx := context.WithValue(r.Context(), ctxClaims, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole wraps RequireAuth and additionally enforces a minimum role.
func RequireRole(jwtCfg *config.JWTConfig, role string) func(http.Handler) http.Handler {
	authMW := RequireTokenUse(jwtCfg, auth.TokenUseAccess)
	return func(next http.Handler) http.Handler {
		return authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := claimsFromCtx(r)
			if claims == nil || claims.Role != role {
				jsonErr(w, http.StatusForbidden, "Insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}

// claimsFromCtx retrieves the JWT Claims stored by RequireAuth. Returns nil
// if the middleware was not applied or the context value is missing.
func claimsFromCtx(r *http.Request) *auth.Claims {
	v := r.Context().Value(ctxClaims)
	if v == nil {
		return nil
	}
	c, _ := v.(*auth.Claims)
	return c
}
