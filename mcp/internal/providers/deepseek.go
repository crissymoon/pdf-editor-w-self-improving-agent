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

type deepSeekClient struct {
	apiKey  string
	baseURL string
	models  []string
	client  *http.Client
}

func NewDeepSeekClient(cfg config.ProviderConfig, client *http.Client) Provider {
	return &deepSeekClient{
		apiKey:  cfg.APIKey,
		baseURL: normalizeBaseURL(cfg.BaseURL),
		models:  cfg.Models,
		client:  client,
	}
}

func (c *deepSeekClient) Name() string {
	return "deepseek"
}

func (c *deepSeekClient) Models(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/v1/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("deepseek models failed: %s", string(body))
	}

	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	models := make([]string, 0, len(parsed.Data))
	for _, model := range parsed.Data {
		if model.ID != "" {
			models = append(models, model.ID)
		}
	}
	if len(models) == 0 {
		return c.models, nil
	}
	return models, nil
}

func (c *deepSeekClient) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	model := pickModel(req.Model, c.models)
	if model == "" {
		return ChatResponse{}, fmt.Errorf("no model configured for deepseek")
	}

	payload := map[string]any{
		"model":       model,
		"messages":    convertMessages(req.System, req.Messages),
		"temperature": req.Temperature,
	}
	if req.MaxTokens > 0 {
		payload["max_tokens"] = req.MaxTokens
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return ChatResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return ChatResponse{}, fmt.Errorf("deepseek chat failed: %s", string(raw))
	}

	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return ChatResponse{}, err
	}
	if len(parsed.Choices) == 0 {
		return ChatResponse{}, fmt.Errorf("deepseek returned no choices")
	}

	return ChatResponse{Text: parsed.Choices[0].Message.Content, Model: parsed.Model}, nil
}
