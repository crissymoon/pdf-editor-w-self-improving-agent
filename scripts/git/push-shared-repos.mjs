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

function getAheadCount(repoDir) {
  const probe = runGit(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFail: true });
  if (probe.status !== 0) {
    return null;
  }
  const ahead = (runGit(repoDir, ['rev-list', '--count', '@{u}..HEAD']).stdout || '0').trim();
  return Number.parseInt(ahead, 10) || 0;
}

function push(repoDir, branch) {
  const hasUpstream = runGit(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFail: true }).status === 0;
  if (hasUpstream) {
    return runGit(repoDir, ['push']);
  }
  return runGit(repoDir, ['push', '-u', 'origin', branch]);
}

let hadError = false;

for (const repo of repos) {
  try {
    if (!hasRepo(repo.dir)) {
      console.log(`[skip] ${repo.name}: not a git repo at ${repo.dir}`);
      continue;
    }

    const branch = getBranch(repo.dir);
    if (!branch) {
      console.log(`[skip] ${repo.name}: detached HEAD`);
      continue;
    }

    const dirty = getDirty(repo.dir);
    if (dirty) {
      console.log(`[skip] ${repo.name}: uncommitted changes present`);
      continue;
    }

    const ahead = getAheadCount(repo.dir);
    if (ahead === 0) {
      console.log(`[ok] ${repo.name}: already up to date on ${branch}`);
      continue;
    }

    push(repo.dir, branch);
    if (ahead === null) {
      console.log(`[push] ${repo.name}: pushed ${branch} and set upstream`);
    } else {
      console.log(`[push] ${repo.name}: pushed ${ahead} commit(s) on ${branch}`);
    }
  } catch (error) {
    hadError = true;
    console.error(`[error] ${repo.name}: ${error.message}`);
  }
}

if (hadError) {
  process.exitCode = 1;
}
