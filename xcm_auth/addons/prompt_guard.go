package addons

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"xcaliburmoon.net/xcm_auth/config"
)

// PromptGuard is an optional client to prompt_inj_guard.
// It is disabled unless PROMPT_GUARD_ENABLED=true.
type PromptGuard struct {
	enabled        bool
	url            string
	mode           string
	failOpen       bool
	blockThreshold float64
	endpoints      map[string]struct{}
	client         *http.Client
}

type classifyRequest struct {
	Text string `json:"text"`
}

type classifyResponse struct {
	OK         bool    `json:"ok"`
	Label      string  `json:"label"`
	Confidence float64 `json:"confidence"`
	Flagged    bool    `json:"flagged"`
	Error      string  `json:"error"`
}

type healthResponse struct {
	OK     bool   `json:"ok"`
	Status string `json:"status"`
	Error  string `json:"error"`
}

type GuardDecision struct {
	Label      string
	Confidence float64
	Flagged    bool
}

func NewPromptGuard(cfg *config.PromptGuardConfig) *PromptGuard {
	if cfg == nil || !cfg.Enabled {
		return nil
	}

	endpointSet := make(map[string]struct{}, len(cfg.Endpoints))
	for _, e := range cfg.Endpoints {
		e = strings.ToLower(strings.TrimSpace(e))
		if e != "" {
			endpointSet[e] = struct{}{}
		}
	}

	return &PromptGuard{
		enabled:        cfg.Enabled,
		url:            strings.TrimRight(strings.TrimSpace(cfg.URL), "/"),
		mode:           strings.ToLower(strings.TrimSpace(cfg.Mode)),
		failOpen:       cfg.FailOpen,
		blockThreshold: cfg.BlockThreshold,
		endpoints:      endpointSet,
		client: &http.Client{
			Timeout: cfg.Timeout,
		},
	}
}

func (g *PromptGuard) Enabled() bool {
	return g != nil && g.enabled
}

func (g *PromptGuard) ShouldCheck(endpoint string) bool {
	if !g.Enabled() {
		return false
	}
	if len(g.endpoints) == 0 {
		return true
	}
	_, ok := g.endpoints[strings.ToLower(strings.TrimSpace(endpoint))]
	return ok
}

func (g *PromptGuard) FailOpen() bool {
	if g == nil {
		return true
	}
	return g.failOpen
}

func (g *PromptGuard) ShouldBlock(d GuardDecision) bool {
	if !g.Enabled() {
		return false
	}
	if g.mode != "block" {
		return false
	}
	if !d.Flagged {
		return false
	}
	return d.Confidence >= g.blockThreshold
}

func (g *PromptGuard) Classify(ctx context.Context, endpoint string, text string) (GuardDecision, error) {
	decision := GuardDecision{Label: "clean", Confidence: 0, Flagged: false}
	if !g.Enabled() || !g.ShouldCheck(endpoint) {
		return decision, nil
	}
	if strings.TrimSpace(text) == "" {
		return decision, nil
	}
	if g.url == "" {
		return decision, fmt.Errorf("prompt guard URL is empty")
	}

	payload, err := json.Marshal(classifyRequest{Text: text})
	if err != nil {
		return decision, fmt.Errorf("marshal classify request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.url+"/classify", bytes.NewReader(payload))
	if err != nil {
		return decision, fmt.Errorf("build classify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return decision, fmt.Errorf("call prompt guard: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return decision, fmt.Errorf("read prompt guard response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return decision, fmt.Errorf("prompt guard status %d", resp.StatusCode)
	}

	var out classifyResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return decision, fmt.Errorf("decode prompt guard response: %w", err)
	}
	if !out.OK {
		if out.Error == "" {
			out.Error = "unknown guard API error"
		}
		return decision, fmt.Errorf("prompt guard API error: %s", out.Error)
	}

	decision.Label = out.Label
	decision.Confidence = out.Confidence
	decision.Flagged = out.Flagged
	return decision, nil
}

func (g *PromptGuard) GuardInput(ctx context.Context, endpoint string, values ...string) (GuardDecision, error) {
	decision := GuardDecision{Label: "clean", Confidence: 0, Flagged: false}
	if !g.ShouldCheck(endpoint) {
		return decision, nil
	}

	parts := make([]string, 0, len(values))
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			parts = append(parts, v)
		}
	}
	if len(parts) == 0 {
		return decision, nil
	}

	joined := strings.Join(parts, " | ")
	dec, err := g.Classify(ctx, endpoint, joined)
	if err != nil {
		return dec, err
	}
	if dec.Flagged {
		log.Printf("[addons/prompt_guard] endpoint=%s flagged label=%s confidence=%.4f", endpoint, dec.Label, dec.Confidence)
	}
	return dec, nil
}

func (g *PromptGuard) HealthCheck(ctx context.Context) error {
	if !g.Enabled() {
		return nil
	}
	if g.url == "" {
		return fmt.Errorf("prompt guard URL is empty")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.url+"/health", nil)
	if err != nil {
		return fmt.Errorf("build health request: %w", err)
	}

	resp, err := g.client.Do(req)
	if err != nil {
		return fmt.Errorf("call prompt guard health: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read prompt guard health: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("prompt guard health status %d", resp.StatusCode)
	}

	var out healthResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return fmt.Errorf("decode prompt guard health response: %w", err)
	}

	if !out.OK && strings.ToLower(strings.TrimSpace(out.Status)) != "ok" {
		if out.Error != "" {
			return fmt.Errorf("prompt guard unhealthy: %s", out.Error)
		}
		return fmt.Errorf("prompt guard unhealthy")
	}

	return nil
}
