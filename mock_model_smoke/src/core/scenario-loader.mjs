import fs from "node:fs/promises";
import path from "node:path";

export async function loadScenario(scenarioPath, options) {
  const { rootDir, templateValues } = options;
  const absolutePath = path.resolve(rootDir, scenarioPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const scenario = JSON.parse(raw);

  const values = templateValues ?? {};
  const requests = (scenario.requests ?? []).map((req, index) => {
    const prompt = applyTemplates(String(req.prompt ?? ""), values);
    return {
      id: req.id ?? `request-${index + 1}`,
      prompt,
      expectSuccess: req.expectSuccess !== false,
      metadata: req.metadata ?? {}
    };
  });

  return {
    name: scenario.name ?? "unnamed-scenario",
    description: scenario.description ?? "",
    requests
  };
}

function applyTemplates(text, values) {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key) => {
    if (Object.hasOwn(values, key)) {
      return String(values[key]);
    }

    return "";
  });
}
