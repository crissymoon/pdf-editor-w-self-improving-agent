package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"xcmpdf/mcp/internal/config"
)

type anthropicClient struct {
	apiKey  string
	baseURL string
	models  []string
	client  *http.Client
}

func NewAnthropicClient(cfg config.ProviderConfig, client *http.Client) Provider {
	return &anthropicClient{
		apiKey:  cfg.APIKey,
		baseURL: normalizeBaseURL(cfg.BaseURL),
		models:  cfg.Models,
		client:  client,
	}
}

func (c *anthropicClient) Name() string {
	return "anthropic"
}

func (c *anthropicClient) Models(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return c.models, nil
	}

	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return c.models, nil
	}

	if len(parsed.Data) == 0 {
		return c.models, nil
	}

	out := make([]string, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		if item.ID != "" {
			out = append(out, item.ID)
		}
	}
	if len(out) == 0 {
		return c.models, nil
	}
	return out, nil
}

func (c *anthropicClient) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	model := pickModel(req.Model, c.models)
	if model == "" {
		return ChatResponse{}, fmt.Errorf("no model configured for anthropic")
	}

	payload := map[string]any{
		"model":       model,
		"system":      req.System,
		"messages":    convertAnthropicMessages(req.Messages),
		"temperature": req.Temperature,
		"max_tokens":  maxInt(req.MaxTokens, 256),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return ChatResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("content-type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return ChatResponse{}, fmt.Errorf("anthropic chat failed: %s", string(raw))
	}

	var parsed struct {
		Model   string `json:"model"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return ChatResponse{}, err
	}
	if len(parsed.Content) == 0 {
		return ChatResponse{}, fmt.Errorf("anthropic returned no content")
	}

	return ChatResponse{Text: parsed.Content[0].Text, Model: parsed.Model}, nil
}

func convertAnthropicMessages(messages []Message) []map[string]string {
	out := make([]map[string]string, 0, len(messages))
	for _, message := range messages {
		role := message.Role
		if role != "assistant" {
			role = "user"
		}
		out = append(out, map[string]string{
			"role":    role,
			"content": message.Content,
		})
	}
	return out
}

func maxInt(value int, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}
