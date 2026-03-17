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

  switch (action.type) {
    case "create_directory":
      return createDirectoryAction(rootDir, action, applyEdits);
    case "create_file":
      return createFileAction(rootDir, action, applyEdits);
    case "delete_file":
      return deleteFileAction(rootDir, action, applyEdits);
    case "move_file":
      return moveFileAction(rootDir, action, applyEdits);
    case "list_directory":
      return listDirectoryAction(rootDir, action);
    default:
      return runTextEditAction(rootDir, action, applyEdits);
  }
}

async function runTextEditAction(rootDir, action, applyEdits) {
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

async function createDirectoryAction(rootDir, action, applyEdits) {
  const absoluteDir = resolveSafePath(rootDir, action.dirPath);
  const relativeDir = toPosixPath(path.relative(rootDir, absoluteDir));
  const existed = await pathExists(absoluteDir);

  if (applyEdits && !existed) {
    await fs.mkdir(absoluteDir, { recursive: true });
  }

  return {
    ok: true,
    changed: !existed,
    actionType: action.type,
    filePath: relativeDir,
    message: existed ? "Directory already exists." : "Directory created."
  };
}

async function createFileAction(rootDir, action, applyEdits) {
  const absolutePath = resolveSafePath(rootDir, action.filePath);
  const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
  const existed = await pathExists(absolutePath);

  if (existed && !action.overwrite) {
    throw new Error(`File already exists and overwrite=false: ${action.filePath}`);
  }

  const beforeText = existed ? await fs.readFile(absolutePath, "utf8") : "";
  const afterText = String(action.content || "");
  const changed = beforeText !== afterText || !existed;

  if (applyEdits && changed) {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
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

async function deleteFileAction(rootDir, action, applyEdits) {
  const absolutePath = resolveSafePath(rootDir, action.filePath);
  const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
  const existed = await pathExists(absolutePath);
  if (!existed) {
    throw new Error(`File not found for delete_file: ${action.filePath}`);
  }

  const beforeText = await fs.readFile(absolutePath, "utf8");
  if (applyEdits) {
    await fs.unlink(absolutePath);
  }

  return {
    ok: true,
    changed: true,
    actionType: action.type,
    filePath: relativePath,
    diff: buildUnifiedDiff(relativePath, beforeText, "")
  };
}

async function moveFileAction(rootDir, action, applyEdits) {
  const absoluteSource = resolveSafePath(rootDir, action.filePath);
  const absoluteDestination = resolveSafePath(rootDir, action.destinationPath);
  const relativeSource = toPosixPath(path.relative(rootDir, absoluteSource));
  const relativeDestination = toPosixPath(path.relative(rootDir, absoluteDestination));

  if (!(await pathExists(absoluteSource))) {
    throw new Error(`Source file not found for move_file: ${action.filePath}`);
  }

  if (await pathExists(absoluteDestination)) {
    throw new Error(`Destination already exists for move_file: ${action.destinationPath}`);
  }

  if (applyEdits) {
    await fs.mkdir(path.dirname(absoluteDestination), { recursive: true });
    await fs.rename(absoluteSource, absoluteDestination);
  }

  return {
    ok: true,
    changed: true,
    actionType: action.type,
    filePath: relativeSource,
    destinationPath: relativeDestination,
    message: `Moved ${relativeSource} -> ${relativeDestination}`
  };
}

async function listDirectoryAction(rootDir, action) {
  const absoluteDir = resolveSafePath(rootDir, action.dirPath);
  const relativeDir = toPosixPath(path.relative(rootDir, absoluteDir));
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  return {
    ok: true,
    changed: false,
    actionType: action.type,
    filePath: relativeDir,
    entries: entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file"
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
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
