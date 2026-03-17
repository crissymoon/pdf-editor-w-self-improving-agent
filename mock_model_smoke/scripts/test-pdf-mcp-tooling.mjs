#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../src/core/config.mjs";
import { loadScenario } from "../src/core/scenario-loader.mjs";
import { executeRequests, writeReport } from "../src/core/runner.mjs";

const workspaceRoot = path.resolve(process.cwd());
const strictMcp = process.argv.includes("--strict-mcp");
const skipLiveMcp = process.argv.includes("--skip-live-mcp");
const skipStress = process.argv.includes("--skip-stress");
const stressProfileMode = readOption("--stress-profile") || "both";
const thresholdsPath = readOption("--thresholds") || "mock_model_smoke/config/stress-thresholds.json";

async function main() {
  const startedAt = Date.now();
  const outputDir = path.resolve(workspaceRoot, "mock_model_smoke/output");
  const evalWorkspace = path.resolve(outputDir, "eval-workspace");
  await fs.mkdir(evalWorkspace, { recursive: true });

  const pdfScenario = await runScenario({
    name: "pdf-editor",
    configPath: "mock_model_smoke/config/pdf-scenario.config.json",
    scenarioPath: "mock_model_smoke/scenarios/pdf-editor-scenario.json",
    fixturePath: "mock_model_smoke/fixtures/pdf-editor-workflow.fixture.ts",
    destinationPath: path.join(evalWorkspace, "pdf-editor-workflow.fixture.ts")
  });

  const mcpJsonScenario = await runScenario({
    name: "mcp-json",
    configPath: "mock_model_smoke/config/mcp-json.config.json",
    scenarioPath: "mock_model_smoke/scenarios/mcp-json-scenario.json",
    fixturePath: "mock_model_smoke/fixtures/mcp-workflow.fixture.ts",
    destinationPath: path.join(evalWorkspace, "mcp-workflow.fixture.ts")
  });

  const stressThresholds = await loadThresholds(thresholdsPath);
  const stressProfiles = skipStress
    ? {
        status: "skipped",
        reason: "Skipped by --skip-stress flag.",
        profiles: {},
        thresholdGate: {
          passed: true,
          violations: []
        }
      }
    : await runStressProfiles({
        mode: stressProfileMode,
        evalWorkspace,
        stressThresholds
      });

  const mcpLive = skipLiveMcp
    ? {
        status: "skipped",
        exitCode: 0,
        reason: "Skipped by --skip-live-mcp flag."
      }
    : await runMcpLiveSmoke();

  const toolingNeeded = evaluateToolingNeeds({
    pdfScenario,
    mcpJsonScenario,
    mcpLive,
    stressProfiles
  });

  const overallPass =
    pdfScenario.expectationMatchRate === 1 &&
    mcpJsonScenario.expectationMatchRate === 1 &&
    stressProfiles.thresholdGate.passed &&
    (mcpLive.status === "passed" || (!strictMcp && mcpLive.status !== "failed"));

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    strictMcp,
    skipLiveMcp,
    overallPass,
    suites: {
      pdfScenario,
      mcpJsonScenario,
      stressProfiles,
      mcpLive
    },
    toolingNeeded
  };

  const reportName = `tooling-evaluation-${Date.now()}.json`;
  const reportPath = await writeReport(outputDir, reportName, report);

  printSummary(report, path.relative(workspaceRoot, reportPath));

  if (!overallPass) {
    process.exitCode = 1;
  }
}

async function runScenario(options) {
  const fixtureAbsolute = path.resolve(workspaceRoot, options.fixturePath);
  const destinationAbsolute = path.resolve(options.destinationPath);
  await fs.copyFile(fixtureAbsolute, destinationAbsolute);

  const config = await loadConfig(options.configPath, workspaceRoot);
  const scenario = await loadScenario(options.scenarioPath, {
    rootDir: workspaceRoot,
    templateValues: {
      TARGET_FILE: toRelative(workspaceRoot, destinationAbsolute)
    }
  });

  const report = await executeRequests(
    scenario.requests,
    {
      ...config,
      rootDir: workspaceRoot
    },
    {
      applyEdits: true
    }
  );

  return {
    name: options.name,
    scenarioName: scenario.name,
    requestCount: report.requestCount,
    expectationMatchRate: report.expectationMatchRate,
    failed: report.failed,
    avgLatencyMs: report.metrics.avgLatencyMs,
    p95LatencyMs: report.metrics.p95LatencyMs,
    report
  };
}

async function runMcpLiveSmoke() {
  const scriptPath = path.resolve(workspaceRoot, "mcp/scripts/live-smoke-openai.mjs");

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      const normalizedOut = stdout.trim();
      const normalizedErr = stderr.trim();

      if (normalizedOut.includes("[SKIP]")) {
        resolve({
          status: "skipped",
          exitCode: code ?? 0,
          stdout: normalizedOut,
          stderr: normalizedErr
        });
        return;
      }

      resolve({
        status: code === 0 ? "passed" : "failed",
        exitCode: code ?? -1,
        stdout: normalizedOut,
        stderr: normalizedErr
      });
    });
  });
}

async function runStressProfile(options) {
  const fixtureAbsolute = path.resolve(workspaceRoot, options.fixturePath);
  const destinationAbsolute = path.resolve(options.destinationPath);
  await fs.copyFile(fixtureAbsolute, destinationAbsolute);

  const config = await loadConfig(options.configPath, workspaceRoot);
  const targetFileRel = toRelative(workspaceRoot, destinationAbsolute);
  const requests = buildStressRequests(targetFileRel, options.requestCount);

  const report = await executeRequests(
    requests,
    {
      ...config,
      rootDir: workspaceRoot
    },
    {
      applyEdits: false
    }
  );

  const latencies = report.results.map((item) => item.elapsedMs);
  const waits = report.results.map((item) => item.waitedMs);

  return {
    status: "completed",
    requestCount: report.requestCount,
    expectationMatchRate: report.expectationMatchRate,
    failed: report.failed,
    rateLimitWaitMsTotal: report.metrics.totalRateLimitWaitMs,
    latencyPercentiles: {
      p50: calcPercentile(latencies, 50),
      p90: calcPercentile(latencies, 90),
      p95: calcPercentile(latencies, 95),
      p99: calcPercentile(latencies, 99)
    },
    waitPercentiles: {
      p50: calcPercentile(waits, 50),
      p90: calcPercentile(waits, 90),
      p95: calcPercentile(waits, 95),
      p99: calcPercentile(waits, 99)
    },
    latencyHistogram: buildHistogram(latencies, [50, 100, 150, 200, 300, 500, 1000]),
    waitHistogram: buildHistogram(waits, [0, 10, 25, 50, 100, 250, 500, 1000]),
    report
  };
}

async function runStressProfiles(options) {
  const definitions = buildStressDefinitions(options.evalWorkspace, options.mode);
  const profiles = {};

  for (const definition of definitions) {
    profiles[definition.name] = await runStressProfile(definition);
  }

  const thresholdGate = evaluateStressThresholds(profiles, options.stressThresholds);
  return {
    status: "completed",
    mode: options.mode,
    profiles,
    thresholdGate
  };
}

function buildStressDefinitions(evalWorkspace, mode) {
  const all = [
    {
      name: "constrained",
      configPath: "mock_model_smoke/config/stress-constrained.config.json",
      fixturePath: "mock_model_smoke/fixtures/pdf-editor-workflow.fixture.ts",
      destinationPath: path.join(evalWorkspace, "stress-constrained.fixture.ts"),
      requestCount: 40
    },
    {
      name: "high-throughput",
      configPath: "mock_model_smoke/config/stress-high-throughput.config.json",
      fixturePath: "mock_model_smoke/fixtures/pdf-editor-workflow.fixture.ts",
      destinationPath: path.join(evalWorkspace, "stress-high-throughput.fixture.ts"),
      requestCount: 40
    }
  ];

  if (mode === "both") {
    return all;
  }

  return all.filter((item) => item.name === mode);
}

function evaluateStressThresholds(profiles, thresholds) {
  const violations = [];

  for (const [profileName, profileResult] of Object.entries(profiles)) {
    const threshold = thresholds?.[profileName];
    if (!threshold) {
      continue;
    }

    if (profileResult.expectationMatchRate < threshold.expectationMatchRateMin) {
      violations.push(`${profileName}: expectationMatchRate ${profileResult.expectationMatchRate} < ${threshold.expectationMatchRateMin}`);
    }

    if (profileResult.latencyPercentiles.p95 > threshold.latencyP95Max) {
      violations.push(`${profileName}: latency p95 ${profileResult.latencyPercentiles.p95} > ${threshold.latencyP95Max}`);
    }

    if (profileResult.waitPercentiles.p95 > threshold.waitP95Max) {
      violations.push(`${profileName}: wait p95 ${profileResult.waitPercentiles.p95} > ${threshold.waitP95Max}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

async function loadThresholds(relativePathValue) {
  const absolute = path.resolve(workspaceRoot, relativePathValue);
  const raw = await fs.readFile(absolute, "utf8");
  return JSON.parse(raw);
}

function buildStressRequests(targetFile, requestCount) {
  const requests = [];
  for (let i = 0; i < requestCount; i += 1) {
    requests.push({
      id: `stress-${i + 1}`,
      prompt: `replace text \"idle\" with \"ready\" in ${targetFile}`,
      expectSuccess: true
    });
  }

  return requests;
}

function evaluateToolingNeeds(input) {
  const needs = [];

  needs.push({
    category: "runtime",
    required: ["Node.js 20+", "npm", "worker_threads support"]
  });

  needs.push({
    category: "test-harness",
    required: [
      "mock_model_smoke parser plugins",
      "scenario JSON files",
      "isolated fixture workspace for apply-edits",
      "rate-limit and latency report capture"
    ]
  });

  if (input.mcpLive.status !== "passed") {
    needs.push({
      category: "mcp-live-validation",
      required: [
        "Go toolchain (for mcp/cmd/server)",
        "OPENAI_API_KEY or mcp/settings.json key setup",
        "Network access for provider call"
      ],
      reason: "MCP live smoke is not currently passing in this run."
    });
  } else {
    needs.push({
      category: "mcp-live-validation",
      required: ["Go toolchain", "OPENAI_API_KEY"],
      reason: "Live MCP smoke passed and should remain in regression checks."
    });
  }

  if (input.pdfScenario.expectationMatchRate < 1 || input.mcpJsonScenario.expectationMatchRate < 1) {
    needs.push({
      category: "parser-quality",
      required: [
        "Prompt corpus expansion from real frontend payloads",
        "Additional parser rules for uncovered commands"
      ]
    });
  }

  if (input.stressProfiles.status === "completed" && !input.stressProfiles.thresholdGate.passed) {
    needs.push({
      category: "stress-threshold-gate",
      required: [
        "Tune stress profile configuration",
        "Optimize worker throughput and queue policy",
        "Update thresholds if budgets intentionally changed"
      ],
      reason: input.stressProfiles.thresholdGate.violations.join("; ")
    });
  }

  needs.push({
    category: "ci",
    required: ["GitHub Actions workflow for mock smoke and tooling evaluation"]
  });

  return needs;
}

function printSummary(report, reportRelativePath) {
  console.log("PDF + MCP tooling evaluation summary:");
  console.log(`- overallPass: ${report.overallPass}`);
  console.log(`- pdf expectationMatchRate: ${report.suites.pdfScenario.expectationMatchRate}`);
  console.log(`- mcp-json expectationMatchRate: ${report.suites.mcpJsonScenario.expectationMatchRate}`);
  if (report.suites.stressProfiles.status === "completed") {
    const entries = Object.entries(report.suites.stressProfiles.profiles);
    for (const [profileName, profile] of entries) {
      console.log(`- stress ${profileName} p95 latency (ms): ${profile.latencyPercentiles.p95}`);
      console.log(`- stress ${profileName} p95 wait (ms): ${profile.waitPercentiles.p95}`);
    }
    console.log(`- stress threshold gate: ${report.suites.stressProfiles.thresholdGate.passed}`);
    if (!report.suites.stressProfiles.thresholdGate.passed) {
      console.log(`- stress violations: ${report.suites.stressProfiles.thresholdGate.violations.join(" | ")}`);
    }
  } else {
    console.log(`- stress status: ${report.suites.stressProfiles.status}`);
  }
  console.log(`- mcp-live status: ${report.suites.mcpLive.status}`);
  console.log(`- report: ${reportRelativePath.replace(/\\/g, "/")}`);
}

function readOption(optionName) {
  const args = process.argv.slice(2);
  const index = args.findIndex((item) => item === optionName);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function calcPercentile(values, pct) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, pct));
  const idx = Math.ceil((clamped / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function buildHistogram(values, boundaries) {
  const bins = boundaries.map((edge, index) => {
    const lower = index === 0 ? Number.NEGATIVE_INFINITY : boundaries[index - 1];
    return {
      label: `${lower === Number.NEGATIVE_INFINITY ? "<= " : "> " + lower + " to <= "}${edge}`,
      count: 0,
      upperBound: edge
    };
  });

  let overflow = 0;
  for (const value of values) {
    const bin = bins.find((item) => value <= item.upperBound);
    if (bin) {
      bin.count += 1;
      continue;
    }

    overflow += 1;
  }

  return {
    bins: bins.map(({ label, count }) => ({ label, count })),
    overflow
  };
}

function toRelative(root, absoluteFile) {
  return path.relative(root, absoluteFile).replace(/\\/g, "/");
}

await main();
