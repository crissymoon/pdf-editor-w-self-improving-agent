package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"xcaliburmoon.net/xcm_auth/addons"
	"xcaliburmoon.net/xcm_auth/api"
	"xcaliburmoon.net/xcm_auth/config"
	"xcaliburmoon.net/xcm_auth/db"
	"xcaliburmoon.net/xcm_auth/email"
)

func main() {
	// ── Config ────────────────────────────────────────────────────────────────
	envPath := ".env"
	if v := os.Getenv("ENV_FILE"); v != "" {
		envPath = v
	}
	cfg := config.Load(envPath)
	if err := cfg.Validate(); err != nil {
		if cfg.Security.Profile == "strict" {
			log.Fatalf("[main] strict profile config validate failed: %v", err)
		}
		log.Printf("[main] WARN: config validate: %v", err)
	}

	if cfg.PromptGuard.Enabled && cfg.PromptGuard.StartupHealthCheck {
		guard := addons.NewPromptGuard(&cfg.PromptGuard)
		healthCtx, cancel := context.WithTimeout(context.Background(), cfg.PromptGuard.Timeout)
		err := guard.HealthCheck(healthCtx)
		cancel()
		if err != nil {
			if cfg.PromptGuard.FailOpen {
				log.Printf("[main] WARN: prompt guard health check failed (fail-open): %v", err)
			} else {
				log.Fatalf("[main] prompt guard health check failed (fail-closed): %v", err)
			}
		} else {
			log.Printf("[main] prompt guard health check passed")
		}
	}

	// ── Database ──────────────────────────────────────────────────────────────
	var store db.Store
	var dbErr error
	switch cfg.DB.Driver {
	case "sqlite", "sqlite3", "":
		store, dbErr = db.OpenSQLite(cfg.DB.DSN)
	case "mysql":
		store, dbErr = db.OpenMySQL(cfg.DB.DSN)
	case "postgres", "postgresql":
		store, dbErr = db.OpenPostgres(cfg.DB.DSN)
	default:
		log.Fatalf("[main] unsupported DB_DRIVER %q - supported: sqlite, mysql, postgres", cfg.DB.Driver)
	}
	if dbErr != nil {
		log.Fatalf("[main] open DB (%s): %v", cfg.DB.Driver, dbErr)
	}
	defer func() {
		if err := store.Close(); err != nil {
			log.Printf("[main] store.Close: %v", err)
		}
	}()

	ctx := context.Background()
	if err := store.Migrate(ctx); err != nil {
		log.Fatalf("[main] database migration failed: %v", err)
	}
	log.Println("[main] database migration complete")

	// ── Email ─────────────────────────────────────────────────────────────────
	mailer := email.NewMailer(&cfg.Email, &cfg.Security)

	// ── HTTP server ───────────────────────────────────────────────────────────
	srv := api.NewServer(cfg, store, mailer)

	// Graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("[main] shutdown signal received")
		shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutCtx); err != nil {
			log.Printf("[main] server shutdown error: %v", err)
		}
		if err := store.Close(); err != nil {
			log.Printf("[main] store close on shutdown: %v", err)
		}
	}()

	log.Printf("[main] xcm_auth starting on %s", cfg.Server.Addr)
	if err := srv.Start(); err != nil {
		log.Printf("[main] server stopped: %v", err)
	}
}
