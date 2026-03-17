export const name = "json-edit";

const SUPPORTED_TYPES = new Set([
  "replace_text",
  "insert_line",
  "delete_line",
  "append_text",
  "create_directory",
  "create_file",
  "delete_file",
  "move_file",
  "list_directory",
  "noop"
]);

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

  if (type === "create_directory") {
    const dirPath = String(payload.dirPath || payload.filePath || "").trim();
    if (!dirPath) {
      return { success: false, error: "create_directory requires dirPath." };
    }

    return {
      success: true,
      value: {
        type,
        dirPath
      }
    };
  }

  if (type === "list_directory") {
    const dirPath = String(payload.dirPath || payload.filePath || "").trim();
    if (!dirPath) {
      return { success: false, error: "list_directory requires dirPath." };
    }

    return {
      success: true,
      value: {
        type,
        dirPath
      }
    };
  }

  if (!filePath) {
    return { success: false, error: "filePath is required." };
  }

  if (type === "create_file") {
    return {
      success: true,
      value: {
        type,
        filePath,
        content: String(payload.content || payload.text || ""),
        overwrite: Boolean(payload.overwrite)
      }
    };
  }

  if (type === "delete_file") {
    return {
      success: true,
      value: {
        type,
        filePath
      }
    };
  }

  if (type === "move_file") {
    const destinationPath = String(payload.destinationPath || payload.to || "").trim();
    if (!destinationPath) {
      return { success: false, error: "move_file requires destinationPath." };
    }

    return {
      success: true,
      value: {
        type,
        filePath,
        destinationPath
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
