#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { loadConfig } from "./core/config.mjs";
import { loadScenario } from "./core/scenario-loader.mjs";
import { executeRequests, writeReport } from "./core/runner.mjs";
import { runSmokeSuite } from "./core/smoke-runner.mjs";

const workspaceRoot = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  try {
    switch (command) {
      case "smoke":
        await runSmokeCommand(args.slice(1));
        break;
      case "simulate":
        await runSimulateCommand(args.slice(1));
        break;
      case "run":
        await runSinglePromptCommand(args.slice(1));
        break;
      default:
        printHelp();
        process.exitCode = 0;
        break;
    }
  } catch (error) {
    console.error(`[mock_model_smoke] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function runSmokeCommand(args) {
  const configPath = readOption(args, "--config");
  const config = await loadConfig(configPath, workspaceRoot);
  const result = await runSmokeSuite(config, workspaceRoot);

  console.log("Mock model smoke summary:");
  console.log(`- smokePassed: ${result.smokePassed}`);
  console.log(`- dryRun requests: ${result.dryRunReport.requestCount}`);
  console.log(`- dryRun expectationMatchRate: ${result.dryRunReport.expectationMatchRate}`);
  console.log(`- applyVerified: ${result.applyVerified}`);
  console.log(`- report: ${relativePath(result.reportPath)}`);
  console.log(`- temp file: ${relativePath(result.tempFile)}`);

  if (!result.smokePassed) {
    process.exitCode = 1;
  }
}

async function runSimulateCommand(args) {
  const configPath = readOption(args, "--config");
  const parserOverride = readOption(args, "--parser");
  const scenarioPath = readOption(args, "--scenario") ?? "mock_model_smoke/scenarios/default-scenario.json";
  const applyEdits = hasFlag(args, "--apply");
  const targetFile = readOption(args, "--target-file") ?? "mock_model_smoke/fixtures/sample.ts";

  const config = await loadConfig(configPath, workspaceRoot);
  const scenario = await loadScenario(scenarioPath, {
    rootDir: workspaceRoot,
    templateValues: {
      TARGET_FILE: targetFile
    }
  });

  const report = await executeRequests(scenario.requests, {
    ...config,
    parser: parserOverride || config.parser,
    rootDir: workspaceRoot
  }, {
    applyEdits
  });

  const reportName = `simulate-${Date.now()}.json`;
  const reportPath = await writeReport(config.outputDir, reportName, report);

  console.log(`Scenario: ${scenario.name}`);
  console.log(`Requests: ${report.requestCount}`);
  console.log(`Successful: ${report.successful}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Expectation match rate: ${report.expectationMatchRate}`);
  console.log(`Average latency (ms): ${report.metrics.avgLatencyMs}`);
  console.log(`P95 latency (ms): ${report.metrics.p95LatencyMs}`);
  console.log(`Report: ${relativePath(reportPath)}`);

  if (report.expectationMatchRate < 1) {
    process.exitCode = 1;
  }
}

async function runSinglePromptCommand(args) {
  const configPath = readOption(args, "--config");
  const parserOverride = readOption(args, "--parser");
  const prompt = readOption(args, "--prompt");
  const targetFile = readOption(args, "--target-file") ?? "mock_model_smoke/fixtures/sample.ts";
  const applyEdits = hasFlag(args, "--apply");

  if (!prompt) {
    throw new Error("Missing --prompt for run command.");
  }

  const resolvedPrompt = prompt.includes("${TARGET_FILE}")
    ? prompt.replace(/\$\{TARGET_FILE\}/g, targetFile)
    : prompt;

  const config = await loadConfig(configPath, workspaceRoot);
  const report = await executeRequests([
    {
      id: "single-request",
      prompt: resolvedPrompt,
      expectSuccess: true
    }
  ], {
    ...config,
    parser: parserOverride || config.parser,
    rootDir: workspaceRoot
  }, {
    applyEdits
  });

  const item = report.results[0];
  console.log(`Success: ${item.ok}`);
  if (item.error) {
    console.log(`Error: ${item.error}`);
  }
  if (item.actionResult?.diff) {
    console.log("Diff:");
    console.log(item.actionResult.diff);
  }

  if (!item.ok) {
    process.exitCode = 1;
  }
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readOption(args, key) {
  const index = args.findIndex((value) => value === key);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function relativePath(value) {
  return path.relative(workspaceRoot, value).replace(/\\/g, "/");
}

function printHelp() {
  console.log("mock_model_smoke commands");
  console.log("  smoke [--config <path>]");
  console.log("  simulate [--scenario <path>] [--target-file <path>] [--parser <name>] [--apply] [--config <path>]");
  console.log("  run --prompt \"<instruction>\" [--target-file <path>] [--parser <name>] [--apply] [--config <path>]");
}

await main();
