// Package config loads and validates all environment-driven configuration.
// Fallback values are applied for optional fields so the app can start
// safely in dev mode with only a minimal .env file.
package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config is the top-level config struct passed to every subsystem.
type Config struct {
	Server   ServerConfig
	DB       DBConfig
	JWT      JWTConfig
	TwoFA    TwoFAConfig
	Email    EmailConfig
	Rate     RateConfig
	Security SecurityConfig
	PromptGuard PromptGuardConfig
}

type ServerConfig struct {
	Addr         string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type DBConfig struct {
	// Driver: "sqlite", "mysql", "postgres"
	Driver string
	DSN    string
}

type JWTConfig struct {
	AccessSecret        string
	RefreshSecret       string
	AccessExpiryMinutes int
	RefreshExpiryDays   int
}

type TwoFAConfig struct {
	Enabled       bool
	CodeLength    int
	ExpiryMinutes int
	MaxAttempts   int
}

type EmailConfig struct {
	Host     string
	Port     int
	User     string
	Pass     string
	From     string
	UseTLS   bool
}

type RateConfig struct {
	IPLoginMax               int
	IPLoginWindowMinutes     int
	AccountLoginMax          int
	AccountLoginWindowMinutes int
	BlockDurationMinutes     int
}

type SecurityConfig struct {
	BcryptCost   int
	RequireHTTPS bool
	CORSOrigins  []string
	AppName      string
	AppURL       string
	Profile      string
}

type PromptGuardConfig struct {
	Enabled        bool
	URL            string
	Timeout        time.Duration
	Mode           string
	FailOpen       bool
	BlockThreshold float64
	StartupHealthCheck bool
	Endpoints      []string
}

// Load reads the .env file at envPath (if it exists) then populates Config
// from environment variables. Missing required fields cause a fatal log.
func Load(envPath string) *Config {
	// godotenv does not error on missing file - it just skips it
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("[config] .env file not loaded (%s): %v - falling back to environment", envPath, err)
	}

	cfg := &Config{}
	var errs []string

	// ── Server ───────────────────────────────────────────────────────────────
	cfg.Server.Addr = envStr("SERVER_ADDR", ":8080")
	cfg.Server.ReadTimeout  = time.Duration(envInt("SERVER_READ_TIMEOUT", 15)) * time.Second
	cfg.Server.WriteTimeout = time.Duration(envInt("SERVER_WRITE_TIMEOUT", 30)) * time.Second
	cfg.Server.IdleTimeout  = time.Duration(envInt("SERVER_IDLE_TIMEOUT", 60)) * time.Second

	// ── DB ───────────────────────────────────────────────────────────────────
	cfg.DB.Driver = envStr("DB_DRIVER", "sqlite")
	cfg.DB.DSN    = envStr("DB_DSN", "./xcm_auth.db")
	if cfg.DB.Driver == "" {
		errs = append(errs, "DB_DRIVER must be set")
	}

	// ── JWT ──────────────────────────────────────────────────────────────────
	cfg.JWT.AccessSecret  = envStr("JWT_ACCESS_SECRET", "")
	cfg.JWT.RefreshSecret = envStr("JWT_REFRESH_SECRET", "")
	if cfg.JWT.AccessSecret == "" || cfg.JWT.AccessSecret == "CHANGE_ME_ACCESS_SECRET_64_CHARS_HEX" {
		log.Println("[config] WARNING: JWT_ACCESS_SECRET is not set - using insecure dev default. DO NOT use this in production.")
		cfg.JWT.AccessSecret = "dev_insecure_access_secret_do_not_use_in_prod_xcm_auth_2026"
	}
	if cfg.JWT.RefreshSecret == "" || cfg.JWT.RefreshSecret == "CHANGE_ME_REFRESH_SECRET_64_CHARS_HEX" {
		log.Println("[config] WARNING: JWT_REFRESH_SECRET is not set - using insecure dev default. DO NOT use this in production.")
		cfg.JWT.RefreshSecret = "dev_insecure_refresh_secret_do_not_use_in_prod_xcm_auth_2026"
	}
	cfg.JWT.AccessExpiryMinutes = envInt("JWT_ACCESS_EXPIRY_MINUTES", 15)
	cfg.JWT.RefreshExpiryDays   = envInt("JWT_REFRESH_EXPIRY_DAYS", 7)

	// ── 2FA ──────────────────────────────────────────────────────────────────
	cfg.TwoFA.Enabled       = envBool("TWOFA_ENABLED", true)
	cfg.TwoFA.CodeLength    = envInt("TWOFA_CODE_LENGTH", 6)
	cfg.TwoFA.ExpiryMinutes = envInt("TWOFA_EXPIRY_MINUTES", 10)
	cfg.TwoFA.MaxAttempts   = envInt("TWOFA_MAX_ATTEMPTS", 3)
	if !cfg.TwoFA.Enabled {
		log.Println("[config] WARNING: 2FA is DISABLED. This should never be the case in production.")
	}

	// ── Email ─────────────────────────────────────────────────────────────────
	cfg.Email.Host   = envStr("SMTP_HOST", "")
	cfg.Email.Port   = envInt("SMTP_PORT", 587)
	cfg.Email.User   = envStr("SMTP_USER", "")
	cfg.Email.Pass   = envStr("SMTP_PASS", "")
	cfg.Email.From   = envStr("SMTP_FROM", "noreply@localhost")
	cfg.Email.UseTLS = envBool("SMTP_TLS", true)
	if cfg.TwoFA.Enabled && cfg.Email.Host == "" {
		log.Println("[config] WARNING: SMTP_HOST not set but 2FA is enabled. Email delivery will fail. Set TWOFA_ENABLED=false for local dev.")
	}

	// ── Rate ──────────────────────────────────────────────────────────────────
	cfg.Rate.IPLoginMax               = envInt("RATE_IP_LOGIN_MAX", 10)
	cfg.Rate.IPLoginWindowMinutes     = envInt("RATE_IP_LOGIN_WINDOW_MINUTES", 15)
	cfg.Rate.AccountLoginMax          = envInt("RATE_ACCOUNT_LOGIN_MAX", 5)
	cfg.Rate.AccountLoginWindowMinutes = envInt("RATE_ACCOUNT_LOGIN_WINDOW_MINUTES", 15)
	cfg.Rate.BlockDurationMinutes     = envInt("RATE_BLOCK_DURATION_MINUTES", 30)

	// ── Security ─────────────────────────────────────────────────────────────
	cfg.Security.BcryptCost   = envInt("BCRYPT_COST", 12)
	cfg.Security.RequireHTTPS = envBool("REQUIRE_HTTPS", false)
	originsStr := envStr("CORS_ORIGINS", "*")
	for _, o := range strings.Split(originsStr, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.Security.CORSOrigins = append(cfg.Security.CORSOrigins, o)
		}
	}
	cfg.Security.AppName = envStr("APP_NAME", "XCM Auth")
	cfg.Security.AppURL  = envStr("APP_URL", "http://localhost:8080")
	cfg.Security.Profile = strings.ToLower(strings.TrimSpace(envStr("SECURITY_PROFILE", "dev")))
	if cfg.Security.Profile != "dev" && cfg.Security.Profile != "strict" {
		log.Printf("[config] SECURITY_PROFILE=%q invalid, using dev", cfg.Security.Profile)
		cfg.Security.Profile = "dev"
	}

	// ── Optional prompt-injection guard add-on ───────────────────────────────
	cfg.PromptGuard.Enabled = envBool("PROMPT_GUARD_ENABLED", false)
	cfg.PromptGuard.URL = envStr("PROMPT_GUARD_URL", "http://127.0.0.1:8765")
	cfg.PromptGuard.Timeout = time.Duration(envInt("PROMPT_GUARD_TIMEOUT_MS", 1200)) * time.Millisecond
	cfg.PromptGuard.Mode = strings.ToLower(strings.TrimSpace(envStr("PROMPT_GUARD_MODE", "monitor")))
	if cfg.PromptGuard.Mode != "monitor" && cfg.PromptGuard.Mode != "block" {
		log.Printf("[config] PROMPT_GUARD_MODE=%q invalid, using monitor", cfg.PromptGuard.Mode)
		cfg.PromptGuard.Mode = "monitor"
	}
	cfg.PromptGuard.FailOpen = envBool("PROMPT_GUARD_FAIL_OPEN", true)
	cfg.PromptGuard.StartupHealthCheck = envBool("PROMPT_GUARD_STARTUP_HEALTHCHECK", false)
	cfg.PromptGuard.BlockThreshold = envFloat("PROMPT_GUARD_BLOCK_THRESHOLD", 0.90)
	if cfg.PromptGuard.BlockThreshold < 0.0 || cfg.PromptGuard.BlockThreshold > 1.0 {
		log.Printf("[config] PROMPT_GUARD_BLOCK_THRESHOLD=%f out of range [0,1], using 0.90", cfg.PromptGuard.BlockThreshold)
		cfg.PromptGuard.BlockThreshold = 0.90
	}
	cfg.PromptGuard.Endpoints = envCSV("PROMPT_GUARD_ENDPOINTS", []string{
		"register", "login", "forgot-password", "reset-password", "admin-create-user",
	})

	if cfg.Security.Profile == "strict" {
		cfg.Security.RequireHTTPS = true
		cfg.PromptGuard.FailOpen = false
		cfg.PromptGuard.StartupHealthCheck = true
		log.Printf("[config] strict profile enabled: REQUIRE_HTTPS=true PROMPT_GUARD_FAIL_OPEN=false PROMPT_GUARD_STARTUP_HEALTHCHECK=true")
	}

	if len(errs) > 0 {
		log.Fatalf("[config] Fatal configuration errors:\n  - %s", strings.Join(errs, "\n  - "))
	}

	log.Printf("[config] Loaded. Driver=%s 2FA=%v HTTPS=%v BcryptCost=%d",
		cfg.DB.Driver, cfg.TwoFA.Enabled, cfg.Security.RequireHTTPS, cfg.Security.BcryptCost)
	return cfg
}

// ── helpers ───────────────────────────────────────────────────────────────────

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		i, err := strconv.Atoi(v)
		if err != nil {
			log.Printf("[config] %s: cannot parse %q as int, using default %d", key, v, def)
			return def
		}
		return i
	}
	return def
}

func envBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		log.Printf("[config] %s: cannot parse %q as bool, using default %v", key, v, def)
		return def
	}
	return b
}

// Validate returns a human-readable error if the config is unsafe for production.
func (c *Config) Validate() error {
	var issues []string
	if c.Security.BcryptCost < 12 {
		issues = append(issues, fmt.Sprintf("BCRYPT_COST=%d is below minimum 12", c.Security.BcryptCost))
	}
	if !c.TwoFA.Enabled {
		issues = append(issues, "TWOFA_ENABLED=false - 2FA is off")
	}
	if c.JWT.AccessExpiryMinutes > 60 {
		issues = append(issues, fmt.Sprintf("JWT_ACCESS_EXPIRY_MINUTES=%d - access tokens should be short-lived", c.JWT.AccessExpiryMinutes))
	}
	if c.Security.Profile == "strict" {
		if !c.Security.RequireHTTPS {
			issues = append(issues, "SECURITY_PROFILE=strict requires REQUIRE_HTTPS=true")
		}
		if !c.PromptGuard.Enabled {
			issues = append(issues, "SECURITY_PROFILE=strict requires PROMPT_GUARD_ENABLED=true")
		}
		if c.PromptGuard.FailOpen {
			issues = append(issues, "SECURITY_PROFILE=strict requires PROMPT_GUARD_FAIL_OPEN=false")
		}
		if !c.PromptGuard.StartupHealthCheck {
			issues = append(issues, "SECURITY_PROFILE=strict requires PROMPT_GUARD_STARTUP_HEALTHCHECK=true")
		}
		for _, origin := range c.Security.CORSOrigins {
			if strings.TrimSpace(origin) == "*" {
				issues = append(issues, "SECURITY_PROFILE=strict does not allow CORS_ORIGINS=*")
				break
			}
		}
	}
	if len(issues) > 0 {
		return fmt.Errorf("security issues detected:\n  - %s", strings.Join(issues, "\n  - "))
	}
	if c.PromptGuard.Enabled && strings.TrimSpace(c.PromptGuard.URL) == "" {
		return fmt.Errorf("security issues detected:\n  - PROMPT_GUARD_ENABLED=true but PROMPT_GUARD_URL is empty")
	}
	return nil
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			log.Printf("[config] %s: cannot parse %q as float, using default %f", key, v, def)
			return def
		}
		return f
	}
	return def
}

func envCSV(key string, def []string) []string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return def
	}
	return out
}
