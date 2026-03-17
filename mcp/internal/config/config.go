package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultServerName    = "xcm-pdf-mcp"
	defaultServerVersion = "0.1.0"
)

type ProviderConfig struct {
	APIKey            string
	BaseURL           string
	Models            []string
	ConversationModel string
	ToolModel         string
}

type Config struct {
	ServerName           string
	ServerVersion        string
	DefaultProvider      string
	MaxConcurrentActions int
	RequestTimeout       time.Duration
	OpenAI               ProviderConfig
	DeepSeek             ProviderConfig
	Anthropic            ProviderConfig
	Gemini               ProviderConfig
}

type fileSettings struct {
	DefaultProvider string               `json:"default_provider"`
	OpenAI          fileProviderSettings `json:"openai"`
	DeepSeek        fileProviderSettings `json:"deepseek"`
	Anthropic       fileProviderSettings `json:"anthropic"`
	Gemini          fileProviderSettings `json:"gemini"`
}

type fileProviderSettings struct {
	APIKey            string   `json:"api_key"`
	KeyFile           string   `json:"key_file"`
	BaseURL           string   `json:"base_url"`
	Models            []string `json:"models"`
	ConversationModel string   `json:"conversation_model"`
	ToolModel         string   `json:"tool_model"`
}

func Load() (Config, error) {
	settings, err := loadSettingsFile(envString("MCP_SETTINGS_PATH", "settings.json"))
	if err != nil {
		return Config{}, err
	}

	maxConcurrent := envInt("MCP_MAX_CONCURRENCY", 8)
	if maxConcurrent < 1 {
		return Config{}, fmt.Errorf("MCP_MAX_CONCURRENCY must be at least 1")
	}

	requestTimeoutSec := envInt("MCP_REQUEST_TIMEOUT_SECONDS", 45)
	if requestTimeoutSec < 5 {
		requestTimeoutSec = 5
	}

	cfg := Config{
		ServerName:           envString("MCP_SERVER_NAME", defaultServerName),
		ServerVersion:        envString("MCP_SERVER_VERSION", defaultServerVersion),
		DefaultProvider:      strings.ToLower(firstNonEmpty(envString("MCP_DEFAULT_PROVIDER", ""), settings.DefaultProvider, "openai")),
		MaxConcurrentActions: maxConcurrent,
		RequestTimeout:       time.Duration(requestTimeoutSec) * time.Second,
		OpenAI: ProviderConfig{
			APIKey:            firstNonEmpty(strings.TrimSpace(os.Getenv("OPENAI_API_KEY")), resolveKey(settings.OpenAI)),
			BaseURL:           firstNonEmpty(strings.TrimSpace(os.Getenv("OPENAI_BASE_URL")), settings.OpenAI.BaseURL, "https://api.openai.com"),
			Models:            firstCSV("OPENAI_MODELS", settings.OpenAI.Models, []string{"gpt-4o-mini", "gpt-4o"}),
			ConversationModel: firstNonEmpty(strings.TrimSpace(os.Getenv("OPENAI_CONVERSATION_MODEL")), settings.OpenAI.ConversationModel, "gpt-4o-mini"),
			ToolModel:         firstNonEmpty(strings.TrimSpace(os.Getenv("OPENAI_TOOL_MODEL")), settings.OpenAI.ToolModel, "gpt-4o"),
		},
		DeepSeek: ProviderConfig{
			APIKey:            firstNonEmpty(strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")), resolveKey(settings.DeepSeek)),
			BaseURL:           firstNonEmpty(strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")), settings.DeepSeek.BaseURL, "https://api.deepseek.com"),
			Models:            firstCSV("DEEPSEEK_MODELS", settings.DeepSeek.Models, []string{"deepseek-chat", "deepseek-reasoner"}),
			ConversationModel: firstNonEmpty(strings.TrimSpace(os.Getenv("DEEPSEEK_CONVERSATION_MODEL")), settings.DeepSeek.ConversationModel),
			ToolModel:         firstNonEmpty(strings.TrimSpace(os.Getenv("DEEPSEEK_TOOL_MODEL")), settings.DeepSeek.ToolModel),
		},
		Anthropic: ProviderConfig{
			APIKey:            firstNonEmpty(strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY")), resolveKey(settings.Anthropic)),
			BaseURL:           firstNonEmpty(strings.TrimSpace(os.Getenv("ANTHROPIC_BASE_URL")), settings.Anthropic.BaseURL, "https://api.anthropic.com"),
			Models:            firstCSV("ANTHROPIC_MODELS", settings.Anthropic.Models, []string{"claude-3-5-haiku-latest", "claude-3-7-sonnet-latest"}),
			ConversationModel: firstNonEmpty(strings.TrimSpace(os.Getenv("ANTHROPIC_CONVERSATION_MODEL")), settings.Anthropic.ConversationModel),
			ToolModel:         firstNonEmpty(strings.TrimSpace(os.Getenv("ANTHROPIC_TOOL_MODEL")), settings.Anthropic.ToolModel),
		},
		Gemini: ProviderConfig{
			APIKey:            firstNonEmpty(strings.TrimSpace(os.Getenv("GEMINI_API_KEY")), resolveKey(settings.Gemini)),
			BaseURL:           firstNonEmpty(strings.TrimSpace(os.Getenv("GEMINI_BASE_URL")), settings.Gemini.BaseURL, "https://generativelanguage.googleapis.com"),
			Models:            firstCSV("GEMINI_MODELS", settings.Gemini.Models, []string{"gemini-1.5-flash", "gemini-1.5-pro"}),
			ConversationModel: firstNonEmpty(strings.TrimSpace(os.Getenv("GEMINI_CONVERSATION_MODEL")), settings.Gemini.ConversationModel),
			ToolModel:         firstNonEmpty(strings.TrimSpace(os.Getenv("GEMINI_TOOL_MODEL")), settings.Gemini.ToolModel),
		},
	}

	return cfg, nil
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func envCSV(key string, fallback []string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(part)
		if clean != "" {
			out = append(out, clean)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstCSV(key string, fromSettings []string, fallback []string) []string {
	rawEnv := strings.TrimSpace(os.Getenv(key))
	if rawEnv != "" {
		return envCSV(key, fallback)
	}
	if len(fromSettings) > 0 {
		return fromSettings
	}
	return fallback
}

func loadSettingsFile(pathValue string) (fileSettings, error) {
	settingsPath := strings.TrimSpace(pathValue)
	if settingsPath == "" {
		return fileSettings{}, nil
	}

	expanded := expandHome(settingsPath)
	raw, err := os.ReadFile(expanded)
	if err != nil {
		if os.IsNotExist(err) {
			return fileSettings{}, nil
		}
		return fileSettings{}, fmt.Errorf("failed to read settings file: %w", err)
	}

	var parsed fileSettings
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return fileSettings{}, fmt.Errorf("invalid settings json: %w", err)
	}
	return parsed, nil
}

func resolveKey(provider fileProviderSettings) string {
	if strings.TrimSpace(provider.APIKey) != "" {
		return strings.TrimSpace(provider.APIKey)
	}
	if strings.TrimSpace(provider.KeyFile) == "" {
		return ""
	}
	raw, err := os.ReadFile(expandHome(strings.TrimSpace(provider.KeyFile)))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func expandHome(pathValue string) string {
	if !strings.HasPrefix(pathValue, "~/") {
		return pathValue
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return pathValue
	}
	return filepath.Join(home, pathValue[2:])
}
