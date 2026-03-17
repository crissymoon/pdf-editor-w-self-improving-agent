import fs from "node:fs/promises";
import path from "node:path";
import { buildUnifiedDiff } from "./diff-utils.mjs";
import { resolveSafePath, toPosixPath } from "../utils/paths.mjs";

export async function executeAction(action, options) {
  const { rootDir, applyEdits } = options;

  if (!action || action.type === "noop") {
    return {
      ok: true,
      changed: false,
      actionType: action?.type ?? "noop",
      message: action?.reason ?? "No operation was needed."
    };
  }

  const absolutePath = resolveSafePath(rootDir, action.filePath);
  const relativePath = toPosixPath(path.relative(rootDir, absolutePath));

  const beforeText = await fs.readFile(absolutePath, "utf8");
  const afterText = applyEditAction(beforeText, action);
  const changed = beforeText !== afterText;

  if (applyEdits && changed) {
    await fs.writeFile(absolutePath, afterText, "utf8");
  }

  return {
    ok: true,
    changed,
    actionType: action.type,
    filePath: relativePath,
    diff: buildUnifiedDiff(relativePath, beforeText, afterText)
  };
}

function applyEditAction(source, action) {
  switch (action.type) {
    case "replace_text":
      return replaceText(source, action.target, action.replacement);
    case "insert_line":
      return insertAtLine(source, action.line, action.text);
    case "delete_line":
      return deleteAtLine(source, action.line);
    case "append_text":
      return appendText(source, action.text);
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

function replaceText(source, target, replacement) {
  if (!target) {
    throw new Error("replace_text requires a non-empty target.");
  }

  if (!source.includes(target)) {
    throw new Error(`Target text not found: ${target}`);
  }

  return source.replace(target, replacement ?? "");
}

function insertAtLine(source, oneBasedLine, text) {
  const lines = source.split(/\r?\n/);
  const line = normalizeLineNumber(oneBasedLine, lines.length + 1);
  lines.splice(line - 1, 0, text ?? "");
  return lines.join("\n");
}

function deleteAtLine(source, oneBasedLine) {
  const lines = source.split(/\r?\n/);
  const line = normalizeLineNumber(oneBasedLine, lines.length);
  lines.splice(line - 1, 1);
  return lines.join("\n");
}

function appendText(source, text) {
  if (!text) {
    return source;
  }

  if (source.endsWith("\n")) {
    return `${source}${text}`;
  }

  return `${source}\n${text}`;
}

function normalizeLineNumber(line, max) {
  const value = Number(line);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Line number out of range: ${line}. Allowed range is 1..${max}.`);
  }

  return value;
}
