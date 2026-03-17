import fs from "node:fs";
import path from "node:path";

export function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const config = JSON.parse(raw);

  if (!config || typeof config !== "object") {
    throw new Error("Invalid CLI config. Expected an object.");
  }

  if (!Array.isArray(config.commands)) {
    throw new Error("Invalid CLI config. Missing commands array.");
  }

  return config;
}
