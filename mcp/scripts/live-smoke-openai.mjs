#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CWD = path.resolve(process.cwd());
const MCP_ROOT = fs.existsSync(path.join(CWD, 'cmd', 'server'))
  ? CWD
  : path.join(CWD, 'mcp');
const SETTINGS_PATH = resolveSettingsPath();
const STRICT = process.argv.includes('--strict') || process.env.MCP_SMOKE_STRICT === '1';

function resolveSettingsPath() {
  const configured = (process.env.MCP_SETTINGS_PATH || '').trim();
  if (configured) {
    return expandHome(configured);
  }
  return path.join(MCP_ROOT, 'settings.json');
}

function expandHome(value) {
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return null;
  }
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
  return JSON.parse(raw);
}

function getOpenAIKey(settings) {
  const envKey = (process.env.OPENAI_API_KEY || '').trim();
  if (envKey) {
    return envKey;
  }

  const fromSettings = settings?.openai?.api_key;
  if (typeof fromSettings === 'string' && fromSettings.trim()) {
    return fromSettings.trim();
  }

  const keyFile = settings?.openai?.key_file;
  if (typeof keyFile === 'string' && keyFile.trim()) {
    const keyPath = expandHome(keyFile.trim());
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8').trim();
    }
  }

  return '';
}

function encodeFrame(payloadObject) {
  const payload = Buffer.from(JSON.stringify(payloadObject), 'utf8');
  const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
  return Buffer.concat([header, payload]);
}

class MCPFrameReader {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const headerText = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = headerText.match(/content-length:\s*(\d+)/i);
      if (!match) {
        throw new Error('Invalid MCP frame: missing Content-Length');
      }

      const bodyLength = Number.parseInt(match[1], 10);
      const frameStart = headerEnd + 4;
      const frameEnd = frameStart + bodyLength;
      if (this.buffer.length < frameEnd) {
        break;
      }

      const body = this.buffer.subarray(frameStart, frameEnd).toString('utf8');
      messages.push(JSON.parse(body));
      this.buffer = this.buffer.subarray(frameEnd);
    }

    return messages;
  }
}

async function run() {
  const settings = readSettings();
  const openAIKey = getOpenAIKey(settings);

  if (!openAIKey) {
    if (STRICT) {
      console.error('[ERROR] OpenAI key not found. Set OPENAI_API_KEY, mcp/settings.json api_key, or key_file.');
      process.exitCode = 1;
    } else {
      console.log('[SKIP] OpenAI key not found via OPENAI_API_KEY or mcp/settings.json key file');
      process.exitCode = 0;
    }
    return;
  }

  const child = spawn('go', ['run', './cmd/server'], {
    cwd: MCP_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCP_SETTINGS_PATH: SETTINGS_PATH,
      OPENAI_API_KEY: openAIKey,
      MCP_DEFAULT_PROVIDER: 'openai',
    },
  });

  const frameReader = new MCPFrameReader();
  const pending = new Map();

  child.stdout.on('data', (chunk) => {
    try {
      const messages = frameReader.push(chunk);
      for (const message of messages) {
        const id = message?.id;
        if (id === undefined || id === null) {
          continue;
        }
        const resolver = pending.get(id);
        if (resolver) {
          pending.delete(id);
          resolver.resolve(message);
        }
      }
    } catch (error) {
      for (const [, resolver] of pending) {
        resolver.reject(error);
      }
      pending.clear();
    }
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const request = (id, method, params = {}) => {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(
        encodeFrame({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
      );
    });
  };

  try {
    const init = await request(1, 'initialize', {});
    if (init.error) {
      throw new Error(`initialize failed: ${init.error.message}`);
    }

    const toolList = await request(2, 'tools/list', {});
    if (toolList.error) {
      throw new Error(`tools/list failed: ${toolList.error.message}`);
    }

    const tools = toolList?.result?.tools ?? [];
    const hasChat = Array.isArray(tools) && tools.some((tool) => tool.name === 'ai.chat');
    if (!hasChat) {
      throw new Error('ai.chat tool not found in tools/list');
    }

    const conversation = await request(3, 'tools/call', {
      name: 'ai.chat',
      arguments: {
        provider: 'openai',
        workload: 'conversation',
        prompt: 'Reply with exactly MCP_CONVERSATION_OK',
        temperature: 0,
        max_tokens: 32,
      },
    });
    if (conversation.error) {
      throw new Error(`ai.chat conversation failed: ${conversation.error.message}`);
    }

    const heavy = await request(4, 'tools/call', {
      name: 'ai.chat',
      arguments: {
        provider: 'openai',
        workload: 'tools',
        prompt: 'Return a one-line JSON object with key smoke and value ok.',
        temperature: 0,
        max_tokens: 64,
      },
    });
    if (heavy.error) {
      throw new Error(`ai.chat tools failed: ${heavy.error.message}`);
    }

    const convModel = conversation?.result?.metadata?.model || '';
    const heavyModel = heavy?.result?.metadata?.model || '';

    if (!String(convModel).includes('gpt-4o-mini')) {
      throw new Error(`Expected conversation model to include gpt-4o-mini, got ${convModel || 'empty'}`);
    }
    if (!String(heavyModel).includes('gpt-4o') || String(heavyModel).includes('mini')) {
      throw new Error(`Expected tool workload model to include gpt-4o (non-mini), got ${heavyModel || 'empty'}`);
    }

    console.log('[OK] MCP live smoke passed');
    console.log(`[OK] conversation model: ${convModel}`);
    console.log(`[OK] tool workload model: ${heavyModel}`);
  } finally {
    child.stdin.end();
    child.kill();
  }

  if (stderr.trim()) {
    console.log('[INFO] MCP server stderr output detected:');
    console.log(stderr.trim());
  }
}

run().catch((error) => {
  console.error('[ERROR] MCP live smoke failed:', error.message);
  process.exitCode = 1;
});
