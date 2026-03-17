import path from 'node:path';
import { checkWcagColors } from '../review-core.mjs';

const rootDir = path.resolve(process.cwd());
const result = await checkWcagColors(rootDir);

const hardcoded = result.findings.filter((f) => f.message.startsWith('Hardcoded'));
const contrastHigh = result.findings.filter((f) => f.severity === 'high');
const contrastMedium = result.findings.filter((f) => f.severity === 'medium' && !f.message.startsWith('Hardcoded'));
const contrastLow = result.findings.filter((f) => f.severity === 'low' && !f.message.startsWith('Hardcoded'));

console.log(`WCAG color check: ${result.findings.length} finding(s)`);
console.log(`  Hardcoded values (use CSS vars): ${hardcoded.length}`);
console.log(`  Contrast fail - all levels (high): ${contrastHigh.length}`);
console.log(`  Contrast fail - AA normal text (medium): ${contrastMedium.length}`);
console.log(`  Contrast advisory - AAA (low): ${contrastLow.length}`);
console.log('');

for (const f of result.findings) {
  console.log(`${f.severity.toUpperCase()} ${f.file}:${f.line}`);
  console.log(`  ${f.message}`);
  console.log(`  Fix: ${f.recommendation}`);
  console.log('');
}

if (result.summary.high > 0) process.exitCode = 1;
