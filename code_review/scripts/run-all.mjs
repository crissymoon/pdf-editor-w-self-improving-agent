import fs from 'node:fs/promises';
import path from 'node:path';
import { loadReviewConfig, runReview, runSmokeTests } from '../review-core.mjs';

const rootDir = path.resolve(path.join(process.cwd()));
const checks = [
  'file-lines',
  'code-smells',
  'security',
  'complexity',
  'performance-memory',
  'go-funcs',
  'pdo-pep-templating',
  'dependency-audit',
  'server-readiness',
  'wcag-colors',
];

const profile = process.env.REVIEW_PROFILE === 'advisory' ? 'advisory' : 'strict';
const config = await loadReviewConfig(rootDir);

const review = await runReview(checks, rootDir, config);
const smoke = await runSmokeTests(rootDir);

const report = {
  generatedAt: new Date().toISOString(),
  rootDir,
  profile,
  config,
  summary: review.summary,
  smoke,
  findings: review.findings,
};

const reportPath = path.join(rootDir, 'code_review', 'reports', 'latest-review.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('Code review completed.');
console.log(`Profile: ${profile}`);
console.log(`Summary: total=${review.summary.total}, high=${review.summary.high}, medium=${review.summary.medium}, low=${review.summary.low}`);
console.log(`Smoke tests: ${smoke.map((s) => `${s.name}=${s.success ? 'pass' : 'fail'}`).join(', ') || 'none'}`);
console.log(`Report: ${reportPath}`);

const failPolicy = config.failPolicy ?? {};
const maxHigh = Number.isInteger(failPolicy.maxHigh) ? failPolicy.maxHigh : 0;
const maxMedium = Number.isInteger(failPolicy.maxMedium) ? failPolicy.maxMedium : 5;
const failOnSmoke = failPolicy.failOnSmoke !== false;

const shouldFailStrict = review.summary.high > maxHigh || review.summary.medium > maxMedium || (failOnSmoke && smoke.some((s) => !s.success));
const shouldFail = profile === 'strict' ? shouldFailStrict : false;

if (shouldFail) {
  process.exitCode = 1;
}
