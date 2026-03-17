package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad_UsesSettingsJsonAndKeyFile(t *testing.T) {
	tmpDir := t.TempDir()
	keyPath := filepath.Join(tmpDir, "openai.key")
	settingsPath := filepath.Join(tmpDir, "settings.json")

	if err := os.WriteFile(keyPath, []byte("test-openai-key\n"), 0o600); err != nil {
		t.Fatalf("write key file: %v", err)
	}

	settingsBody := `{
  "default_provider": "openai",
  "openai": {
    "base_url": "https://api.openai.com",
    "key_file": "` + filepath.ToSlash(keyPath) + `",
    "models": ["gpt-4o-mini", "gpt-4o"],
    "conversation_model": "gpt-4o-mini",
    "tool_model": "gpt-4o"
  }
}`
	if err := os.WriteFile(settingsPath, []byte(settingsBody), 0o600); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	t.Setenv("MCP_SETTINGS_PATH", settingsPath)
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OPENAI_MODELS", "")
	t.Setenv("OPENAI_CONVERSATION_MODEL", "")
	t.Setenv("OPENAI_TOOL_MODEL", "")
	t.Setenv("MCP_DEFAULT_PROVIDER", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.OpenAI.APIKey != "test-openai-key" {
		t.Fatalf("expected key from key_file, got %q", cfg.OpenAI.APIKey)
	}
	if cfg.OpenAI.ConversationModel != "gpt-4o-mini" {
		t.Fatalf("expected conversation model gpt-4o-mini, got %q", cfg.OpenAI.ConversationModel)
	}
	if cfg.OpenAI.ToolModel != "gpt-4o" {
		t.Fatalf("expected tool model gpt-4o, got %q", cfg.OpenAI.ToolModel)
	}
	if len(cfg.OpenAI.Models) != 2 {
		t.Fatalf("expected 2 openai models, got %d", len(cfg.OpenAI.Models))
	}
}

func TestLoad_FileToolsSandboxDirsResolvedFromSettingsPath(t *testing.T) {
	tmpDir := t.TempDir()
	sandbox := filepath.Join(tmpDir, "sandbox")
	if err := os.MkdirAll(sandbox, 0o755); err != nil {
		t.Fatalf("mkdir sandbox: %v", err)
	}

	settingsPath := filepath.Join(tmpDir, "settings.json")
	settingsBody := `{
  "default_provider": "openai",
  "file_tools": {
    "enabled": true,
    "sandbox_dirs": ["./sandbox"],
    "max_read_bytes": 4096,
    "max_write_bytes": 2048
  }
}`
	if err := os.WriteFile(settingsPath, []byte(settingsBody), 0o600); err != nil {
		t.Fatalf("write settings file: %v", err)
	}

	t.Setenv("MCP_SETTINGS_PATH", settingsPath)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if !cfg.FileTools.Enabled {
		t.Fatalf("expected file tools to be enabled")
	}
	if cfg.FileTools.MaxReadBytes != 4096 {
		t.Fatalf("expected max_read_bytes=4096, got %d", cfg.FileTools.MaxReadBytes)
	}
	if cfg.FileTools.MaxWriteBytes != 2048 {
		t.Fatalf("expected max_write_bytes=2048, got %d", cfg.FileTools.MaxWriteBytes)
	}
	if len(cfg.FileTools.SandboxDirs) != 1 {
		t.Fatalf("expected 1 sandbox dir, got %d", len(cfg.FileTools.SandboxDirs))
	}

	resolvedSandbox, err := filepath.Abs(sandbox)
	if err != nil {
		t.Fatalf("abs sandbox: %v", err)
	}
	if cfg.FileTools.SandboxDirs[0] != resolvedSandbox {
		t.Fatalf("expected resolved sandbox %q, got %q", resolvedSandbox, cfg.FileTools.SandboxDirs[0])
	}
}
