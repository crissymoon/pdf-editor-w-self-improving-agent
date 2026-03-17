import { parentPort } from "node:worker_threads";
import { getParserByName } from "../parsers/index.mjs";
import { runMockModel } from "../core/mock-model.mjs";

if (!parentPort) {
  throw new Error("request-worker must run in a worker thread.");
}

parentPort.on("message", async (job) => {
  const started = Date.now();

  try {
    const parser = await getParserByName(job.parserName);
    const modelResult = await runMockModel(parser, job.prompt, {
      requestId: job.id,
      parserName: job.parserName,
      metadata: job.metadata ?? {}
    });

    parentPort.postMessage({
      ok: true,
      id: job.id,
      elapsedMs: Date.now() - started,
      parsed: modelResult.parsed,
      modelMeta: modelResult.modelMeta
    });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      id: job.id,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
