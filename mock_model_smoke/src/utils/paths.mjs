import path from "node:path";

export function resolveSafePath(rootDir, relativeOrAbsolute) {
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? path.normalize(relativeOrAbsolute)
    : path.resolve(rootDir, relativeOrAbsolute);

  const normalizedRoot = path.resolve(rootDir);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootDir and is blocked: ${relativeOrAbsolute}`);
  }

  return resolved;
}

export function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
