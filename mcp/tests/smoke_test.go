package tests

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"xcmpdf/mcp/internal/config"
	"xcmpdf/mcp/internal/mcp"
	"xcmpdf/mcp/internal/providers"
)

func TestSmoke_MCPInitializeToolsAndHealth(t *testing.T) {
	t.Parallel()

	cfg := config.Config{
		ServerName:           "xcm-pdf-mcp",
		ServerVersion:        "test",
		DefaultProvider:      "openai",
		MaxConcurrentActions: 4,
		RequestTimeout:       2 * time.Second,
	}
	server := mcp.NewServer(cfg, map[string]providers.Provider{})

	inbound := bytes.NewBuffer(nil)
	outbound := bytes.NewBuffer(nil)

	writeRequest(t, inbound, map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params":  map[string]any{},
	})
	writeRequest(t, inbound, map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
	})
	writeRequest(t, inbound, map[string]any{
		"jsonrpc": "2.0",
		"id":      3,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "server.health",
			"arguments": map[string]any{},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := server.Run(ctx, bytes.NewReader(inbound.Bytes()), outbound); err != nil {
		t.Fatalf("server run failed: %v", err)
	}

	responses := readResponses(t, outbound.Bytes(), 3)

	if _, ok := responses[1]["result"]; !ok {
		t.Fatalf("initialize response missing result")
	}

	toolsResult, ok := responses[2]["result"].(map[string]any)
	if !ok {
		t.Fatalf("tools/list response shape invalid")
	}
	tools, ok := toolsResult["tools"].([]any)
	if !ok || len(tools) < 3 {
		t.Fatalf("expected at least 3 tools, got %v", toolsResult["tools"])
	}

	healthResult, ok := responses[3]["result"].(map[string]any)
	if !ok {
		t.Fatalf("server.health response shape invalid")
	}
	content, ok := healthResult["content"].([]any)
	if !ok || len(content) == 0 {
		t.Fatalf("server.health content missing")
	}
}

func writeRequest(t *testing.T, buffer *bytes.Buffer, request map[string]any) {
	t.Helper()
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request failed: %v", err)
	}
	if err := mcp.WriteFrame(buffer, raw); err != nil {
		t.Fatalf("write request failed: %v", err)
	}
}

func readResponses(t *testing.T, payload []byte, count int) map[int]map[string]any {
	t.Helper()
	reader := bufio.NewReader(bytes.NewReader(payload))
	responses := make(map[int]map[string]any, count)
	for i := 0; i < count; i++ {
		frame, err := mcp.ReadFrame(reader)
		if err != nil {
			t.Fatalf("read response frame failed: %v", err)
		}
		var parsed map[string]any
		if err := json.Unmarshal(frame, &parsed); err != nil {
			t.Fatalf("decode response failed: %v", err)
		}
		idNumber, ok := parsed["id"].(float64)
		if !ok {
			t.Fatalf("response id type invalid: %#v", parsed["id"])
		}
		responses[int(idNumber)] = parsed
	}
	return responses
}
