package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"xcaliburmoon.net/xcm_auth/addons"
	"xcaliburmoon.net/xcm_auth/auth"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/email"
	"xcaliburmoon.net/xcm_auth/models"
)

// AuthHandlers provides all authentication endpoint handlers.
type AuthHandlers struct {
	store  db.Store
	cfg    *config.Config
	mailer *email.Mailer
	guard  *addons.PromptGuard
}

// NewAuthHandlers creates an AuthHandlers with the given dependencies.
func NewAuthHandlers(store db.Store, cfg *config.Config, mailer *email.Mailer, guard *addons.PromptGuard) *AuthHandlers {
	return &AuthHandlers{store: store, cfg: cfg, mailer: mailer, guard: guard}
}

// ── POST /auth/register ───────────────────────────────────────────────────────

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register creates a new user account and sends an email-verify code.
func (h *AuthHandlers) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email    = strings.ToLower(strings.TrimSpace(req.Email))

	var errs []string
	if req.Username == "" { errs = append(errs, "username is required") }
	if req.Email == ""    { errs = append(errs, "email is required") }
	if req.Password == "" { errs = append(errs, "password is required") }
	if len(errs) > 0 {
		jsonValidation(w, errs)
		return
	}
	if err := auth.PasswordStrength(req.Password); err != nil {
		jsonValidation(w, []string{err.Error()})
		return
	}
	if h.blockByPromptGuard(w, r, "register", req.Username, req.Email) {
		return
	}

	// Duplicate check
	ctx := r.Context()
	if existing, err := h.store.GetUserByEmail(ctx, req.Email); err != nil {
		log.Printf("[api/auth] Register: db error on GetUserByEmail: %v", err)
		jsonErr(w, http.StatusInternalServerError, "registration failed")
		return
	} else if existing != nil {
		jsonErr(w, http.StatusConflict, "an account with this email already exists")
		return
	}
	if existing, err := h.store.GetUserByUsername(ctx, req.Username); err != nil {
		log.Printf("[api/auth] Register: db error on GetUserByUsername: %v", err)
		jsonErr(w, http.StatusInternalServerError, "registration failed")
		return
	} else if existing != nil {
		jsonErr(w, http.StatusConflict, "an account with this username already exists")
		return
	}

	hash, err := auth.HashPassword(req.Password, h.cfg.Security.BcryptCost)
	if err != nil {
		log.Printf("[api/auth] Register: HashPassword: %v", err)
		jsonErr(w, http.StatusInternalServerError, "registration failed")
		return
	}

	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         models.RoleUser,
		IsActive:     true,
		IsVerified:   false,
	}
	id, err := h.store.CreateUser(ctx, user)
	if err != nil {
		log.Printf("[api/auth] Register: CreateUser: %v", err)
		jsonErr(w, http.StatusInternalServerError, "registration failed")
		return
	}
	user.ID = id

	h.auditLog(ctx, id, auth.ClientIP(r), "register", "user created", true)

	// Send email verification code
	code, err := auth.GenerateTwoFACode(ctx, h.store, id, models.PurposeEmailVerify, &h.cfg.TwoFA, h.cfg.Security.BcryptCost)
	if err != nil {
		log.Printf("[api/auth] Register: GenerateTwoFACode: %v", err)
		// Non-fatal: account exists, user can request a new code
	} else if emailErr := h.mailer.SendWelcome(req.Email, req.Username, code); emailErr != nil {
		log.Printf("[api/auth] Register: SendWelcome to %q: %v", req.Email, emailErr)
	}

	jsonCreated(w, user.Safe())
}

// ── POST /auth/login (step 1) ─────────────────────────────────────────────────

type loginRequest struct {
	Identifier string `json:"identifier"` // username OR email
	Password   string `json:"password"`
}

type loginResponse struct {
	TwoFARequired bool   `json:"twofa_required"`
	ChallengeToken string `json:"challenge_token,omitempty"` // opaque token to present at /auth/verify-2fa
	User           *models.SafeUser `json:"user,omitempty"` // populated only if 2FA is disabled
	Tokens         *models.TokenPair `json:"tokens,omitempty"` // populated only if 2FA is disabled
}

// Login validates credentials and either issues tokens (2FA off) or sends a
// 2FA code and returns a short-lived challenge token (2FA on).
func (h *AuthHandlers) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Identifier = strings.TrimSpace(req.Identifier)
	if h.blockByPromptGuard(w, r, "login", req.Identifier) {
		return
	}
	ctx := r.Context()
	ip  := auth.ClientIP(r)

	// ── Rate limit per IP ──────────────────────────────────────────────────
	ipKey := "ip:" + ip
	rl, err := auth.CheckRateLimit(ctx, h.store, ipKey, "login", &h.cfg.Rate)
	if err != nil {
		log.Printf("[api/auth] Login: CheckRateLimit ip: %v", err)
	}
	if rl.Blocked {
		h.auditLog(ctx, 0, ip, "login_blocked_ip", "rate limited", false)
		remaining := time.Until(rl.BlockedUntil).Round(time.Second)
		jsonErr(w, http.StatusTooManyRequests, fmt.Sprintf("Too many failed attempts from this IP. Try again in %s.", remaining))
		return
	}

	// ── Look up user ───────────────────────────────────────────────────────
	var user *models.User
	if strings.Contains(req.Identifier, "@") {
		user, err = h.store.GetUserByEmail(ctx, strings.ToLower(req.Identifier))
	} else {
		user, err = h.store.GetUserByUsername(ctx, req.Identifier)
	}
	if err != nil {
		log.Printf("[api/auth] Login: db lookup: %v", err)
		jsonErr(w, http.StatusInternalServerError, "login failed")
		return
	}

	authFail := func() {
		// Always record attempt before returning to avoid timing attacks
		_ = auth.RecordAttempt(ctx, h.store, ipKey, "login", &h.cfg.Rate)
		if user != nil {
			acctKey := fmt.Sprintf("user:%d", user.ID)
			_ = auth.RecordAttempt(ctx, h.store, acctKey, "login_account", &h.cfg.Rate)
		}
		h.auditLog(ctx, 0, ip, "login_fail", req.Identifier, false)
		// Deliberately vague message to prevent user enumeration
		jsonErr(w, http.StatusUnauthorized, "invalid credentials")
	}

	if user == nil {
		authFail()
		return
	}

	if !user.IsActive {
		log.Printf("[api/auth] Login: account %d is inactive", user.ID)
		authFail()
		return
	}

	// ── Rate limit per account ─────────────────────────────────────────────
	acctKey := fmt.Sprintf("user:%d", user.ID)
	acctRL, err := auth.CheckRateLimit(ctx, h.store, acctKey, "login_account", &h.cfg.Rate)
	if err != nil {
		log.Printf("[api/auth] Login: CheckRateLimit account: %v", err)
	}
	if acctRL.Blocked {
		h.auditLog(ctx, user.ID, ip, "login_blocked_account", "rate limited", false)
		remaining := time.Until(acctRL.BlockedUntil).Round(time.Second)
		jsonErr(w, http.StatusTooManyRequests, fmt.Sprintf("Account temporarily locked. Try again in %s.", remaining))
		return
	}

	// ── Verify password ────────────────────────────────────────────────────
	ok, err := auth.CheckPassword(user.PasswordHash, req.Password)
	if err != nil {
		log.Printf("[api/auth] Login: CheckPassword error for user %d: %v", user.ID, err)
		jsonErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	if !ok {
		authFail()
		return
	}

	// Password correct - clear rate counters
	auth.ClearAttempts(ctx, h.store, ipKey, "login")
	auth.ClearAttempts(ctx, h.store, acctKey, "login_account")

	// ── 2FA ───────────────────────────────────────────────────────────────
	if h.cfg.TwoFA.Enabled {
		code, err := auth.GenerateTwoFACode(ctx, h.store, user.ID, models.PurposeLogin, &h.cfg.TwoFA, h.cfg.Security.BcryptCost)
		if err != nil {
			log.Printf("[api/auth] Login: GenerateTwoFACode for user %d: %v", user.ID, err)
			jsonErr(w, http.StatusInternalServerError, "could not initiate 2FA")
			return
		}
		if emailErr := h.mailer.Send2FACode(user.Email, code, "login"); emailErr != nil {
			log.Printf("[api/auth] Login: Send2FACode to %q: %v", user.Email, emailErr)
		}

		// Issue a short-lived challenge token so the client knows which user to verify
		challengeToken, _, err := auth.IssueChallengeToken(user, &config.JWTConfig{
			AccessSecret:        h.cfg.JWT.AccessSecret,
			AccessExpiryMinutes: h.cfg.TwoFA.ExpiryMinutes,
		})
		if err != nil {
			log.Printf("[api/auth] Login: IssueAccessToken (challenge) for user %d: %v", user.ID, err)
			jsonErr(w, http.StatusInternalServerError, "login failed")
			return
		}

		h.auditLog(ctx, user.ID, ip, "login_2fa_sent", "2FA code sent to "+user.Email, true)
		safe := user.Safe()
		jsonOK(w, loginResponse{
			TwoFARequired:  true,
			ChallengeToken: challengeToken,
			User:           &safe,
		})
		return
	}

	// 2FA disabled - issue tokens immediately
	tokens, err := h.issueTokens(ctx, user, r)
	if err != nil {
		log.Printf("[api/auth] Login (no-2FA): issueTokens for user %d: %v", user.ID, err)
		jsonErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	_ = h.store.UpdateUserLastLogin(ctx, user.ID, time.Now().UTC())
	h.auditLog(ctx, user.ID, ip, "login_ok", "2FA disabled", true)
	safe := user.Safe()
	jsonOK(w, loginResponse{
		TwoFARequired: false,
		User:          &safe,
		Tokens:        tokens,
	})
}

// ── POST /auth/verify-2fa (step 2) ───────────────────────────────────────────

type verify2FARequest struct {
	Code string `json:"code"`
}

// Verify2FA checks the submitted code against the stored hash.
// On success it issues a full token pair and clears the challenge.
func (h *AuthHandlers) Verify2FA(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "challenge token required")
		return
	}

	var req verify2FARequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	ip  := auth.ClientIP(r)

	result, err := auth.VerifyTwoFACode(ctx, h.store, claims.UserID, models.PurposeLogin, req.Code, &h.cfg.TwoFA)
	if err != nil {
		log.Printf("[api/auth] Verify2FA: VerifyTwoFACode for user %d: %v", claims.UserID, err)
		jsonErr(w, http.StatusInternalServerError, "2FA verification failed")
		return
	}

	switch {
	case result.NotFound:
		jsonErr(w, http.StatusBadRequest, "no active 2FA code found - please request a new code")
		return
	case result.Expired:
		h.auditLog(ctx, claims.UserID, ip, "2fa_expired", "", false)
		jsonErr(w, http.StatusUnauthorized, "2FA code has expired - please request a new one")
		return
	case result.MaxAttempts:
		h.auditLog(ctx, claims.UserID, ip, "2fa_max_attempts", "", false)
		jsonErr(w, http.StatusTooManyRequests, "too many incorrect attempts - please request a new code")
		return
	case !result.OK:
		h.auditLog(ctx, claims.UserID, ip, "2fa_wrong_code", "", false)
		jsonErr(w, http.StatusUnauthorized, "incorrect verification code")
		return
	}

	// Code verified - load full user and issue tokens
	user, err := h.store.GetUserByID(ctx, claims.UserID)
	if err != nil || user == nil {
		log.Printf("[api/auth] Verify2FA: GetUserByID %d: %v", claims.UserID, err)
		jsonErr(w, http.StatusInternalServerError, "login failed")
		return
	}

	tokens, err := h.issueTokens(ctx, user, r)
	if err != nil {
		log.Printf("[api/auth] Verify2FA: issueTokens for user %d: %v", user.ID, err)
		jsonErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	_ = h.store.UpdateUserLastLogin(ctx, user.ID, time.Now().UTC())
	h.auditLog(ctx, user.ID, ip, "login_ok", "2FA verified", true)
	safe := user.Safe()
	jsonOK(w, loginResponse{User: &safe, Tokens: tokens})
}

// ── POST /auth/refresh ────────────────────────────────────────────────────────

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh rotates the refresh token and issues a new access token.
func (h *AuthHandlers) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.RefreshToken == "" {
		jsonErr(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	ctx := r.Context()
	ip  := auth.ClientIP(r)

	hash := auth.HashRefreshToken(req.RefreshToken)
	sess, err := h.store.GetSessionByTokenHash(ctx, hash)
	if err != nil {
		log.Printf("[api/auth] Refresh: GetSessionByTokenHash: %v", err)
		jsonErr(w, http.StatusInternalServerError, "token refresh failed")
		return
	}
	if sess == nil || sess.Revoked || sess.ExpiresAt.Before(time.Now().UTC()) {
		jsonErr(w, http.StatusUnauthorized, "refresh token is invalid or expired")
		return
	}

	user, err := h.store.GetUserByID(ctx, sess.UserID)
	if err != nil || user == nil || !user.IsActive {
		log.Printf("[api/auth] Refresh: GetUserByID %d: %v", sess.UserID, err)
		jsonErr(w, http.StatusUnauthorized, "account not found or inactive")
		return
	}

	// Revoke old session and issue a new one (refresh token rotation)
	if err := h.store.RevokeSession(ctx, sess.ID, "rotated"); err != nil {
		log.Printf("[api/auth] Refresh: RevokeSession %d: %v", sess.ID, err)
	}
	tokens, err := h.issueTokens(ctx, user, r)
	if err != nil {
		log.Printf("[api/auth] Refresh: issueTokens for user %d: %v", user.ID, err)
		jsonErr(w, http.StatusInternalServerError, "token refresh failed")
		return
	}
	h.auditLog(ctx, user.ID, ip, "token_refreshed", "", true)
	jsonOK(w, tokens)
}

// ── POST /auth/resend-2fa ─────────────────────────────────────────────────────

// Resend2FA generates and sends a new 2FA code for the user in the challenge token.
func (h *AuthHandlers) Resend2FA(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "challenge token required")
		return
	}

	ctx := r.Context()
	ip  := auth.ClientIP(r)

	// Rate limit resend attempts
	key := fmt.Sprintf("user:%d", claims.UserID)
	rl, err := auth.CheckRateLimit(ctx, h.store, key, "resend_2fa", &h.cfg.Rate)
	if err != nil {
		log.Printf("[api/auth] Resend2FA: CheckRateLimit: %v", err)
	}
	if rl.Blocked {
		jsonErr(w, http.StatusTooManyRequests, "too many resend requests - try again later")
		return
	}
	_ = auth.RecordAttempt(ctx, h.store, key, "resend_2fa", &h.cfg.Rate)

	user, err := h.store.GetUserByID(ctx, claims.UserID)
	if err != nil || user == nil {
		log.Printf("[api/auth] Resend2FA: GetUserByID %d: %v", claims.UserID, err)
		jsonErr(w, http.StatusInternalServerError, "resend failed")
		return
	}

	code, err := auth.GenerateTwoFACode(ctx, h.store, user.ID, models.PurposeLogin, &h.cfg.TwoFA, h.cfg.Security.BcryptCost)
	if err != nil {
		log.Printf("[api/auth] Resend2FA: GenerateTwoFACode: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not generate code")
		return
	}
	if emailErr := h.mailer.Send2FACode(user.Email, code, "login"); emailErr != nil {
		log.Printf("[api/auth] Resend2FA: Send2FACode: %v", emailErr)
	}
	h.auditLog(ctx, user.ID, ip, "2fa_resent", "", true)
	jsonMsg(w, "a new verification code has been sent to your email address")
}

// ── POST /auth/logout ─────────────────────────────────────────────────────────

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Logout revokes the given refresh token.
func (h *AuthHandlers) Logout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	claims := claimsFromCtx(r)
	ip  := auth.ClientIP(r)

	if req.RefreshToken != "" {
		hash := auth.HashRefreshToken(req.RefreshToken)
		sess, err := h.store.GetSessionByTokenHash(ctx, hash)
		if err != nil {
			log.Printf("[api/auth] Logout: GetSessionByTokenHash: %v", err)
		} else if sess != nil {
			if err := h.store.RevokeSession(ctx, sess.ID, "logout"); err != nil {
				log.Printf("[api/auth] Logout: RevokeSession %d: %v", sess.ID, err)
			}
		}
	}

	userID := int64(0)
	if claims != nil {
		userID = claims.UserID
	}
	h.auditLog(ctx, userID, ip, "logout", "", true)
	jsonMsg(w, "logged out successfully")
}

// ── POST /auth/logout-all ─────────────────────────────────────────────────────

// LogoutAll revokes all active sessions for the authenticated user.
func (h *AuthHandlers) LogoutAll(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	ctx := r.Context()
	ip  := auth.ClientIP(r)
	if err := h.store.RevokeAllUserSessions(ctx, claims.UserID, "logout_all"); err != nil {
		log.Printf("[api/auth] LogoutAll: RevokeAllUserSessions user %d: %v", claims.UserID, err)
		jsonErr(w, http.StatusInternalServerError, "failed to revoke sessions")
		return
	}
	h.auditLog(ctx, claims.UserID, ip, "logout_all", "", true)
	jsonMsg(w, "all sessions revoked")
}

// ── POST /auth/forgot-password ────────────────────────────────────────────────

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPassword sends a password-reset code to the given email.
// Always returns 200 to prevent user enumeration.
func (h *AuthHandlers) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req forgotPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	ip  := auth.ClientIP(r)

	// Rate limit this endpoint hard
	key := "ip:" + ip
	rl, _ := auth.CheckRateLimit(ctx, h.store, key, "resend_2fa", &h.cfg.Rate)
	if rl.Blocked {
		jsonMsg(w, "if an account with that email exists, a reset code has been sent")
		return
	}
	_ = auth.RecordAttempt(ctx, h.store, key, "resend_2fa", &h.cfg.Rate)

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if h.blockByPromptGuard(w, r, "forgot-password", email) {
		return
	}
	user, err := h.store.GetUserByEmail(ctx, email)
	if err != nil {
		log.Printf("[api/auth] ForgotPassword: GetUserByEmail: %v", err)
	}
	if user != nil && user.IsActive {
		code, err := auth.GenerateTwoFACode(ctx, h.store, user.ID, models.PurposePassReset, &h.cfg.TwoFA, h.cfg.Security.BcryptCost)
		if err != nil {
			log.Printf("[api/auth] ForgotPassword: GenerateTwoFACode for user %d: %v", user.ID, err)
		} else if emailErr := h.mailer.SendPasswordReset(user.Email, code); emailErr != nil {
			log.Printf("[api/auth] ForgotPassword: SendPasswordReset to %q: %v", user.Email, emailErr)
		}
		h.auditLog(ctx, user.ID, ip, "password_reset_requested", "", true)
	}
	// Return the same message regardless of whether the user exists
	jsonMsg(w, "if an account with that email exists, a reset code has been sent")
}

// ── POST /auth/reset-password ─────────────────────────────────────────────────

type resetPasswordRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"new_password"`
}

// ResetPassword verifies the reset code and sets the new password.
func (h *AuthHandlers) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req resetPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	ip  := auth.ClientIP(r)

	if err := auth.PasswordStrength(req.NewPassword); err != nil {
		jsonValidation(w, []string{err.Error()})
		return
	}
	if h.blockByPromptGuard(w, r, "reset-password", req.Email, req.Code) {
		return
	}

	user, err := h.store.GetUserByEmail(ctx, strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil || user == nil {
		// Do not reveal whether user exists
		jsonErr(w, http.StatusUnauthorized, "invalid or expired reset code")
		return
	}

	result, err := auth.VerifyTwoFACode(ctx, h.store, user.ID, models.PurposePassReset, req.Code, &h.cfg.TwoFA)
	if err != nil {
		log.Printf("[api/auth] ResetPassword: VerifyTwoFACode: %v", err)
		jsonErr(w, http.StatusInternalServerError, "reset failed")
		return
	}
	if !result.OK {
		h.auditLog(ctx, user.ID, ip, "password_reset_fail", "", false)
		jsonErr(w, http.StatusUnauthorized, "invalid or expired reset code")
		return
	}

	hash, err := auth.HashPassword(req.NewPassword, h.cfg.Security.BcryptCost)
	if err != nil {
		log.Printf("[api/auth] ResetPassword: HashPassword: %v", err)
		jsonErr(w, http.StatusInternalServerError, "reset failed")
		return
	}
	if err := h.store.UpdateUserPassword(ctx, user.ID, hash); err != nil {
		log.Printf("[api/auth] ResetPassword: UpdateUserPassword: %v", err)
		jsonErr(w, http.StatusInternalServerError, "reset failed")
		return
	}
	// Revoke all sessions - force re-login on all devices
	_ = h.store.RevokeAllUserSessions(ctx, user.ID, "password_reset")
	h.auditLog(ctx, user.ID, ip, "password_reset_ok", "", true)
	jsonMsg(w, "password has been reset - please log in with your new password")
}

// ── POST /auth/verify-email ───────────────────────────────────────────────────

type verifyEmailRequest struct {
	Code string `json:"code"`
}

// VerifyEmail marks the authenticated user's email as verified.
func (h *AuthHandlers) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	var req verifyEmailRequest
	if err := decodeJSON(r, &req); err != nil {
		jsonErr(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	ip  := auth.ClientIP(r)

	result, err := auth.VerifyTwoFACode(ctx, h.store, claims.UserID, models.PurposeEmailVerify, req.Code, &h.cfg.TwoFA)
	if err != nil {
		log.Printf("[api/auth] VerifyEmail: VerifyTwoFACode: %v", err)
		jsonErr(w, http.StatusInternalServerError, "verification failed")
		return
	}
	if !result.OK {
		jsonErr(w, http.StatusUnauthorized, "invalid or expired verification code")
		return
	}
	if err := h.store.SetUserVerified(ctx, claims.UserID, true); err != nil {
		log.Printf("[api/auth] VerifyEmail: SetUserVerified: %v", err)
		jsonErr(w, http.StatusInternalServerError, "verification failed")
		return
	}
	h.auditLog(ctx, claims.UserID, ip, "email_verified", "", true)
	jsonMsg(w, "email address verified successfully")
}

// ── helpers ───────────────────────────────────────────────────────────────────

// issueTokens creates a new device record, mints a token pair, and stores the
// session in the database.
func (h *AuthHandlers) issueTokens(ctx context.Context, user *models.User, r *http.Request) (*models.TokenPair, error) {
	device, err := auth.GetOrCreateDevice(ctx, h.store, user.ID, r)
	if err != nil {
		log.Printf("[api/auth] issueTokens: GetOrCreateDevice for user %d: %v", user.ID, err)
		// Not fatal - use device ID 0 as fallback
	}
	deviceID := int64(0)
	if device != nil {
		deviceID = device.ID
	}

	accessToken, expiresAt, err := auth.IssueAccessToken(user, &h.cfg.JWT)
	if err != nil {
		return nil, fmt.Errorf("IssueAccessToken: %w", err)
	}

	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("GenerateRefreshToken: %w", err)
	}

	ua := r.UserAgent()
	if len(ua) > 512 {
		ua = ua[:512]
	}
	sess := &models.Session{
		UserID:           user.ID,
		RefreshTokenHash: hashRefresh,
		DeviceID:         deviceID,
		IPAddress:        auth.ClientIP(r),
		UserAgent:        ua,
		ExpiresAt:        auth.RefreshExpiresAt(&h.cfg.JWT),
	}
	if _, err := h.store.CreateSession(ctx, sess); err != nil {
		return nil, fmt.Errorf("CreateSession: %w", err)
	}

	return &models.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresAt:    expiresAt.Unix(),
		TokenType:    "Bearer",
	}, nil
}

// auditLog writes an audit entry, logging any storage error without returning.
func (h *AuthHandlers) auditLog(ctx context.Context, userID int64, ip, action, detail string, success bool) {
	entry := &models.AuditLog{
		UserID:    userID,
		IPAddress: ip,
		Action:    action,
		Detail:    detail,
		Success:   success,
	}
	if err := h.store.CreateAuditLog(ctx, entry); err != nil {
		log.Printf("[api/auth] auditLog: CreateAuditLog (%q): %v", action, err)
	}
}

func (h *AuthHandlers) blockByPromptGuard(w http.ResponseWriter, r *http.Request, endpoint string, values ...string) bool {
	if h.guard == nil || !h.guard.ShouldCheck(endpoint) {
		return false
	}

	decision, err := h.guard.GuardInput(r.Context(), endpoint, values...)
	if err != nil {
		log.Printf("[api/auth] prompt guard endpoint=%s error=%v", endpoint, err)
		if h.guard.FailOpen() {
			return false
		}
		jsonErr(w, http.StatusServiceUnavailable, "optional prompt guard unavailable")
		return true
	}

	if h.guard.ShouldBlock(decision) {
		log.Printf("[api/auth] prompt guard blocked endpoint=%s label=%s confidence=%.4f", endpoint, decision.Label, decision.Confidence)
		jsonErr(w, http.StatusBadRequest, "request blocked by optional security add-on")
		return true
	}
	return false
}
