package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"xcmpdf/mcp/internal/config"
	"xcmpdf/mcp/internal/providers"
)

const (
	jsonRPCVersion = "2.0"
)

var nullID = json.RawMessage([]byte("null"))

type Server struct {
	cfg      config.Config
	clients  map[string]providers.Provider
	sem      chan struct{}
	writeMu  sync.Mutex
	requests sync.WaitGroup
}

func NewServer(cfg config.Config, clients map[string]providers.Provider) *Server {
	return &Server{
		cfg:     cfg,
		clients: clients,
		sem:     make(chan struct{}, cfg.MaxConcurrentActions),
	}
}

func (s *Server) Run(ctx context.Context, input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
	for {
		payload, err := ReadFrame(reader)
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		var request Request
		if err := json.Unmarshal(payload, &request); err != nil {
			s.sendError(output, nullID, -32700, "Parse error")
			continue
		}

		if request.JSONRPC != "" && request.JSONRPC != jsonRPCVersion {
			id := normalizeID(request.ID)
			s.sendError(output, id, -32600, "Invalid Request")
			continue
		}

		if request.ID == nil {
			continue
		}

		s.requests.Add(1)
		go func(req Request) {
			defer s.requests.Done()
			s.handleRequest(ctx, output, req)
		}(request)
	}

	s.requests.Wait()
	return nil
}

func (s *Server) handleRequest(ctx context.Context, output io.Writer, request Request) {
	select {
	case s.sem <- struct{}{}:
		defer func() {
			<-s.sem
		}()
	case <-ctx.Done():
		return
	}

	id := normalizeID(request.ID)
	requestCtx, cancel := context.WithTimeout(ctx, s.cfg.RequestTimeout)
	defer cancel()

	switch request.Method {
	case "initialize":
		s.sendResult(output, id, map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]any{
				"tools": map[string]any{
					"listChanged": false,
				},
			},
			"serverInfo": map[string]string{
				"name":    s.cfg.ServerName,
				"version": s.cfg.ServerVersion,
			},
		})
	case "tools/list":
		s.sendResult(output, id, map[string]any{
			"tools": s.toolDefinitions(),
		})
	case "tools/call":
		result, code, err := s.handleToolCall(requestCtx, request.Params)
		if err != nil {
			s.sendError(output, id, code, err.Error())
			return
		}
		s.sendResult(output, id, result)
	default:
		s.sendError(output, id, -32601, "Method not found")
	}
}

func (s *Server) handleToolCall(ctx context.Context, rawParams json.RawMessage) (any, int, error) {
	var params struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(rawParams, &params); err != nil {
		return nil, -32602, fmt.Errorf("invalid params")
	}
	if params.Name == "" {
		return nil, -32602, fmt.Errorf("tool name is required")
	}

	switch params.Name {
	case "server.health":
		return map[string]any{
			"content": []map[string]string{{
				"type": "text",
				"text": fmt.Sprintf("ok, providers=%s", strings.Join(s.availableProviders(), ",")),
			}},
		}, 0, nil
	case "ai.models":
		providerName := s.resolveProvider(getString(params.Arguments, "provider"))
		client, ok := s.clients[providerName]
		if !ok {
			return nil, -32602, fmt.Errorf("provider not configured: %s", providerName)
		}
		models, err := client.Models(ctx)
		if err != nil {
			return nil, -32001, err
		}
		payload, _ := json.Marshal(map[string]any{
			"provider": providerName,
			"models":   models,
		})
		return map[string]any{
			"content": []map[string]string{{
				"type": "text",
				"text": string(payload),
			}},
		}, 0, nil
	case "ai.chat":
		providerName := s.resolveProvider(getString(params.Arguments, "provider"))
		client, ok := s.clients[providerName]
		if !ok {
			return nil, -32602, fmt.Errorf("provider not configured: %s", providerName)
		}

		model := getString(params.Arguments, "model")
		if model == "" {
			workload := strings.ToLower(getString(params.Arguments, "workload"))
			model = s.defaultModelForWorkload(providerName, workload)
		}

		messages := parseMessages(params.Arguments)
		prompt := getString(params.Arguments, "prompt")
		if len(messages) == 0 && prompt != "" {
			messages = append(messages, providers.Message{Role: "user", Content: prompt})
		}
		if len(messages) == 0 {
			return nil, -32602, fmt.Errorf("prompt or messages are required")
		}

		response, err := client.Chat(ctx, providers.ChatRequest{
			Model:       model,
			System:      getString(params.Arguments, "system"),
			Messages:    messages,
			Temperature: getFloat(params.Arguments, "temperature", 0.2),
			MaxTokens:   getInt(params.Arguments, "max_tokens", 512),
		})
		if err != nil {
			return nil, -32001, err
		}

		return map[string]any{
			"content": []map[string]string{{
				"type": "text",
				"text": response.Text,
			}},
			"metadata": map[string]any{
				"provider": providerName,
				"model":    response.Model,
			},
		}, 0, nil
	default:
		return nil, -32601, fmt.Errorf("tool not found: %s", params.Name)
	}
}

func (s *Server) resolveProvider(explicit string) string {
	if strings.TrimSpace(explicit) != "" {
		return strings.ToLower(strings.TrimSpace(explicit))
	}
	return strings.ToLower(strings.TrimSpace(s.cfg.DefaultProvider))
}

func (s *Server) availableProviders() []string {
	names := make([]string, 0, len(s.clients))
	for name := range s.clients {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (s *Server) toolDefinitions() []map[string]any {
	return []map[string]any{
		{
			"name":        "server.health",
			"description": "Returns server status and enabled providers.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			"name":        "ai.models",
			"description": "Lists models for a configured provider.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"provider": map[string]any{"type": "string", "enum": []string{"openai", "deepseek", "anthropic", "gemini"}},
				},
			},
		},
		{
			"name":        "ai.chat",
			"description": "Generates chat output with OpenAI, DeepSeek, Anthropic, or Gemini.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"provider":    map[string]any{"type": "string", "enum": []string{"openai", "deepseek", "anthropic", "gemini"}},
					"model":       map[string]any{"type": "string"},
					"workload":    map[string]any{"type": "string", "enum": []string{"conversation", "tools", "heavy"}},
					"system":      map[string]any{"type": "string"},
					"prompt":      map[string]any{"type": "string"},
					"temperature": map[string]any{"type": "number"},
					"max_tokens":  map[string]any{"type": "integer"},
					"messages": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"role":    map[string]any{"type": "string"},
								"content": map[string]any{"type": "string"},
							},
						},
					},
				},
			},
		},
	}
}

func (s *Server) sendResult(output io.Writer, id json.RawMessage, result any) {
	response := Response{JSONRPC: jsonRPCVersion, ID: id, Result: result}
	s.send(output, response)
}

func (s *Server) sendError(output io.Writer, id json.RawMessage, code int, message string) {
	response := Response{JSONRPC: jsonRPCVersion, ID: id, Error: &RPCError{Code: code, Message: message}}
	s.send(output, response)
}

func (s *Server) send(output io.Writer, response Response) {
	payload, err := EncodeResponse(response)
	if err != nil {
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_ = WriteFrame(output, payload)
}

func normalizeID(id *json.RawMessage) json.RawMessage {
	if id == nil {
		return nullID
	}
	return *id
}

func parseMessages(arguments map[string]any) []providers.Message {
	messagesRaw, ok := arguments["messages"]
	if !ok {
		return nil
	}

	list, ok := messagesRaw.([]any)
	if !ok {
		return nil
	}

	out := make([]providers.Message, 0, len(list))
	for _, item := range list {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		role := getString(entry, "role")
		content := getString(entry, "content")
		if role == "" || content == "" {
			continue
		}
		out = append(out, providers.Message{Role: role, Content: content})
	}
	return out
}

func getString(arguments map[string]any, key string) string {
	value, ok := arguments[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func getInt(arguments map[string]any, key string, fallback int) int {
	value, ok := arguments[key]
	if !ok {
		return fallback
	}
	switch typed := value.(type) {
	case float64:
		if typed > 0 {
			return int(typed)
		}
	case int:
		if typed > 0 {
			return typed
		}
	}
	return fallback
}

func getFloat(arguments map[string]any, key string, fallback float64) float64 {
	value, ok := arguments[key]
	if !ok {
		return fallback
	}
	number, ok := value.(float64)
	if !ok {
		return fallback
	}
	if number < 0 {
		return fallback
	}
	return number
}

func (s *Server) defaultModelForWorkload(provider string, workload string) string {
	configMap := map[string]config.ProviderConfig{
		"openai":    s.cfg.OpenAI,
		"deepseek":  s.cfg.DeepSeek,
		"anthropic": s.cfg.Anthropic,
		"gemini":    s.cfg.Gemini,
	}

	providerConfig, ok := configMap[provider]
	if !ok {
		return ""
	}

	if workload == "tools" || workload == "heavy" {
		if providerConfig.ToolModel != "" {
			return providerConfig.ToolModel
		}
	}

	if providerConfig.ConversationModel != "" {
		return providerConfig.ConversationModel
	}

	if len(providerConfig.Models) > 0 {
		return providerConfig.Models[0]
	}

	return ""
}

func TimeoutForTests() time.Duration {
	return 150 * time.Millisecond
}
