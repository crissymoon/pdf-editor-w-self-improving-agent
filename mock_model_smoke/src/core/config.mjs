import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG = {
  parser: "generic-ts-edit",
  requestsPerSecond: 8,
  burst: 16,
  workerCount: 4,
  maxQueue: 200,
  dryRun: true,
  rootDir: ".",
  outputDir: "mock_model_smoke/output"
};

export async function loadConfig(configPath, workspaceRoot) {
  const defaultConfigPath = path.resolve(workspaceRoot, "mock_model_smoke/config/default.config.json");
  const rawDefault = await fs.readFile(defaultConfigPath, "utf8");
  const baseConfig = JSON.parse(rawDefault);

  if (!configPath) {
    return normalizeConfig({ ...DEFAULT_CONFIG, ...baseConfig }, workspaceRoot);
  }

  const rawOverride = await fs.readFile(path.resolve(workspaceRoot, configPath), "utf8");
  const override = JSON.parse(rawOverride);
  return normalizeConfig({ ...DEFAULT_CONFIG, ...baseConfig, ...override }, workspaceRoot);
}

function normalizeConfig(config, workspaceRoot) {
  return {
    ...config,
    requestsPerSecond: Number(config.requestsPerSecond),
    burst: Number(config.burst),
    workerCount: Math.max(1, Number(config.workerCount)),
    maxQueue: Math.max(1, Number(config.maxQueue)),
    dryRun: Boolean(config.dryRun),
    rootDir: path.resolve(workspaceRoot, config.rootDir),
    outputDir: path.resolve(workspaceRoot, config.outputDir)
  };
}
