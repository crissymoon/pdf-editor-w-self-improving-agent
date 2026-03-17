#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/core/config.mjs";
import { executeRequests, writeReport } from "../src/core/runner.mjs";

const workspaceRoot = path.resolve(process.cwd());
const smokeRootRel = "file_worker_smoke";
const smokeRootAbs = path.resolve(workspaceRoot, smokeRootRel);

async function main() {
  await seedWorkspace();

  const incomingFiles = await listFiles(path.join(smokeRootAbs, "incoming"));
  const movable = incomingFiles.filter((name) => name.endsWith(".txt"));

  if (movable.length < 2) {
    throw new Error("Need at least 2 .txt files in file_worker_smoke/incoming to run file worker smoke.");
  }

  const sourceMove = `${smokeRootRel}/incoming/${movable[0]}`;
  const sourceDelete = `${smokeRootRel}/incoming/${movable[1]}`;
  const movedTarget = `${smokeRootRel}/organized/notes/${movable[0]}`;
  const sessionFile = `${smokeRootRel}/staging/session-${Date.now()}.txt`;
  const reportFile = `${smokeRootRel}/organized/reports/summary-${Date.now()}.md`;

  const requests = [
    makeRequest("fw-1", {
      type: "create_directory",
      dirPath: `${smokeRootRel}/organized/reports`
    }),
    makeRequest("fw-2", {
      type: "list_directory",
      dirPath: `${smokeRootRel}/incoming`
    }),
    makeRequest("fw-3", {
      type: "create_file",
      filePath: sessionFile,
      content: `session=${randomUUID()}\nstate=active\n`,
      overwrite: false
    }),
    makeRequest("fw-4", {
      type: "move_file",
      filePath: sourceMove,
      destinationPath: movedTarget
    }),
    makeRequest("fw-5", {
      type: "replace_text",
      filePath: `${smokeRootRel}/manifest.txt`,
      target: "File Worker Smoke Manifest",
      replacement: "File Worker Smoke Manifest (organized)"
    }),
    makeRequest("fw-6", {
      type: "append_text",
      filePath: `${smokeRootRel}/manifest.txt`,
      text: `\nlast_run=${new Date().toISOString()}`
    }),
    makeRequest("fw-7", {
      type: "create_file",
      filePath: reportFile,
      content: `# File Worker Run\nMoved: ${sourceMove} -> ${movedTarget}\nDeleted: ${sourceDelete}\n`,
      overwrite: false
    }),
    makeRequest("fw-8", {
      type: "delete_file",
      filePath: sourceDelete
    }),
    makeRequest("fw-9", {
      type: "list_directory",
      dirPath: `${smokeRootRel}/organized/notes`
    })
  ];

  const config = await loadConfig("mock_model_smoke/config/file-worker-mcp.config.json", workspaceRoot);
  const report = await executeRequests(requests, {
    ...config,
    rootDir: workspaceRoot
  }, {
    applyEdits: true
  });

  const verify = await verifyResult({ movedTarget, sourceDelete, reportFile });

  const final = {
    generatedAt: new Date().toISOString(),
    smokeName: "file-worker-mcp",
    root: smokeRootRel,
    expectationMatchRate: report.expectationMatchRate,
    successful: report.successful,
    failed: report.failed,
    verify,
    report
  };

  const reportName = `file-worker-mcp-smoke-${Date.now()}.json`;
  const outputPath = await writeReport(path.resolve(workspaceRoot, "mock_model_smoke/output"), reportName, final);

  console.log("File worker MCP smoke summary:");
  console.log(`- expectationMatchRate: ${report.expectationMatchRate}`);
  console.log(`- successful: ${report.successful}`);
  console.log(`- failed: ${report.failed}`);
  console.log(`- verify.movedExists: ${verify.movedExists}`);
  console.log(`- verify.deletedRemoved: ${verify.deletedRemoved}`);
  console.log(`- verify.reportExists: ${verify.reportExists}`);
  console.log(`- report: ${path.relative(workspaceRoot, outputPath).replace(/\\\\/g, "/")}`);

  if (report.expectationMatchRate < 1 || !verify.ok) {
    process.exitCode = 1;
  }
}

function makeRequest(id, payload) {
  return {
    id,
    prompt: JSON.stringify(payload),
    expectSuccess: true
  };
}

async function seedWorkspace() {
  await fs.mkdir(path.join(smokeRootAbs, "incoming"), { recursive: true });
  await fs.mkdir(path.join(smokeRootAbs, "staging"), { recursive: true });
  await fs.mkdir(path.join(smokeRootAbs, "organized", "notes"), { recursive: true });
  await fs.mkdir(path.join(smokeRootAbs, "archive"), { recursive: true });

  const incomingFiles = await listFiles(path.join(smokeRootAbs, "incoming"));
  if (incomingFiles.filter((name) => name.endsWith(".txt")).length < 3) {
    for (let i = 0; i < 5; i += 1) {
      const id = randomUUID().slice(0, 6);
      await fs.writeFile(
        path.join(smokeRootAbs, "incoming", `seed-${id}.txt`),
        `seed=${id}\\nstatus=draft\\n`,
        "utf8"
      );
    }
  }

  const manifestPath = path.join(smokeRootAbs, "manifest.txt");
  await fs.writeFile(manifestPath, "File Worker Smoke Manifest\n", "utf8");
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function verifyResult({ movedTarget, sourceDelete, reportFile }) {
  const movedExists = await exists(path.resolve(workspaceRoot, movedTarget));
  const deletedRemoved = !(await exists(path.resolve(workspaceRoot, sourceDelete)));
  const reportExists = await exists(path.resolve(workspaceRoot, reportFile));

  return {
    ok: movedExists && deletedRemoved && reportExists,
    movedExists,
    deletedRemoved,
    reportExists
  };
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch (_error) {
    return false;
  }
}

await main();
