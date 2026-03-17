# Lightweight MCP Server (Go)

This folder contains a lightweight cross-platform MCP server designed for repository-friendly binary sizes and modular provider support.

## Features

- Stdio MCP transport with JSON-RPC framing.
- Concurrent request handling with configurable action limits.
- Multi-provider support for OpenAI, DeepSeek, Anthropic, and Gemini.
- Multiple tools:
  - `server.health`
  - `ai.models`
  - `ai.chat`
  - `browser.playwright`
  - `browser.puppeteer`
- Smoke tests and protocol tests.

## Configuration

Set environment variables before running:

- `MCP_SERVER_NAME` default: `xcm-pdf-mcp`
- `MCP_SERVER_VERSION` default: `0.1.0`
- `MCP_DEFAULT_PROVIDER` default: `openai`
- `MCP_MAX_CONCURRENCY` default: `8`
- `MCP_REQUEST_TIMEOUT_SECONDS` default: `45`

Provider credentials and endpoints:

- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODELS`
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODELS`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODELS`
- `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODELS`

`*_MODELS` values are comma-separated model names.

## Settings JSON

The server also supports a JSON settings file (default path `mcp/settings.json`).

You can override the location with:

- `MCP_SETTINGS_PATH`

Included file:

- `mcp/settings.json`

This file is configured for OpenAI testing with:

- conversation and prompting model: `gpt-4o-mini`
- heavy or tool workload model: `gpt-4o`
- Desktop key file path: `~/Desktop/keys/openai.key`

If `OPENAI_API_KEY` is set in environment, it takes priority over key_file.

## Build

From this `mcp` directory:

```bash
go build -trimpath -ldflags "-s -w" -o bin/xcm-mcp-server ./cmd/server
```

Windows binary:

```powershell
go build -trimpath -ldflags "-s -w" -o bin/xcm-mcp-server.exe ./cmd/server
```

Cross-compile examples:

```bash
GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o bin/xcm-mcp-server-linux-amd64 ./cmd/server
GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o bin/xcm-mcp-server-darwin-arm64 ./cmd/server
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o bin/xcm-mcp-server-windows-amd64.exe ./cmd/server
```

## Run

```bash
go run ./cmd/server
```

This server communicates over stdin/stdout, so launch it from an MCP-compatible host (Claude Desktop, VS Code MCP clients, and other MCP orchestrators).

## Direct API Providers

The server directly calls provider APIs over HTTPS and does not require a proxy.

- OpenAI direct API default endpoint: `https://api.openai.com`
- DeepSeek direct API default endpoint: `https://api.deepseek.com`
- Anthropic direct API default endpoint: `https://api.anthropic.com`

## Multi-User Hosting Hardening

For server-hosted multi-user operation, plan around these requirements:

1. Concurrency across multi-core processors:
Use goroutines, channels, and worker pools in Go services. If a hot path requires lower-level optimization, use cgo with C or C++ only where profiling confirms gains.

2. Memory management and latency control:
Minimize allocation churn with object reuse and bounded buffers. Tune garbage collection behavior and validate against latency targets.

3. Asynchronous I/O and backpressure:
Keep network and storage operations non-blocking, enforce request timeouts, and apply backpressure under saturation to preserve responsiveness.

4. Load balancing and horizontal scale:
Run multiple stateless instances behind a load balancer with health checks and rolling restarts to avoid bottlenecks.

5. Intelligent caching:
Use short-lived and invalidation-aware caches for expensive reads. Track cache hit rate and stale-read risk.

6. Profiling and modular optimization:
Use pprof and trace-driven tuning for CPU, memory, and blocking analysis. Keep provider adapters and transport layers modular so components can be scaled independently.

## Host Configuration Examples

Use one of the following snippets and replace paths and API keys.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xcm-pdf": {
      "command": "C:/Users/criss/Desktop/pdf-editor/pdf-editor/mcp/bin/xcm-mcp-server.exe",
      "env": {
        "MCP_DEFAULT_PROVIDER": "openai",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY",
        "DEEPSEEK_API_KEY": "YOUR_DEEPSEEK_KEY",
        "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_KEY"
      }
    }
  }
}
```

### VS Code MCP Clients

`settings.json` example:

```json
{
  "mcp.servers": {
    "xcm-pdf": {
      "command": "C:/Users/criss/Desktop/pdf-editor/pdf-editor/mcp/bin/xcm-mcp-server.exe",
      "args": [],
      "env": {
        "MCP_DEFAULT_PROVIDER": "deepseek",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY",
        "DEEPSEEK_API_KEY": "YOUR_DEEPSEEK_KEY",
        "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_KEY"
      }
    }
  }
}
```

### Cursor, Cline, Roo, and Similar MCP Hosts

```json
{
  "servers": {
    "xcm-pdf": {
      "type": "stdio",
      "command": "C:/Users/criss/Desktop/pdf-editor/pdf-editor/mcp/bin/xcm-mcp-server.exe",
      "args": [],
      "env": {
        "MCP_DEFAULT_PROVIDER": "anthropic",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY",
        "DEEPSEEK_API_KEY": "YOUR_DEEPSEEK_KEY",
        "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_KEY"
      }
    }
  }
}
```

## Smoke Testing

```bash
go test ./...
```

The smoke suite validates initialize, tool listing, health tool call, and settings-file loading.

## Live MCP Integration Smoke (OpenAI)

From repository root:

```bash
npm run mcp:smoke:live
```

Strict mode — exits with code 1 if no key is available (suitable for CI):

```bash
npm run mcp:smoke:live:strict
# or
MCP_SMOKE_STRICT=1 npm run mcp:smoke:live
```

What it validates end-to-end over stdio JSON-RPC:

- `initialize`
- `tools/list` contains `ai.chat`
- `tools/call` with `ai.chat` and `workload=conversation` routes to `gpt-4o-mini`
- `tools/call` with `ai.chat` and `workload=tools` routes to `gpt-4o` (non-mini)

Credential resolution for this live smoke:

- `OPENAI_API_KEY` environment variable (highest priority)
- `mcp/settings.json` `openai.api_key`
- `mcp/settings.json` `openai.key_file` (default `~/Desktop/keys/openai.key`)

If no key is available, the live smoke script reports `[SKIP]` and exits successfully.

## Browser Automation Tooling For Custom Agent Tasks

The MCP server can run browser automation tasks using either Playwright or Puppeteer.

Available MCP tools:

- `browser.playwright`
- `browser.puppeteer`

Both tools accept task arguments such as:

- `url` (required)
- `headless` (optional, default `true`)
- `timeout_ms` (optional)
- `wait_until` (`load`, `domcontentloaded`, `networkidle`)
- `output_path` (optional screenshot destination)
- `actions` (optional ordered array):
  - `wait_for_selector`
  - `click`
  - `type`
  - `extract_text`
  - `wait_for_timeout`
  - `screenshot`

Setup from repository root:

```bash
npm run mcp:browser:install
npm run mcp:browser:install:browsers
```

Smoke checks:

```bash
npm run mcp:browser:smoke:playwright
npm run mcp:browser:smoke:puppeteer
npm run mcp:smoke:browser:mcp
```

`mcp:smoke:browser:mcp` validates end-to-end MCP JSON-RPC flow for browser tools by calling `browser.puppeteer` through `tools/call`.

By default the MCP server executes:

- `node browser_tools/src/index.mjs --engine <playwright|puppeteer>`

You can override runner location using environment variable:

- `MCP_BROWSER_TOOL_RUNNER`
