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

function parseToolText(response) {
  const text = response?.result?.content?.[0]?.text || "";
  if (!text) {
    throw new Error("tool returned empty content");
  }
  return JSON.parse(text);
}

async function run() {
  const child = spawn("go", ["run", "./cmd/server"], {
    cwd: mcpRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MCP_SETTINGS_PATH: path.join(mcpRoot, "settings.json")
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

  const callTool = async (id, name, args = {}) => {
    const response = await request(id, "tools/call", {
      name,
      arguments: args
    });
    if (response.error) {
      throw new Error(`${name} failed: ${response.error.message}`);
    }
    return response;
  };

  const sandboxRoot = path.resolve(repoRoot, "file_worker_smoke");
  const testDir = path.join(sandboxRoot, `mcp-file-tools-smoke-${Date.now()}`);
  const fileA = path.join(testDir, "sample.txt");
  const fileB = path.join(testDir, "sample-renamed.txt");
  const payload = `mcp-file-tools-smoke-${Date.now()}`;

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
    const required = ["file.sandbox", "file.list", "file.read", "file.write", "file.mkdir", "file.move", "file.delete"];
    const missing = required.filter((name) => !tools.some((tool) => tool.name === name));
    if (missing.length > 0) {
      throw new Error(`missing file tools in tools/list: ${missing.join(", ")}`);
    }

    const sandboxInfo = parseToolText(await callTool(3, "file.sandbox"));
    if (!sandboxInfo.enabled) {
      throw new Error("file.sandbox reports disabled state");
    }
    if (!Array.isArray(sandboxInfo.sandbox_dirs) || sandboxInfo.sandbox_dirs.length === 0) {
      throw new Error("file.sandbox returned empty sandbox_dirs");
    }

    await callTool(4, "file.mkdir", { path: testDir, recursive: true });
    await callTool(5, "file.write", { path: fileA, content: payload, append: false, create_dirs: true });

    const readResult = parseToolText(await callTool(6, "file.read", { path: fileA }));
    if (readResult.content !== payload) {
      throw new Error("file.read content mismatch after write");
    }

    const listResult = parseToolText(await callTool(7, "file.list", { path: testDir }));
    const hasSample = Array.isArray(listResult.entries) && listResult.entries.some((item) => item.path === "sample.txt");
    if (!hasSample) {
      throw new Error("file.list did not include sample.txt");
    }

    await callTool(8, "file.move", { from: fileA, to: fileB });

    const movedRead = parseToolText(await callTool(9, "file.read", { path: fileB }));
    if (movedRead.content !== payload) {
      throw new Error("file.read content mismatch after move");
    }

    await callTool(10, "file.delete", { path: fileB });
    await callTool(11, "file.delete", { path: testDir, recursive: true });

    console.log("[OK] MCP file tools smoke passed");
    console.log(`[OK] sandbox dirs: ${sandboxInfo.sandbox_dirs.length}`);
    console.log(`[OK] exercised path: ${testDir}`);
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
  console.error(`[ERROR] MCP file tools smoke failed: ${error.message}`);
  process.exitCode = 1;
});
