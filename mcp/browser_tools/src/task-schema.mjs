export function normalizeTaskInput(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Task input must be a JSON object.");
  }

  const url = String(raw.url || "").trim();
  if (!url) {
    throw new Error("Task input requires a non-empty url.");
  }

  const actions = Array.isArray(raw.actions) ? raw.actions : [];
  return {
    url,
    headless: raw.headless !== false,
    timeoutMs: normalizeNumber(raw.timeout_ms, 15000),
    waitUntil: normalizeWaitUntil(raw.wait_until),
    outputPath: normalizeString(raw.output_path),
    actions: actions.map(normalizeAction)
  };
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") {
    throw new Error("Each action must be an object.");
  }

  const type = normalizeString(action.type);
  if (!type) {
    throw new Error("Action type is required.");
  }

  return {
    type,
    selector: normalizeString(action.selector),
    text: normalizeString(action.text),
    as: normalizeString(action.as),
    ms: normalizeNumber(action.ms, 0),
    path: normalizeString(action.path),
    fullPage: action.full_page === true
  };
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeWaitUntil(value) {
  const current = normalizeString(value).toLowerCase();
  if (current === "domcontentloaded" || current === "networkidle") {
    return current;
  }
  return "load";
}
