import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let parserCache = null;

export async function getParserByName(parserName) {
  if (!parserCache) {
    parserCache = await loadParsers();
  }

  const parser = parserCache.get(parserName);
  if (!parser) {
    const available = [...parserCache.keys()].join(", ");
    throw new Error(`Unknown parser: ${parserName}. Available parsers: ${available}`);
  }

  return parser;
}

async function loadParsers() {
  const entries = await fs.readdir(__dirname);
  const map = new Map();

  for (const entry of entries) {
    if (!entry.endsWith(".mjs") || entry === "index.mjs") {
      continue;
    }

    const filePath = path.join(__dirname, entry);
    const moduleUrl = pathToFileURL(filePath).href;
    const mod = await import(moduleUrl);

    if (typeof mod.name !== "string" || typeof mod.parsePrompt !== "function") {
      continue;
    }

    map.set(mod.name, {
      name: mod.name,
      parsePrompt: mod.parsePrompt
    });
  }

  return map;
}
