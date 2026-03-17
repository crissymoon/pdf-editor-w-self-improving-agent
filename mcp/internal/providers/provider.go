package providers

import "context"

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model       string
	System      string
	Messages    []Message
	Temperature float64
	MaxTokens   int
}

type ChatResponse struct {
	Text  string
	Model string
}

type Provider interface {
	Chat(ctx context.Context, req ChatRequest) (ChatResponse, error)
	Models(ctx context.Context) ([]string, error)
	Name() string
}
