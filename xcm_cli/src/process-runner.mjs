import { spawn } from "node:child_process";

// On Windows, batch files (.cmd) cannot be executed by CreateProcess directly
// and require cmd.exe. Passing argv as separate elements to cmd.exe /c avoids
// the DEP0190 warning (which fires when shell:true concatenates args as a string).
function buildSpawnArgs(command, args) {
  if (process.platform === "win32") {
    return { cmd: "cmd.exe", args: ["/c", command, ...args] };
  }
  return { cmd: command, args };
}

export function runCommand(command, args, options = {}) {
  const { cmd, args: spawnArgs } = buildSpawnArgs(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, spawnArgs, {
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
