#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./src/config-loader.mjs";
import { renderHelp, renderGroupHelp } from "./src/help-renderer.mjs";
import { resolveCommand } from "./src/command-resolver.mjs";
import { executeAction } from "./src/executor.mjs";
import { parseArgs } from "./src/arg-parser.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "config", "commands.json");

async function main() {
  const config = loadConfig(configPath);
  const parsed = parseArgs(config, process.argv.slice(2));
  const first = parsed.positionals[0];

  if (!first || parsed.options.has("--help")) {
    console.log(renderHelp(config));
    return;
  }

  if (parsed.options.has("--json-help")) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  const resolved = resolveCommand(config, parsed.positionals);
  if (!resolved) {
    console.error(`Unknown command: ${parsed.positionals.join(" ")}`);
    console.log("");
    console.log(renderHelp(config));
    process.exitCode = 1;
    return;
  }

  if (resolved.type === "group") {
    console.log(renderGroupHelp(config, resolved.group));
    return;
  }

  const command = resolved.command;

  if (command.action === "help") {
    console.log(renderHelp(config));
    return;
  }

  if (command.action === "version") {
    console.log(config.meta?.version || "0.0.0");
    return;
  }

  if (parsed.options.has("--dry-run")) {
    console.log(JSON.stringify({ dryRun: true, command }, null, 2));
    return;
  }

  await executeAction(command);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
