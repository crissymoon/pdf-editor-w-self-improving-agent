import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const mapPath = path.join(repoRoot, 'scripts', 'agent', 'readme-folder-updates-map.json');

async function fileExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeContent(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return '- No updates provided yet.';
  }
  return trimmed;
}

function buildGeneratedSection(entries) {
  const lines = [];

  for (const entry of entries) {
    lines.push(`### ${entry.title}`);
    lines.push(`- Folder: ${entry.folder}`);
    lines.push(`- Update source: ${entry.updateFile}`);

    const content = normalizeContent(entry.content || '');
    lines.push(content);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

async function loadMappedEntries(config) {
  const loaded = [];

  for (const entry of config.entries || []) {
    const updatePath = path.join(repoRoot, entry.updateFile);
    let content = '- No update file found for this folder yet.';

    if (await fileExists(updatePath)) {
      const raw = await fs.readFile(updatePath, 'utf8');
      content = raw;
    }

    loaded.push({
      folder: String(entry.folder || '').trim(),
      title: String(entry.title || entry.folder || 'Folder Update').trim(),
      updateFile: String(entry.updateFile || '').trim(),
      content,
    });
  }

  return loaded;
}

function injectSection(readme, startMarker, endMarker, generated) {
  const block = `${startMarker}\n${generated}\n${endMarker}`;

  if (readme.includes(startMarker) && readme.includes(endMarker)) {
    const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'm');
    return readme.replace(pattern, block);
  }

  const suffix = `\n\n## Folder Update Map\n\n${block}\n`;
  return `${readme.trimEnd()}${suffix}`;
}

async function generate() {
  const rawConfig = await fs.readFile(mapPath, 'utf8');
  const config = JSON.parse(rawConfig);

  const readmePath = path.join(repoRoot, String(config.readmePath || 'README.md'));
  const startMarker = String(config.startMarker || '<!-- FOLDER_UPDATES:START -->');
  const endMarker = String(config.endMarker || '<!-- FOLDER_UPDATES:END -->');

  const readmeCurrent = await fs.readFile(readmePath, 'utf8');
  const entries = await loadMappedEntries(config);
  const generated = buildGeneratedSection(entries);
  const nextReadme = injectSection(readmeCurrent, startMarker, endMarker, generated);

  await fs.writeFile(readmePath, nextReadme, 'utf8');

  console.log(`Generated folder updates in ${path.relative(repoRoot, readmePath)}`);
  console.log(`Mapped folders processed: ${entries.length}`);
}

generate().catch((error) => {
  console.error('README folder update generation failed:', error.message);
  process.exitCode = 1;
});
