import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TokenBucketRateLimiter } from "./rate-limiter.mjs";
import { WorkerPool } from "./worker-pool.mjs";
import { executeAction } from "./file-edit-engine.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerFile = path.resolve(__dirname, "../workers/request-worker.mjs");

export async function executeRequests(requests, config, options = {}) {
  const applyEdits = options.applyEdits === true;
  const limiter = new TokenBucketRateLimiter(config.requestsPerSecond, config.burst);
  const pool = new WorkerPool({
    workerFile,
    size: config.workerCount,
    maxQueue: config.maxQueue
  });

  const startedAt = Date.now();
  const results = [];

  try {
    const jobs = requests.map((request, index) =>
      processOneRequest(request, index, {
        pool,
        limiter,
        parserName: config.parser,
        rootDir: config.rootDir,
        applyEdits
      })
    );

    const settled = await Promise.all(jobs);
    results.push(...settled);
  } finally {
    await pool.close();
  }

  return buildReport(results, Date.now() - startedAt, config, applyEdits);
}

async function processOneRequest(request, index, context) {
  const started = Date.now();
  const waitedMs = await context.limiter.acquire(1);

  try {
    const workerResponse = await context.pool.submit({
      id: request.id ?? `request-${index + 1}`,
      prompt: request.prompt,
      parserName: context.parserName,
      metadata: request.metadata ?? {}
    });

    const parsed = workerResponse.parsed;
    if (!parsed.success) {
      return {
        id: request.id,
        ok: false,
        expectedSuccess: request.expectSuccess,
        prompt: request.prompt,
        waitedMs,
        elapsedMs: Date.now() - started,
        modelMeta: workerResponse.modelMeta,
        error: parsed.error,
        actionResult: null
      };
    }

    const actionResult = await executeAction(parsed.action, {
      rootDir: context.rootDir,
      applyEdits: context.applyEdits
    });

    return {
      id: request.id,
      ok: true,
      expectedSuccess: request.expectSuccess,
      prompt: request.prompt,
      waitedMs,
      elapsedMs: Date.now() - started,
      modelMeta: workerResponse.modelMeta,
      error: null,
      action: parsed.action,
      actionResult
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      expectedSuccess: request.expectSuccess,
      prompt: request.prompt,
      waitedMs,
      elapsedMs: Date.now() - started,
      modelMeta: null,
      error: error instanceof Error ? error.message : String(error),
      actionResult: null
    };
  }
}

function buildReport(results, durationMs, config, applyEdits) {
  const successful = results.filter((item) => item.ok).length;
  const failed = results.length - successful;
  const expectedMatches = results.filter((item) => item.expectedSuccess === item.ok).length;
  const latencies = results.map((item) => item.elapsedMs).sort((a, b) => a - b);

  return {
    generatedAt: new Date().toISOString(),
    durationMs,
    requestCount: results.length,
    successful,
    failed,
    expectationMatchCount: expectedMatches,
    expectationMatchRate: results.length ? Number((expectedMatches / results.length).toFixed(4)) : 0,
    applyEdits,
    configSnapshot: {
      parser: config.parser,
      requestsPerSecond: config.requestsPerSecond,
      burst: config.burst,
      workerCount: config.workerCount,
      maxQueue: config.maxQueue,
      rootDir: config.rootDir
    },
    metrics: {
      avgLatencyMs: average(latencies),
      p95LatencyMs: percentile(latencies, 95),
      maxLatencyMs: latencies.at(-1) ?? 0,
      totalRateLimitWaitMs: results.reduce((sum, item) => sum + item.waitedMs, 0)
    },
    results
  };
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

function percentile(sortedValues, pct) {
  if (!sortedValues.length) {
    return 0;
  }

  const clamped = Math.min(100, Math.max(0, pct));
  const index = Math.ceil((clamped / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

export async function writeReport(outputDir, reportName, report) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, reportName);
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}
