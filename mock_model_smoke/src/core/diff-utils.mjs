export function buildUnifiedDiff(filePath, beforeText, afterText, contextLines = 3) {
  if (beforeText === afterText) {
    return `--- ${filePath}\n+++ ${filePath}\n(no changes)`;
  }

  const beforeLines = beforeText.split(/\r?\n/);
  const afterLines = afterText.split(/\r?\n/);

  const firstDiff = findFirstDiff(beforeLines, afterLines);
  const lastDiff = findLastDiff(beforeLines, afterLines, firstDiff);

  const start = Math.max(0, firstDiff - contextLines);
  const beforeEnd = Math.min(beforeLines.length, lastDiff.before + contextLines + 1);
  const afterEnd = Math.min(afterLines.length, lastDiff.after + contextLines + 1);

  const beforeChunk = beforeLines.slice(start, beforeEnd);
  const afterChunk = afterLines.slice(start, afterEnd);

  const hunk = [];
  hunk.push(`@@ -${start + 1},${beforeChunk.length} +${start + 1},${afterChunk.length} @@`);

  for (const line of beforeChunk) {
    hunk.push(`-${line}`);
  }

  for (const line of afterChunk) {
    hunk.push(`+${line}`);
  }

  return [`--- ${filePath}`, `+++ ${filePath}`, ...hunk].join("\n");
}

function findFirstDiff(beforeLines, afterLines) {
  const minLen = Math.min(beforeLines.length, afterLines.length);
  for (let i = 0; i < minLen; i += 1) {
    if (beforeLines[i] !== afterLines[i]) {
      return i;
    }
  }

  return minLen;
}

function findLastDiff(beforeLines, afterLines, firstDiff) {
  let beforeIndex = beforeLines.length - 1;
  let afterIndex = afterLines.length - 1;

  while (beforeIndex >= firstDiff && afterIndex >= firstDiff) {
    if (beforeLines[beforeIndex] !== afterLines[afterIndex]) {
      break;
    }

    beforeIndex -= 1;
    afterIndex -= 1;
  }

  return {
    before: Math.max(beforeIndex, firstDiff),
    after: Math.max(afterIndex, firstDiff)
  };
}
