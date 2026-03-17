package providers

import (
	"net/http"
	"strings"
	"time"

	"xcmpdf/mcp/internal/config"
)

func BuildClients(cfg config.Config) map[string]Provider {
	httpClient := &http.Client{Timeout: cfg.RequestTimeout}
	clients := map[string]Provider{}

	if cfg.OpenAI.APIKey != "" {
		clients["openai"] = NewOpenAIClient(cfg.OpenAI, httpClient)
	}
	if cfg.DeepSeek.APIKey != "" {
		clients["deepseek"] = NewDeepSeekClient(cfg.DeepSeek, httpClient)
	}
	if cfg.Anthropic.APIKey != "" {
		clients["anthropic"] = NewAnthropicClient(cfg.Anthropic, httpClient)
	}
	if cfg.Gemini.APIKey != "" {
		clients["gemini"] = NewGeminiClient(cfg.Gemini, httpClient)
	}

	return clients
}

func pickModel(explicit string, configured []string) string {
	if strings.TrimSpace(explicit) != "" {
		return explicit
	}
	if len(configured) > 0 {
		return configured[0]
	}
	return ""
}

func normalizeBaseURL(base string) string {
	clean := strings.TrimSpace(base)
	clean = strings.TrimSuffix(clean, "/")
	if clean == "" {
		return "https://localhost"
	}
	return clean
}

func withTimeout(base *http.Client, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		return base
	}
	copyClient := *base
	copyClient.Timeout = timeout
	return &copyClient
}
