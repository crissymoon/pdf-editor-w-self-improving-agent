export const name = "json-edit";

const SUPPORTED_TYPES = new Set(["replace_text", "insert_line", "delete_line", "append_text", "noop"]);

export function parsePrompt(prompt) {
  const raw = String(prompt || "").trim();
  if (!raw) {
    return failure("Prompt is empty.");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_error) {
    return failure("Prompt is not valid JSON for json-edit parser.");
  }

  const action = normalizeAction(payload);
  if (!action.success) {
    return failure(action.error);
  }

  return {
    success: true,
    action: action.value
  };
}

function normalizeAction(payload) {
  if (!payload || typeof payload !== "object") {
    return { success: false, error: "JSON prompt must be an object." };
  }

  const type = String(payload.type || payload.action || "").trim();
  if (!SUPPORTED_TYPES.has(type)) {
    return { success: false, error: `Unsupported action type: ${type || "(empty)"}` };
  }

  if (type === "noop") {
    return {
      success: true,
      value: {
        type: "noop",
        reason: String(payload.reason || "No operation requested.")
      }
    };
  }

  const filePath = String(payload.filePath || "").trim();
  if (!filePath) {
    return { success: false, error: "filePath is required." };
  }

  if (type === "replace_text") {
    return {
      success: true,
      value: {
        type,
        filePath,
        target: String(payload.target || ""),
        replacement: String(payload.replacement || "")
      }
    };
  }

  if (type === "insert_line") {
    return {
      success: true,
      value: {
        type,
        filePath,
        line: Number(payload.line),
        text: String(payload.text || "")
      }
    };
  }

  if (type === "delete_line") {
    return {
      success: true,
      value: {
        type,
        filePath,
        line: Number(payload.line)
      }
    };
  }

  return {
    success: true,
    value: {
      type,
      filePath,
      text: String(payload.text || "")
    }
  };
}

function failure(error) {
  return {
    success: false,
    error,
    action: {
      type: "noop",
      reason: error
    }
  };
}
