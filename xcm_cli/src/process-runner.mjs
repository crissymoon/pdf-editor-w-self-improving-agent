import { spawn } from "node:child_process";

// On Windows, npm/npx are .cmd batch files and cannot be invoked directly
// without the shell. Using the .cmd extension avoids shell:true (which
// triggers DEP0190 because args are concatenated, not escaped).
const CMD_ALIASES = new Set(["npm", "npx"]);
function resolveCmd(command) {
  if (process.platform === "win32" && CMD_ALIASES.has(command)) {
    return command + ".cmd";
  }
  return command;
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCmd(command), args, {
      stdio: "inherit",
      shell: false,
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env
    });

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code})`));
    });
  });
}
