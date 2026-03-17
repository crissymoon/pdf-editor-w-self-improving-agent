import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const reportPath = path.join(repoRoot, 'code_review', 'reports', 'latest-review.json');

function runGit(command) {
  try {
    return execSync(command, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function summarizeGitStatus() {
  const porcelain = runGit('git status --porcelain');
  if (!porcelain) {
    return {
      changed: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  const lines = porcelain.split(/\r?\n/).filter(Boolean);
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of lines) {
    const x = line[0] || ' ';
    const y = line[1] || ' ';

    if (x !== ' ' && x !== '?') {
      staged += 1;
    }
    if (y !== ' ' && y !== '?') {
      unstaged += 1;
    }
    if (x === '?' && y === '?') {
      untracked += 1;
    }
  }

  return {
    changed: lines.length,
    staged,
    unstaged,
    untracked,
  };
}

async function readReviewSummary() {
  try {
    const raw = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(raw);
    const summary = report?.summary || {};
    return {
      generatedAt: String(report?.generatedAt || 'unknown'),
      profile: String(report?.profile || 'unknown'),
      total: Number(summary?.total || 0),
      high: Number(summary?.high || 0),
      medium: Number(summary?.medium || 0),
      low: Number(summary?.low || 0),
    };
  } catch {
    return null;
  }
}

async function checkin() {
  const strictMode = process.argv.includes('--strict');
  const branch = runGit('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const lastCommit = runGit('git log -1 --pretty=format:%h %s') || 'unknown';
  const gitStatus = summarizeGitStatus();
  const review = await readReviewSummary();

  console.log('=== XCM Agent Check-In ===');
  console.log(`Mode: ${strictMode ? 'strict' : 'advisory'}`);
  console.log(`Branch: ${branch}`);
  console.log(`Last commit: ${lastCommit}`);
  console.log(
    `Working tree: changed=${gitStatus.changed}, staged=${gitStatus.staged}, unstaged=${gitStatus.unstaged}, untracked=${gitStatus.untracked}`,
  );

  if (review) {
    console.log(`Review profile: ${review.profile}`);
    console.log(`Review generated: ${review.generatedAt}`);
    console.log(
      `Findings: total=${review.total}, high=${review.high}, medium=${review.medium}, low=${review.low}`,
    );

    if (strictMode && review.high > 0) {
      console.error('Strict check-in failed: high-severity findings detected.');
      process.exitCode = 1;
      return;
    }
  } else {
    console.log('Review report: missing (run npm run review:advisory first)');
    if (strictMode) {
      console.error('Strict check-in failed: review report is required.');
      process.exitCode = 1;
      return;
    }
  }

  console.log('Next: npm run agent:promote (if dbl is ready)');
  console.log('Next: npm run review:advisory (refresh quality snapshot)');
}

checkin().catch((error) => {
  console.error('Agent check-in failed:', error.message);
  process.exitCode = 1;
});
