export const name = "generic-ts-edit";

const REPLACE_PATTERN = /^replace\s+text\s+["']([\s\S]*?)["']\s+with\s+["']([\s\S]*?)["']\s+in\s+(.+)$/i;
const INSERT_PATTERN = /^insert\s+["']([\s\S]*?)["']\s+at\s+line\s+(\d+)\s+in\s+(.+)$/i;
const DELETE_PATTERN = /^delete\s+line\s+(\d+)\s+in\s+(.+)$/i;
const APPEND_PATTERN = /^append\s+["']([\s\S]*?)["']\s+to\s+(.+)$/i;

export function parsePrompt(prompt) {
  const normalized = String(prompt || "").trim();

  if (!normalized) {
    return {
      success: false,
      error: "Prompt is empty.",
      action: { type: "noop", reason: "Prompt is empty." }
    };
  }

  const replaceMatch = normalized.match(REPLACE_PATTERN);
  if (replaceMatch) {
    return {
      success: true,
      action: {
        type: "replace_text",
        target: decodeEscapes(replaceMatch[1]),
        replacement: decodeEscapes(replaceMatch[2]),
        filePath: cleanFilePath(replaceMatch[3])
      }
    };
  }

  const insertMatch = normalized.match(INSERT_PATTERN);
  if (insertMatch) {
    return {
      success: true,
      action: {
        type: "insert_line",
        text: decodeEscapes(insertMatch[1]),
        line: Number(insertMatch[2]),
        filePath: cleanFilePath(insertMatch[3])
      }
    };
  }

  const deleteMatch = normalized.match(DELETE_PATTERN);
  if (deleteMatch) {
    return {
      success: true,
      action: {
        type: "delete_line",
        line: Number(deleteMatch[1]),
        filePath: cleanFilePath(deleteMatch[2])
      }
    };
  }

  const appendMatch = normalized.match(APPEND_PATTERN);
  if (appendMatch) {
    return {
      success: true,
      action: {
        type: "append_text",
        text: decodeEscapes(appendMatch[1]),
        filePath: cleanFilePath(appendMatch[2])
      }
    };
  }

  return {
    success: false,
    error: "No parser rule matched this prompt.",
    action: { type: "noop", reason: "No parser rule matched this prompt." }
  };
}

function cleanFilePath(value) {
  return String(value || "").trim();
}

function decodeEscapes(value) {
  return String(value || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}
