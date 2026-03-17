import { execSync } from "node:child_process";
import { runCommand } from "./process-runner.mjs";

async function runNpmScript(script) {
  await runCommand("npm", ["run", script]);
}

async function runSequence(steps = []) {
  for (const step of steps) {
    await executeAction(step);
  }
}

async function runGitPushCurrent() {
  const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
  if (!branch) {
    throw new Error("Unable to detect current git branch.");
  }

  await runCommand("git", ["push", "-u", "origin", branch]);
}

const actionHandlers = {
  npm: async (commandConfig) => runNpmScript(commandConfig.script),
  sequence: async (commandConfig) => runSequence(commandConfig.steps),
  "git-push-current": async () => runGitPushCurrent()
};

export async function executeAction(commandConfig) {
  const action = commandConfig?.action;

  const handler = actionHandlers[action];
  if (handler) {
    await handler(commandConfig);
    return;
  }

  throw new Error(`Unsupported action: ${String(action)}`);
}
