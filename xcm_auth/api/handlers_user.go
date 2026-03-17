package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"xcaliburmoon.net/xcm_auth/addons"
	"xcaliburmoon.net/xcm_auth/auth"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/models"
)

// UserHandlers provides authenticated user management endpoints.
type UserHandlers struct {
	store db.Store
	cfg   *config.Config
	guard *addons.PromptGuard
}

// NewUserHandlers creates a UserHandlers.
func NewUserHandlers(store db.Store, cfg *config.Config, guard *addons.PromptGuard) *UserHandlers {
	return &UserHandlers{store: store, cfg: cfg, guard: guard}
}

// ── GET /user/me ──────────────────────────────────────────────────────────────

// Me returns the profile of the currently authenticated user.
func (h *UserHandlers) Me(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	user, err := h.store.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("[api/user] Me: GetUserByID %d: %v", claims.UserID, err)
		jsonErr(w, http.StatusInternalServerError, "could not fetch user")
		return
	}
	if user == nil {
		jsonErr(w, http.StatusNotFound, "user not found")
		return
	}
	jsonOK(w, user.Safe())
}

// ── GET /user/sessions ────────────────────────────────────────────────────────

// ListSessions returns all active sessions for the authenticated user.
func (h *UserHandlers) ListSessions(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	sessions, err := h.store.ListSessionsByUser(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("[api/user] ListSessions: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not fetch sessions")
		return
	}
	jsonOK(w, sessions)
}

// ── GET /user/devices ─────────────────────────────────────────────────────────

// ListDevices returns all known devices for the authenticated user.
func (h *UserHandlers) ListDevices(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	devices, err := h.store.ListDevicesByUser(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("[api/user] ListDevices: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not fetch devices")
		return
	}
	jsonOK(w, devices)
}

// ── GET /user/audit ───────────────────────────────────────────────────────────

// AuditLog returns recent audit log entries for the authenticated user.
func (h *UserHandlers) AuditLog(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		jsonErr(w, http.StatusUnauthorized, "authentication required")
		return
	}
	limit  := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)
	entries, err := h.store.ListAuditLogByUser(r.Context(), claims.UserID, limit, offset)
	if err != nil {
		log.Printf("[api/user] AuditLog: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not fetch audit log")
		return
	}
	jsonOK(w, entries)
}

// ── GET /admin/users (admin only) ─────────────────────────────────────────────

// ListUsers returns all users. Admin role required (enforced by RequireRole middleware).
func (h *UserHandlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	limit  := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)
	users, err := h.store.ListUsers(r.Context(), limit, offset)
	if err != nil {
		log.Printf("[api/user] ListUsers: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not fetch users")
		return
	}
	type row struct {
		ID          int64  `json:"id"`
		Username    string `json:"username"`
		Email       string `json:"email"`
		Role        string `json:"role"`
		IsActive    bool   `json:"is_active"`
		IsVerified  bool   `json:"is_verified"`
	}
	var out []row
	for _, u := range users {
		out = append(out, row{
			ID: u.ID, Username: u.Username, Email: u.Email,
			Role: u.Role, IsActive: u.IsActive, IsVerified: u.IsVerified,
		})
	}
	jsonOK(w, out)
}

// ── POST /admin/users (admin only) ───────────────────────────────────────────

type adminCreateUserReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// AdminCreateUser creates a new user account. Admin role required.
// Admin-created accounts are marked verified immediately (no email step needed).
func (h *UserHandlers) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req adminCreateUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[api/user] AdminCreateUser: decode body: %v", err)
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email    = strings.TrimSpace(strings.ToLower(req.Email))
	req.Role     = strings.TrimSpace(req.Role)
	if req.Username == "" || req.Email == "" || req.Password == "" {
		jsonErr(w, http.StatusBadRequest, "username, email, and password are required")
		return
	}
	if h.guard != nil && h.guard.ShouldCheck("admin-create-user") {
		decision, err := h.guard.GuardInput(r.Context(), "admin-create-user", req.Username, req.Email, req.Role)
		if err != nil {
			log.Printf("[api/user] AdminCreateUser: prompt guard error: %v", err)
			if !h.guard.FailOpen() {
				jsonErr(w, http.StatusServiceUnavailable, "optional prompt guard unavailable")
				return
			}
		} else if h.guard.ShouldBlock(decision) {
			jsonErr(w, http.StatusBadRequest, "request blocked by optional security add-on")
			return
		}
	}
	if req.Role != models.RoleAdmin && req.Role != models.RoleUser {
		req.Role = models.RoleUser
	}
	if existing, _ := h.store.GetUserByEmail(r.Context(), req.Email); existing != nil {
		jsonErr(w, http.StatusConflict, "email already registered")
		return
	}
	if existing, _ := h.store.GetUserByUsername(r.Context(), req.Username); existing != nil {
		jsonErr(w, http.StatusConflict, "username already registered")
		return
	}
	hash, err := auth.HashPassword(req.Password, h.cfg.Security.BcryptCost)
	if err != nil {
		log.Printf("[api/user] AdminCreateUser: HashPassword: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not hash password")
		return
	}
	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
		IsActive:     true,
		IsVerified:   true,
	}
	id, err := h.store.CreateUser(r.Context(), user)
	if err != nil {
		log.Printf("[api/user] AdminCreateUser: CreateUser: %v", err)
		jsonErr(w, http.StatusInternalServerError, "could not create user")
		return
	}
	user.ID = id
	log.Printf("[api/user] AdminCreateUser: created id=%d username=%q role=%s", id, req.Username, req.Role)
	jsonOK(w, user.Safe())
}

// ── PATCH /admin/users/{id} (admin only) ──────────────────────────────────────

type adminUpdateUserReq struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

// AdminUpdateUser lets an admin change a user's role or active status.
func (h *UserHandlers) AdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		jsonErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req adminUpdateUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[api/user] AdminUpdateUser: decode body: %v", err)
		jsonErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	user, err := h.store.GetUserByID(r.Context(), id)
	if err != nil || user == nil {
		log.Printf("[api/user] AdminUpdateUser: GetUserByID %d: %v", id, err)
		jsonErr(w, http.StatusNotFound, "user not found")
		return
	}
	if req.Role != nil {
		if *req.Role != models.RoleAdmin && *req.Role != models.RoleUser {
			jsonErr(w, http.StatusBadRequest, "role must be admin or user")
			return
		}
		user.Role = *req.Role
	}
	if req.IsActive != nil {
		user.IsActive = *req.IsActive
	}
	if err := h.store.UpdateUser(r.Context(), user); err != nil {
		log.Printf("[api/user] AdminUpdateUser: UpdateUser %d: %v", id, err)
		jsonErr(w, http.StatusInternalServerError, "could not update user")
		return
	}
	log.Printf("[api/user] AdminUpdateUser: id=%d role=%s active=%v", id, user.Role, user.IsActive)
	jsonOK(w, user.Safe())
}

// ── DELETE /admin/users/{id} (admin only) ─────────────────────────────────────

// AdminDeactivateUser sets is_active=false (soft delete).
// An admin cannot deactivate their own account.
func (h *UserHandlers) AdminDeactivateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		jsonErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	claims := claimsFromCtx(r)
	if claims != nil && claims.UserID == id {
		jsonErr(w, http.StatusForbidden, "cannot deactivate your own account")
		return
	}
	if err := h.store.SetUserActive(r.Context(), id, false); err != nil {
		log.Printf("[api/user] AdminDeactivateUser: SetUserActive %d: %v", id, err)
		jsonErr(w, http.StatusInternalServerError, "could not deactivate user")
		return
	}
	log.Printf("[api/user] AdminDeactivateUser: deactivated id=%d", id)
	jsonOK(w, map[string]any{"id": id, "is_active": false})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func queryInt(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil || i < 0 {
		return def
	}
	return i
}
