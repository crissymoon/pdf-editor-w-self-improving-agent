import path from 'node:path';
import { runSmokeTests } from '../review-core.mjs';

const rootDir = path.resolve(process.cwd());
const checks = await runSmokeTests(rootDir);

for (const check of checks) {
  console.log(`${check.name}: ${check.success ? 'pass' : 'fail'}`);
  if (!check.success) {
    console.log(check.output);
  }
}

if (checks.some((c) => !c.success)) {
  process.exitCode = 1;
}
