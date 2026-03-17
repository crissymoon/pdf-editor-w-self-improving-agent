package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"xcmpdf/mcp/internal/config"
)

type geminiClient struct {
	apiKey  string
	baseURL string
	models  []string
	client  *http.Client
}

func NewGeminiClient(cfg config.ProviderConfig, client *http.Client) Provider {
	return &geminiClient{
		apiKey:  cfg.APIKey,
		baseURL: normalizeBaseURL(cfg.BaseURL),
		models:  cfg.Models,
		client:  client,
	}
}

func (c *geminiClient) Name() string {
	return "gemini"
}

func (c *geminiClient) Models(ctx context.Context) ([]string, error) {
	endpoint := fmt.Sprintf("%s/v1beta/models?key=%s", c.baseURL, url.QueryEscape(c.apiKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return c.models, nil
	}

	var parsed struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return c.models, nil
	}
	if len(parsed.Models) == 0 {
		return c.models, nil
	}

	out := make([]string, 0, len(parsed.Models))
	for _, model := range parsed.Models {
		clean := strings.TrimPrefix(model.Name, "models/")
		if clean != "" {
			out = append(out, clean)
		}
	}
	if len(out) == 0 {
		return c.models, nil
	}
	return out, nil
}

func (c *geminiClient) Chat(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	model := pickModel(req.Model, c.models)
	if model == "" {
		return ChatResponse{}, fmt.Errorf("no model configured for gemini")
	}

	endpoint := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", c.baseURL, url.PathEscape(model), url.QueryEscape(c.apiKey))

	payload := map[string]any{
		"contents": geminiMessages(req.Messages),
		"generationConfig": map[string]any{
			"temperature": req.Temperature,
		},
	}
	if req.System != "" {
		payload["systemInstruction"] = map[string]any{
			"parts": []map[string]string{{"text": req.System}},
		}
	}
	if req.MaxTokens > 0 {
		payload["generationConfig"].(map[string]any)["maxOutputTokens"] = req.MaxTokens
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return ChatResponse{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq.Header.Set("content-type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return ChatResponse{}, fmt.Errorf("gemini chat failed: %s", string(raw))
	}

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return ChatResponse{}, err
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return ChatResponse{}, fmt.Errorf("gemini returned no candidates")
	}

	return ChatResponse{Text: parsed.Candidates[0].Content.Parts[0].Text, Model: model}, nil
}

func geminiMessages(messages []Message) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		role := "user"
		if message.Role == "assistant" {
			role = "model"
		}
		out = append(out, map[string]any{
			"role": role,
			"parts": []map[string]string{{
				"text": message.Content,
			}},
		})
	}
	return out
}
