import fs from "node:fs/promises";
import path from "node:path";
import { loadScenario } from "./scenario-loader.mjs";
import { executeRequests, writeReport } from "./runner.mjs";

export async function runSmokeSuite(config, workspaceRoot) {
  const outputDir = config.outputDir;
  const fixtureSource = path.resolve(workspaceRoot, "mock_model_smoke/fixtures/sample.ts");
  const tempDir = path.resolve(outputDir, "smoke-workspace");
  const tempFile = path.resolve(tempDir, "sample.ts");

  await fs.mkdir(tempDir, { recursive: true });
  await fs.copyFile(fixtureSource, tempFile);

  const scenario = await loadScenario("mock_model_smoke/scenarios/default-scenario.json", {
    rootDir: workspaceRoot,
    templateValues: {
      TARGET_FILE: toRelativePath(workspaceRoot, tempFile)
    }
  });

  const dryRunReport = await executeRequests(scenario.requests, {
    ...config,
    rootDir: workspaceRoot,
    dryRun: true
  }, {
    applyEdits: false
  });

  const applyRequests = [
    {
      id: "apply-1",
      prompt: `replace text \"Hello PDF World\" with \"Hello Smoke Test World\" in ${toRelativePath(workspaceRoot, tempFile)}`,
      expectSuccess: true
    }
  ];

  const applyReport = await executeRequests(applyRequests, {
    ...config,
    rootDir: workspaceRoot,
    dryRun: false
  }, {
    applyEdits: true
  });

  const updated = await fs.readFile(tempFile, "utf8");
  const applyVerified = updated.includes("Hello Smoke Test World");

  const summary = {
    smokePassed:
      dryRunReport.expectationMatchRate === 1 &&
      applyReport.expectationMatchRate === 1 &&
      applyVerified,
    dryRunReport,
    applyReport,
    applyVerified
  };

  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const reportPath = await writeReport(outputDir, `smoke-report-${timestamp}.json`, summary);

  return {
    ...summary,
    reportPath,
    tempFile
  };
}

function toRelativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}
