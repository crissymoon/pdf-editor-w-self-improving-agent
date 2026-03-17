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
	FileTools            FileToolsConfig
	OpenAI               ProviderConfig
	DeepSeek             ProviderConfig
	Anthropic            ProviderConfig
	Gemini               ProviderConfig
}

type FileToolsConfig struct {
	Enabled      bool
	SandboxDirs  []string
	MaxReadBytes int
	MaxWriteBytes int
}

type fileSettings struct {
	DefaultProvider string               `json:"default_provider"`
	FileTools       fileToolsSettings    `json:"file_tools"`
	OpenAI          fileProviderSettings `json:"openai"`
	DeepSeek        fileProviderSettings `json:"deepseek"`
	Anthropic       fileProviderSettings `json:"anthropic"`
	Gemini          fileProviderSettings `json:"gemini"`
}

type fileToolsSettings struct {
	Enabled      *bool    `json:"enabled"`
	SandboxDirs  []string `json:"sandbox_dirs"`
	MaxReadBytes int      `json:"max_read_bytes"`
	MaxWriteBytes int     `json:"max_write_bytes"`
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
	settings, settingsBaseDir, err := loadSettingsFile(envString("MCP_SETTINGS_PATH", "settings.json"))
	if err != nil {
		return Config{}, err
	}

	sandboxDirs := resolveSandboxDirs(settings.FileTools.SandboxDirs, settingsBaseDir)
	fileToolsEnabled := len(sandboxDirs) > 0
	if settings.FileTools.Enabled != nil {
		fileToolsEnabled = *settings.FileTools.Enabled
	}

	maxReadBytes := settings.FileTools.MaxReadBytes
	if maxReadBytes <= 0 {
		maxReadBytes = 262144
	}

	maxWriteBytes := settings.FileTools.MaxWriteBytes
	if maxWriteBytes <= 0 {
		maxWriteBytes = 262144
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
		FileTools: FileToolsConfig{
			Enabled:      fileToolsEnabled,
			SandboxDirs:  sandboxDirs,
			MaxReadBytes: maxReadBytes,
			MaxWriteBytes: maxWriteBytes,
		},
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

func loadSettingsFile(pathValue string) (fileSettings, string, error) {
	settingsPath := strings.TrimSpace(pathValue)
	if settingsPath == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return fileSettings{}, "", nil
		}
		return fileSettings{}, cwd, nil
	}

	expanded := expandHome(settingsPath)
	baseDir := filepath.Dir(expanded)
	raw, err := os.ReadFile(expanded)
	if err != nil {
		if os.IsNotExist(err) {
			return fileSettings{}, baseDir, nil
		}
		return fileSettings{}, "", fmt.Errorf("failed to read settings file: %w", err)
	}

	var parsed fileSettings
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return fileSettings{}, "", fmt.Errorf("invalid settings json: %w", err)
	}
	return parsed, baseDir, nil
}

func resolveSandboxDirs(values []string, baseDir string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}

	for _, raw := range values {
		clean := strings.TrimSpace(raw)
		if clean == "" {
			continue
		}

		clean = expandHome(clean)
		if !filepath.IsAbs(clean) {
			clean = filepath.Join(baseDir, clean)
		}

		abs, err := filepath.Abs(clean)
		if err != nil {
			continue
		}

		if _, ok := seen[abs]; ok {
			continue
		}
		seen[abs] = struct{}{}
		out = append(out, abs)
	}

	return out
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
