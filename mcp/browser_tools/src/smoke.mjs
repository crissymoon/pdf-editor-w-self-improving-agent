#!/usr/bin/env node
import process from "node:process";
import { runPlaywrightTask } from "./engines/playwright-engine.mjs";
import { runPuppeteerTask } from "./engines/puppeteer-engine.mjs";

const engine = readOption("--engine") || "playwright";

const task = {
  url: "https://example.com",
  headless: true,
  timeout_ms: 20000,
  wait_until: "load",
  actions: [
    {
      type: "extract_text",
      selector: "h1",
      as: "title"
    }
  ]
};

(async () => {
  const runner = engine === "puppeteer" ? runPuppeteerTask : runPlaywrightTask;
  const result = await runner({
    url: task.url,
    headless: task.headless,
    timeoutMs: task.timeout_ms,
    waitUntil: task.wait_until,
    outputPath: "",
    actions: [
      {
        type: "extract_text",
        selector: "h1",
        as: "title"
      }
    ]
  });

  console.log(`[OK] ${engine} smoke passed`);
  console.log(JSON.stringify(result));
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${engine} smoke failed: ${message}`);
  process.exitCode = 1;
});

function readOption(optionName) {
  const args = process.argv.slice(2);
  const index = args.findIndex((item) => item === optionName);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}
