#!/usr/bin/env node
import process from "node:process";
import { normalizeTaskInput } from "./task-schema.mjs";
import { runPlaywrightTask } from "./engines/playwright-engine.mjs";
import { runPuppeteerTask } from "./engines/puppeteer-engine.mjs";

async function main() {
  const engine = readOption("--engine") || "playwright";
  const rawInput = await readStdinJson();
  const input = normalizeTaskInput(rawInput);

  let result;
  if (engine === "playwright") {
    result = await runPlaywrightTask(input);
  } else if (engine === "puppeteer") {
    result = await runPuppeteerTask(input);
  } else {
    throw new Error(`Unsupported engine: ${engine}`);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function readOption(optionName) {
  const args = process.argv.slice(2);
  const index = args.findIndex((item) => item === optionName);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    throw new Error("Runner expects task JSON payload on stdin.");
  }

  return JSON.parse(text);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
