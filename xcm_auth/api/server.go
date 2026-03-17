package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"xcaliburmoon.net/xcm_auth/addons"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/email"
)

// Server holds all runtime dependencies and the HTTP router.
type Server struct {
	cfg    *config.Config
	store  db.Store
	mailer *email.Mailer
	guard  *addons.PromptGuard
	router *chi.Mux
	http   *http.Server
}

// NewServer creates and configures a Server with all routes wired.
func NewServer(cfg *config.Config, store db.Store, mailer *email.Mailer) *Server {
	s := &Server{
		cfg:    cfg,
		store:  store,
		mailer: mailer,
		guard:  addons.NewPromptGuard(&cfg.PromptGuard),
		router: chi.NewRouter(),
	}
	if s.guard != nil {
		log.Printf("[server] prompt guard add-on enabled mode=%s fail_open=%v", cfg.PromptGuard.Mode, cfg.PromptGuard.FailOpen)
	}
	s.mountMiddleware()
	s.mountRoutes()
	return s
}

// mountMiddleware attaches global middleware to the router.
func (s *Server) mountMiddleware() {
	r := s.router

	// Logging + recovery
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Security
	r.Use(SecurityHeaders)
	r.Use(RequireHTTPS(s.cfg.Security.RequireHTTPS))
	r.Use(CORSMiddleware(s.cfg.Security.CORSOrigins))
}

// mountRoutes registers all application routes.
func (s *Server) mountRoutes() {
	r := s.router

	authH := NewAuthHandlers(s.store, s.cfg, s.mailer, s.guard)
	userH := NewUserHandlers(s.store, s.cfg, s.guard)

	requireAccess := RequireAuth(&s.cfg.JWT)
	requireChallenge := RequireTokenUse(&s.cfg.JWT, "challenge")
	requireAdmin := RequireRole(&s.cfg.JWT, "admin")

	// Health check - no auth
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		jsonOK(w, map[string]string{"status": "ok", "ts": time.Now().UTC().Format(time.RFC3339)})
	})

	// ── /auth ── public endpoints ──────────────────────────────────────────
	r.Route("/auth", func(r chi.Router) {
		r.Post("/register",         authH.Register)
		r.Post("/login",            authH.Login)
		r.Post("/refresh",          authH.Refresh)
		r.Post("/forgot-password",  authH.ForgotPassword)
		r.Post("/reset-password",   authH.ResetPassword)

		// These require the short-lived challenge token (pending 2FA)
		r.Group(func(r chi.Router) {
			r.Use(requireChallenge)
			r.Post("/verify-2fa",   authH.Verify2FA)
			r.Post("/resend-2fa",   authH.Resend2FA)
 		})

		// These require a regular authenticated access token
		r.Group(func(r chi.Router) {
			r.Use(requireAccess)
			r.Post("/verify-email", authH.VerifyEmail)
			r.Post("/logout",       authH.Logout)
			r.Post("/logout-all",   authH.LogoutAll)
		})
	})

	// ── /user ── authenticated endpoints ──────────────────────────────────
	r.Route("/user", func(r chi.Router) {
		r.Use(requireAccess)
		r.Get("/me",        userH.Me)
		r.Get("/sessions",  userH.ListSessions)
		r.Get("/devices",   userH.ListDevices)
		r.Get("/audit",     userH.AuditLog)
	})

	// ── /admin ── admin-only endpoints ────────────────────────────────────
	r.Route("/admin", func(r chi.Router) {
		r.Use(requireAdmin)
		r.Get("/users",         userH.ListUsers)
		r.Post("/users",        userH.AdminCreateUser)
		r.Patch("/users/{id}",  userH.AdminUpdateUser)
		r.Delete("/users/{id}", userH.AdminDeactivateUser)
	})
}

// Routes returns the http.Handler for this server.
func (s *Server) Routes() http.Handler {
	return s.router
}

// Start runs the HTTP server and blocks until it exits.
func (s *Server) Start() error {
	addr := s.cfg.Server.Addr
	log.Printf("[server] listening on %s", addr)
	s.http = &http.Server{
		Addr:              addr,
		Handler:           s.Routes(),
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("server error: %w", err)
	}
	return nil
}

// Shutdown gracefully stops the server with the given context.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.http == nil {
		return nil
	}
	log.Println("[server] shutting down")
	return s.http.Shutdown(ctx)
}
