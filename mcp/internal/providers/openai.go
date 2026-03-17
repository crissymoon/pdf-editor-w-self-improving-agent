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

type openAIClient struct {
	apiKey  string
	baseURL string
	models  []string
	client  *http.Client
}

func NewOpenAIClient(cfg config.ProviderConfig, client *http.Client) Provider {
	return &openAIClient{
		apiKey:  cfg.APIKey,
		baseURL: normalizeBaseURL(cfg.BaseURL),
		models:  cfg.Models,
		client:  client,
	}
}

func (c *openAIClient) Name() string {
	return "openai"
}

func (c *openAIClient) Models(ctx context.Context) ([]string, error) {
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
		return nil, fmt.Errorf("openai models failed: %s", string(body))
	}

	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
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

func (c *openAIClient) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	model := pickModel(req.Model, c.models)
	if model == "" {
		return ChatResponse{}, fmt.Errorf("no model configured for openai")
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
		return ChatResponse{}, fmt.Errorf("openai chat failed: %s", string(raw))
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
		return ChatResponse{}, fmt.Errorf("openai returned no choices")
	}

	return ChatResponse{Text: parsed.Choices[0].Message.Content, Model: parsed.Model}, nil
}

func convertMessages(system string, messages []Message) []map[string]string {
	result := make([]map[string]string, 0, len(messages)+1)
	if system != "" {
		result = append(result, map[string]string{
			"role":    "system",
			"content": system,
		})
	}
	for _, message := range messages {
		result = append(result, map[string]string{
			"role":    message.Role,
			"content": message.Content,
		})
	}
	return result
}
