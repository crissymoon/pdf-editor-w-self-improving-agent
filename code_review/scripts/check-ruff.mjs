import path from 'node:path';
import { runReview } from '../review-core.mjs';

const rootDir = path.resolve(process.cwd());
const report = await runReview(['ruff'], rootDir);

console.log(JSON.stringify(report.summary, null, 2));
for (const finding of report.findings.slice(0, 100)) {
  console.log(`${finding.severity.toUpperCase()} ${finding.file}:${finding.line} ${finding.message}`);
}
if (report.summary.high > 0 || report.summary.medium > 0) process.exitCode = 1;