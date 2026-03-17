#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootRepo = path.resolve(__dirname, '..', '..');
const linkedRepo = path.resolve(rootRepo, process.env.XCM_AUTH_PATH || 'xcm_auth');

const repos = [
  { name: 'pdf-editor', dir: rootRepo },
  { name: 'xcm_auth (linked)', dir: linkedRepo },
];

function runGit(repoDir, args, { allowFail = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed in ${repoDir}${detail ? `: ${detail}` : ''}`);
  }

  return result;
}

function hasRepo(repoDir) {
  const check = runGit(repoDir, ['rev-parse', '--is-inside-work-tree'], { allowFail: true });
  return check.status === 0 && (check.stdout || '').trim() === 'true';
}

function getBranch(repoDir) {
  return (runGit(repoDir, ['branch', '--show-current']).stdout || '').trim();
}

function getDirty(repoDir) {
  return (runGit(repoDir, ['status', '--porcelain']).stdout || '').trim().length > 0;
}

function hasUpstream(repoDir) {
  return runGit(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFail: true }).status === 0;
}

function getAheadCount(repoDir) {
  if (!hasUpstream(repoDir)) {
    return null;
  }
  const ahead = (runGit(repoDir, ['rev-list', '--count', '@{u}..HEAD']).stdout || '0').trim();
  return Number.parseInt(ahead, 10) || 0;
}

function getPendingCommitLines(repoDir, limit = 5) {
  if (!hasUpstream(repoDir)) {
    const lines = (runGit(repoDir, ['log', '--oneline', '-n', String(limit)], { allowFail: true }).stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean);
    return lines;
  }

  const lines = (runGit(repoDir, ['log', '--oneline', `@{u}..HEAD`, '-n', String(limit)], { allowFail: true }).stdout || '')
    .trim()
    .split('\n')
    .filter(Boolean);
  return lines;
}

function push(repoDir, branch) {
  if (hasUpstream(repoDir)) {
    return runGit(repoDir, ['push']);
  }
  return runGit(repoDir, ['push', '-u', 'origin', branch]);
}

function summarizeResult(result) {
  return `[summary] ${result.name}: ${result.state}`;
}

const results = [];
let hadError = false;

console.log('[shared-sync] preflight checks');

for (const repo of repos) {
  try {
    if (!hasRepo(repo.dir)) {
      const state = `skip (not a git repo at ${repo.dir})`;
      console.log(`[skip] ${repo.name}: not a git repo at ${repo.dir}`);
      results.push({ name: repo.name, state });
      continue;
    }

    const branch = getBranch(repo.dir);
    if (!branch) {
      const state = 'skip (detached HEAD)';
      console.log(`[skip] ${repo.name}: detached HEAD`);
      results.push({ name: repo.name, state });
      continue;
    }

    if (getDirty(repo.dir)) {
      const state = `skip (dirty working tree on ${branch})`;
      console.log(`[skip] ${repo.name}: uncommitted changes present`);
      results.push({ name: repo.name, state });
      continue;
    }

    const ahead = getAheadCount(repo.dir);
    const pending = getPendingCommitLines(repo.dir, 5);

    if (ahead === 0) {
      const state = `ok (up to date on ${branch})`;
      console.log(`[ok] ${repo.name}: already up to date on ${branch}`);
      results.push({ name: repo.name, state });
      continue;
    }

    if (ahead === null) {
      console.log(`[plan] ${repo.name}: no upstream configured on ${branch}; push will set upstream`);
    } else {
      console.log(`[plan] ${repo.name}: ${ahead} commit(s) pending on ${branch}`);
    }

    if (pending.length > 0) {
      console.log(`[plan] ${repo.name}: pending commits (top ${pending.length})`);
      for (const line of pending) {
        console.log(`  - ${line}`);
      }
    }

    push(repo.dir, branch);

    if (ahead === null) {
      const state = `pushed (set upstream for ${branch})`;
      console.log(`[push] ${repo.name}: pushed and set upstream on ${branch}`);
      results.push({ name: repo.name, state });
    } else {
      const state = `pushed (${ahead} commit(s) on ${branch})`;
      console.log(`[push] ${repo.name}: pushed ${ahead} commit(s) on ${branch}`);
      results.push({ name: repo.name, state });
    }
  } catch (error) {
    hadError = true;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] ${repo.name}: ${message}`);
    results.push({ name: repo.name, state: `error (${message})` });
  }
}

console.log('[shared-sync] summary');
for (const result of results) {
  console.log(summarizeResult(result));
}

if (hadError) {
  process.exitCode = 1;
}
