import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const dblPath = path.join(repoRoot, 'src', 'agent', 'agent-dbl');
const mainPath = path.join(repoRoot, 'src', 'agent', 'agent-main');

async function promote() {
  await fs.access(dblPath);
  await fs.rm(mainPath, { recursive: true, force: true });
  await fs.cp(dblPath, mainPath, { recursive: true });
  console.log('Promoted agent-dbl to agent-main');
}

promote().catch((error) => {
  console.error('Promotion failed:', error.message);
  process.exitCode = 1;
});
