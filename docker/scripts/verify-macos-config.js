#!/usr/bin/env node
import fs from 'node:fs';

const packageJsonPath = 'package.json';
const raw = fs.readFileSync(packageJsonPath, 'utf8');
const pkg = JSON.parse(raw);

const errors = [];

if (!pkg.scripts || typeof pkg.scripts['pack:mac'] !== 'string') {
  errors.push('package.json is missing scripts.pack:mac');
}

const macBuild = pkg.build?.mac;
if (!macBuild) {
  errors.push('package.json is missing build.mac configuration');
}

const targets = Array.isArray(macBuild?.target) ? macBuild.target : [];
if (!targets.includes('dmg')) {
  errors.push('build.mac.target must include dmg');
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[ERROR] ${error}`);
  }
  process.exit(1);
}

console.log('[OK] macOS packaging configuration smoke check passed');
