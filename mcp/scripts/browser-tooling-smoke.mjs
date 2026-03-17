#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const mcpRoot = path.resolve(repoRoot, "mcp");

function encodeFrame(payloadObject) {
  const payload = Buffer.from(JSON.stringify(payloadObject), "utf8");
  const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8");
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
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        break;
      }

      const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = headerText.match(/content-length:\s*(\d+)/i);
      if (!match) {
        throw new Error("Invalid MCP frame: missing Content-Length");
      }

      const bodyLength = Number.parseInt(match[1], 10);
      const frameStart = headerEnd + 4;
      const frameEnd = frameStart + bodyLength;
      if (this.buffer.length < frameEnd) {
        break;
      }

      const body = this.buffer.subarray(frameStart, frameEnd).toString("utf8");
      messages.push(JSON.parse(body));
      this.buffer = this.buffer.subarray(frameEnd);
    }

    return messages;
  }
}

async function run() {
  const child = spawn("go", ["run", "./cmd/server"], {
    cwd: mcpRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MCP_DEFAULT_PROVIDER: "openai"
    }
  });

  const frameReader = new MCPFrameReader();
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
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

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const request = (id, method, params = {}) => {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(
        encodeFrame({
          jsonrpc: "2.0",
          id,
          method,
          params
        })
      );
    });
  };

  try {
    const init = await request(1, "initialize", {});
    if (init.error) {
      throw new Error(`initialize failed: ${init.error.message}`);
    }

    const toolList = await request(2, "tools/list", {});
    if (toolList.error) {
      throw new Error(`tools/list failed: ${toolList.error.message}`);
    }

    const tools = toolList?.result?.tools ?? [];
    const hasPuppeteer = tools.some((tool) => tool.name === "browser.puppeteer");
    const hasPlaywright = tools.some((tool) => tool.name === "browser.playwright");
    if (!hasPuppeteer || !hasPlaywright) {
      throw new Error("browser tools are not listed in tools/list");
    }

    const browserCall = await request(3, "tools/call", {
      name: "browser.puppeteer",
      arguments: {
        url: "https://example.com",
        headless: true,
        wait_until: "load",
        actions: [
          {
            type: "extract_text",
            selector: "h1",
            as: "title"
          }
        ]
      }
    });

    if (browserCall.error) {
      throw new Error(`browser.puppeteer failed: ${browserCall.error.message}`);
    }

    const payloadText = browserCall?.result?.content?.[0]?.text || "";
    if (!payloadText) {
      throw new Error("browser.puppeteer returned empty content");
    }

    const parsed = JSON.parse(payloadText);
    if (!parsed.ok) {
      throw new Error("browser.puppeteer returned non-ok payload");
    }

    console.log("[OK] MCP browser tooling smoke passed");
    console.log(`[OK] extracted title: ${parsed.engineData?.title || "n/a"}`);
  } finally {
    child.stdin.end();
    child.kill();
  }

  if (stderr.trim()) {
    console.log("[INFO] MCP server stderr output detected:");
    console.log(stderr.trim());
  }
}

run().catch((error) => {
  console.error(`[ERROR] MCP browser tooling smoke failed: ${error.message}`);
  process.exitCode = 1;
});
