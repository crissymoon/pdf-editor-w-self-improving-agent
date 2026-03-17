import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'release', 'coverage', 'code_review',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.dart_tool',
  '.gradle', 'build', 'Pods', '.venv', 'venv'
]);
const EXCLUDED_FILES = new Set(['package-lock.json']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html',
  '.md', '.txt', '.py', '.go', '.php', '.sql', '.yml', '.yaml', '.xml', '.ini', '.sh', '.bat'
]);
const DEFAULT_EXCLUDED_PREFIXES = [
  'email_smoke/',
  'pdf_tests/generated/',
  'pdf_tests/generated_quick/',
  'mobile/ios/Flutter/ephemeral/',
  'mobile/.dart_tool/',
  'mobile/build/',
  'mobile/android/.gradle/',
  'mobile/android/app/build/',
  'mobile/ios/Pods/',
  'mcp/bin/'
];

const DEFAULT_CONFIG = {
  maxFileLines: 1000,
  complexityThreshold: 15,
  maxPythonLineLength: 100,
  excludePrefixes: DEFAULT_EXCLUDED_PREFIXES,
  failPolicy: {
    maxHigh: 0,
    maxMedium: 5,
    failOnSmoke: true,
  },
  ignore: {},
};

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    excludePrefixes: Array.from(new Set([...(base.excludePrefixes ?? []), ...(override?.excludePrefixes ?? [])])),
    failPolicy: {
      ...base.failPolicy,
      ...(override?.failPolicy ?? {}),
    },
    ignore: {
      ...base.ignore,
      ...(override?.ignore ?? {}),
    },
  };
}

export async function loadReviewConfig(rootDir) {
  const configPath = path.join(rootDir, 'code_review', 'config.json');
  if (!(await fileExists(configPath))) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function normalizePrefix(prefix) {
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function isPathExcluded(rootDir, targetPath, config = DEFAULT_CONFIG, isDirectory = false) {
  const rel = normalizePath(path.relative(rootDir, targetPath));
  if (!rel) {
    return false;
  }

  const prefixes = Array.isArray(config?.excludePrefixes) ? config.excludePrefixes : DEFAULT_EXCLUDED_PREFIXES;
  const subject = isDirectory ? normalizePrefix(rel) : rel;
  return prefixes.some((prefix) => subject.startsWith(normalizePrefix(prefix)));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir, config = DEFAULT_CONFIG) {
  const files = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !isPathExcluded(rootDir, fullPath, config, true)) {
          await walk(fullPath);
        }
        continue;
      }
      if (EXCLUDED_FILES.has(entry.name) || isPathExcluded(rootDir, fullPath, config, false)) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function commandExists(command, cwd) {
  const probe = process.platform === 'win32'
    ? await runCommand('where', [command], cwd)
    : await runCommand('which', [command], cwd);
  return probe.code === 0;
}

async function findGoModuleDirs(rootDir, config = DEFAULT_CONFIG) {
  const moduleDirs = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const hasGoMod = entries.some((entry) => entry.isFile() && entry.name === 'go.mod');
    if (hasGoMod) {
      moduleDirs.push(currentDir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (EXCLUDED_DIRS.has(entry.name) || isPathExcluded(rootDir, fullPath, config, true)) {
        continue;
      }
      await walk(fullPath);
    }
  }

  await walk(rootDir);
  return moduleDirs;
}

async function getGoBinCommand(binName, cwd) {
  if (await commandExists(binName, cwd)) {
    return { command: binName, argsPrefix: [] };
  }

  const gopath = await runCommand('go', ['env', 'GOPATH'], cwd);
  if (gopath.code !== 0) {
    return null;
  }

  const goBin = gopath.stdout.trim();
  if (!goBin) {
    return null;
  }

  const executable = process.platform === 'win32'
    ? path.join(goBin, 'bin', `${binName}.exe`)
    : path.join(goBin, 'bin', binName);
  if (!(await fileExists(executable))) {
    return null;
  }

  return { command: executable, argsPrefix: [] };
}

async function getRuffCommand(cwd) {
  const localVenvPython = process.platform === 'win32'
    ? path.join(cwd, '.venv', 'Scripts', 'python.exe')
    : path.join(cwd, '.venv', 'bin', 'python');
  if (await fileExists(localVenvPython)) {
    return { command: localVenvPython, argsPrefix: ['-m', 'ruff'] };
  }

  if (await commandExists('ruff', cwd)) {
    return { command: 'ruff', argsPrefix: [] };
  }

  if (process.platform === 'win32') {
    const py = await commandExists('py', cwd);
    if (py) {
      return { command: 'py', argsPrefix: ['-3', '-m', 'ruff'] };
    }
    const python = await commandExists('python', cwd);
    if (python) {
      return { command: 'python', argsPrefix: ['-m', 'ruff'] };
    }
  }

  const python3 = await commandExists('python3', cwd);
  if (python3) {
    return { command: 'python3', argsPrefix: ['-m', 'ruff'] };
  }
  const python = await commandExists('python', cwd);
  if (python) {
    return { command: 'python', argsPrefix: ['-m', 'ruff'] };
  }

  return null;
}

function toLines(text) {
  return text.split(/\r?\n/);
}

function relative(rootDir, fullPath) {
  return normalizePath(path.relative(rootDir, fullPath));
}

function severityRank(level) {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

function summarizeFindings(findings) {
  return findings.reduce(
    (acc, finding) => {
      acc.total += 1;
      acc[finding.severity] += 1;
      return acc;
    },
    { total: 0, low: 0, medium: 0, high: 0 }
  );
}

function finding({ check, severity, file, line, message, recommendation }) {
  return { check, severity, file, line, message, recommendation };
}

function shouldIgnoreFinding(config, checkName, candidate) {
  const rules = config?.ignore?.[checkName];
  if (!Array.isArray(rules) || rules.length === 0) {
    return false;
  }

  return rules.some((rule) => {
    const fileMatch = !rule.file || rule.file === candidate.file;
    const messageMatch = !rule.messageIncludes || candidate.message.includes(rule.messageIncludes);
    return fileMatch && messageMatch;
  });
}

function applyIgnoreRules(config, checkName, findings) {
  return findings.filter((item) => !shouldIgnoreFinding(config, checkName, item));
}

async function runCommand(command, args, cwd) {
  return await new Promise((resolve) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], { cwd, shell: false })
      : spawn(command, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', () => {
      resolve({ code: 127, stdout, stderr });
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function getLineNumber(lines, index) {
  return Math.max(1, Math.min(lines.length, index + 1));
}

export async function checkFileLines(rootDir, config = DEFAULT_CONFIG) {
  const files = await collectFiles(rootDir, config);
  const findings = [];

  for (const filePath of files) {
    const text = await readText(filePath);
    const lines = toLines(text);
    if (lines.length > config.maxFileLines) {
      findings.push(
        finding({
          check: 'file-lines',
          severity: 'high',
          file: relative(rootDir, filePath),
          line: 1,
          message: `File has ${lines.length} lines, exceeds limit ${config.maxFileLines}`,
          recommendation: 'Split this file into smaller modules by concern.'
        })
      );
    }
  }

  return { name: 'file-lines', findings, summary: summarizeFindings(findings) };
}

export async function checkCodeSmells(rootDir) {
  const files = await collectFiles(rootDir, DEFAULT_CONFIG);
  const findings = [];
  const smellPatterns = [
    { regex: /\bconsole\.log\(/g, severity: 'low', message: 'Debug logging detected.', recommendation: 'Use structured logger or remove before release.' },
    { regex: /\bTODO\b|\bFIXME\b/g, severity: 'low', message: 'TODO/FIXME marker found.', recommendation: 'Track unfinished work with issue references.' }
  ];

  for (const filePath of files) {
    const rel = relative(rootDir, filePath);
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|php)$/i.test(rel)) continue;
    const text = await readText(filePath);
    const lines = toLines(text);

    for (const pattern of smellPatterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const prefix = text.slice(0, match.index);
        const line = prefix.split(/\r?\n/).length;
        findings.push(
          finding({
            check: 'code-smells',
            severity: pattern.severity,
            file: rel,
            line,
            message: pattern.message,
            recommendation: pattern.recommendation
          })
        );
      }
      pattern.regex.lastIndex = 0;
    }

    if (lines.some((l) => l.includes('magic number'))) {
      findings.push(
        finding({
          check: 'code-smells',
          severity: 'low',
          file: rel,
          line: 1,
          message: 'Potential hardcoded magic-number hint found.',
          recommendation: 'Prefer constants for repeated or domain-significant numbers.'
        })
      );
    }
  }

  return { name: 'code-smells', findings, summary: summarizeFindings(findings) };
}

export async function checkSecurity(rootDir) {
  const files = await collectFiles(rootDir, DEFAULT_CONFIG);
  const findings = [];
  const patterns = [
    { regex: /\beval\s*\(/g, severity: 'high', message: 'eval() usage detected.', recommendation: 'Avoid eval and use safe parsing/evaluation alternatives.' },
    { regex: /new\s+Function\s*\(/g, severity: 'high', message: 'Function constructor usage detected.', recommendation: 'Avoid dynamic code generation.' },
    { regex: /innerHTML\s*=\s*/g, severity: 'high', message: 'Direct innerHTML assignment detected.', recommendation: 'Use textContent or sanitized HTML rendering.' },
    { regex: /(api[_-]?key|secret|password|token)\b\s*[:=]\s*['"](?!\/)(?=[^'"]{8,}['"])[^'"]+['"]/ig, severity: 'high', message: 'Possible hardcoded secret detected.', recommendation: 'Remove hardcoded secret and use secure runtime configuration.' },
    { regex: /child_process\.(exec|spawn)\(/g, severity: 'medium', message: 'Process execution API usage detected.', recommendation: 'Validate/sanitize inputs passed to subprocesses.' }
  ];

  for (const filePath of files) {
    const rel = relative(rootDir, filePath);
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|html|py|php|go)$/i.test(rel)) continue;
    const text = await readText(filePath);

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        findings.push(
          finding({
            check: 'security',
            severity: pattern.severity,
            file: rel,
            line,
            message: pattern.message,
            recommendation: pattern.recommendation
          })
        );
      }
      pattern.regex.lastIndex = 0;
    }
  }

  return { name: 'security', findings, summary: summarizeFindings(findings) };
}

export async function checkComplexity(rootDir, config = DEFAULT_CONFIG) {
  const files = await collectFiles(rootDir, config);
  const findings = [];
  const functionRegex = /(function\s+\w+\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>\s*\{|\w+\s*\([^)]*\)\s*\{)/g;
  const complexityTokens = /\b(if|for|while|case|catch|\?\s*[^:]+:|&&|\|\|)\b/g;

  for (const filePath of files) {
    const rel = relative(rootDir, filePath);
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|php)$/i.test(rel)) continue;
    const text = await readText(filePath);
    let match;
    while ((match = functionRegex.exec(text)) !== null) {
      const start = match.index;
      const body = text.slice(start, start + 3000);
      const tokens = body.match(complexityTokens) ?? [];
      const score = 1 + tokens.length;
      if (score > config.complexityThreshold) {
        const line = text.slice(0, start).split(/\r?\n/).length;
        findings.push(
          finding({
            check: 'complexity',
            severity: score > config.complexityThreshold + 5 ? 'high' : 'medium',
            file: rel,
            line,
            message: `Estimated cyclomatic complexity ${score} exceeds threshold ${config.complexityThreshold}.`,
            recommendation: 'Split into smaller functions and simplify branches.'
          })
        );
      }
    }
    functionRegex.lastIndex = 0;
  }

  return { name: 'complexity', findings, summary: summarizeFindings(findings) };
}

export async function checkPerformanceMemory(rootDir) {
  const files = await collectFiles(rootDir, DEFAULT_CONFIG);
  const findings = [];
  const patterns = [
    { regex: /while\s*\(\s*true\s*\)/g, severity: 'high', message: 'Infinite loop pattern detected.', recommendation: 'Ensure loop has explicit and tested exit conditions.' },
    { regex: /setInterval\s*\(/g, severity: 'medium', message: 'setInterval usage detected.', recommendation: 'Ensure intervals are cleared to prevent leaks.' },
    { regex: /new\s+Array\s*\(\s*\d{7,}\s*\)/g, severity: 'high', message: 'Large array allocation pattern detected.', recommendation: 'Use streaming/chunking to reduce memory pressure.' },
    { regex: /JSON\.parse\s*\(\s*await\s+.*readFile/gi, severity: 'medium', message: 'Potential large JSON parse from file.', recommendation: 'Consider streaming parsers for large payloads.' }
  ];

  for (const filePath of files) {
    const rel = relative(rootDir, filePath);
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|php)$/i.test(rel)) continue;
    const text = await readText(filePath);

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        findings.push(
          finding({
            check: 'performance-memory',
            severity: pattern.severity,
            file: rel,
            line,
            message: pattern.message,
            recommendation: pattern.recommendation
          })
        );
      }
      pattern.regex.lastIndex = 0;
    }
  }

  return { name: 'performance-memory', findings, summary: summarizeFindings(findings) };
}

export async function checkGoFuncs(rootDir, config = DEFAULT_CONFIG) {
  const files = await collectFiles(rootDir, config);
  const goFiles = files.filter((f) => f.endsWith('.go'));
  const findings = [];

  for (const filePath of goFiles) {
    const rel = relative(rootDir, filePath);
    if (rel.endsWith('_test.go')) {
      continue;
    }
    const text = await readText(filePath);
    const lines = toLines(text);
    for (let i = 0; i < lines.length; i += 1) {
      if (/^func\s+[A-Z]\w*/.test(lines[i])) {
        const previous = i > 0 ? lines[i - 1].trim() : '';
        if (!previous.startsWith('//')) {
          findings.push(
            finding({
              check: 'go-funcs',
              severity: 'low',
              file: rel,
              line: getLineNumber(lines, i),
              message: 'Exported Go function without doc comment.',
              recommendation: 'Add Go-style doc comments for exported symbols.'
            })
          );
        }
      }
    }
  }

  const moduleDirs = await findGoModuleDirs(rootDir, config);
  for (const moduleDir of moduleDirs) {
    const vet = await runCommand('go', ['vet', './...'], moduleDir);
    if (vet.code !== 0) {
      findings.push(
        finding({
          check: 'go-funcs',
          severity: 'high',
          file: relative(rootDir, path.join(moduleDir, 'go.mod')),
          line: 1,
          message: 'go vet reported issues or Go toolchain unavailable.',
          recommendation: 'Run go vet locally and resolve warnings.'
        })
      );
    }
  }

  return { name: 'go-funcs', findings, summary: summarizeFindings(findings), skipped: goFiles.length === 0 };
}

export async function checkPdoPepTemplating(rootDir, config = DEFAULT_CONFIG) {
  const files = await collectFiles(rootDir, config);
  const findings = [];

  for (const filePath of files) {
    const rel = relative(rootDir, filePath);
    const text = await readText(filePath);
    const lines = toLines(text);

    if (rel.endsWith('.py')) {
      lines.forEach((line, idx) => {
        if (line.length > config.maxPythonLineLength) {
          findings.push(
            finding({
              check: 'pdo-pep-templating',
              severity: 'low',
              file: rel,
              line: idx + 1,
              message: `Python line length ${line.length} exceeds ${config.maxPythonLineLength}.`,
              recommendation: 'Wrap long Python lines to improve PEP readability.'
            })
          );
        }
        if (/\t/.test(line)) {
          findings.push(
            finding({
              check: 'pdo-pep-templating',
              severity: 'low',
              file: rel,
              line: idx + 1,
              message: 'Python tab indentation detected.',
              recommendation: 'Use 4 spaces for Python indentation.'
            })
          );
        }
      });
    }

    if (rel.endsWith('.php')) {
      const phpBadQuery = /->query\s*\(\s*["'`].*\$\w+/g;
      let m;
      while ((m = phpBadQuery.exec(text)) !== null) {
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        findings.push(
          finding({
            check: 'pdo-pep-templating',
            severity: 'high',
            file: rel,
            line,
            message: 'Potential dynamic SQL in PDO query detected.',
            recommendation: 'Use prepared statements with bound parameters.'
          })
        );
      }
    }

    if (/\.(html|tsx|jsx|ts|js)$/.test(rel)) {
      const rawTemplatePatterns = [/\{\{\{[^}]+\}\}\}/g, /dangerouslySetInnerHTML/g];
      for (const pattern of rawTemplatePatterns) {
        let m;
        while ((m = pattern.exec(text)) !== null) {
          const line = text.slice(0, m.index).split(/\r?\n/).length;
          findings.push(
            finding({
              check: 'pdo-pep-templating',
              severity: 'medium',
              file: rel,
              line,
              message: 'Unsafe/raw templating sink detected.',
              recommendation: 'Ensure strict sanitization and avoid raw HTML sinks when possible.'
            })
          );
        }
      }
    }
  }

  return { name: 'pdo-pep-templating', findings, summary: summarizeFindings(findings) };
}

export async function checkDependencyAudit(rootDir) {
  const findings = [];
  const packageJsonPath = path.join(rootDir, 'package.json');
  const hasPackage = await fileExists(packageJsonPath);
  if (!hasPackage) {
    return { name: 'dependency-audit', findings, summary: summarizeFindings(findings), skipped: true };
  }

  const audit = await runCommand('npm', ['audit', '--omit=dev', '--json'], rootDir);
  if (audit.code !== 0 && audit.stdout) {
    try {
      const parsed = JSON.parse(audit.stdout);
      const vulnerabilities = parsed?.metadata?.vulnerabilities;
      if (vulnerabilities) {
        for (const severity of ['high', 'moderate', 'low']) {
          const count = vulnerabilities[severity] ?? 0;
          if (count > 0) {
            findings.push(
              finding({
                check: 'dependency-audit',
                severity: severity === 'high' ? 'high' : 'medium',
                file: 'package.json',
                line: 1,
                message: `npm audit found ${count} ${severity} vulnerability entries.`,
                recommendation: 'Run npm audit fix and evaluate upgrade impact.'
              })
            );
          }
        }
      }
    } catch {
      findings.push(
        finding({
          check: 'dependency-audit',
          severity: 'medium',
          file: 'package.json',
          line: 1,
          message: 'npm audit returned non-JSON output.',
          recommendation: 'Run npm audit manually and review results.'
        })
      );
    }
  }

  return { name: 'dependency-audit', findings, summary: summarizeFindings(findings) };
}

export async function checkESLint(rootDir) {
  const findings = [];
  const packageJsonPath = path.join(rootDir, 'package.json');
  const eslintConfigPath = path.join(rootDir, 'eslint.config.mjs');
  if (!(await fileExists(packageJsonPath))) {
    return { name: 'eslint', findings, summary: summarizeFindings(findings), skipped: true };
  }
  if (!(await fileExists(eslintConfigPath))) {
    findings.push(
      finding({
        check: 'eslint',
        severity: 'medium',
        file: 'package.json',
        line: 1,
        message: 'ESLint config file eslint.config.mjs is missing.',
        recommendation: 'Add the flat ESLint config file before running review.'
      })
    );
    return { name: 'eslint', findings, summary: summarizeFindings(findings) };
  }

  const eslint = await runCommand('npx', ['eslint', '.', '--config', 'eslint.config.mjs', '--format', 'json'], rootDir);
  const output = eslint.stdout.trim();
  if (!output) {
    if (eslint.code === 0) {
      return { name: 'eslint', findings, summary: summarizeFindings(findings) };
    }
    findings.push(
      finding({
        check: 'eslint',
        severity: 'medium',
        file: 'package.json',
        line: 1,
        message: 'ESLint failed to run or returned no parseable output.',
        recommendation: 'Run npx eslint . locally and fix configuration or runtime errors.'
      })
    );
    return { name: 'eslint', findings, summary: summarizeFindings(findings) };
  }

  try {
    const parsed = JSON.parse(output);
    for (const result of parsed) {
      const rel = normalizePath(path.relative(rootDir, result.filePath));
      for (const message of result.messages ?? []) {
        findings.push(
          finding({
            check: 'eslint',
            severity: message.fatal ? 'high' : (message.severity === 2 ? 'medium' : 'low'),
            file: rel,
            line: message.line || 1,
            message: message.message,
            recommendation: message.ruleId ? `Resolve ESLint rule ${message.ruleId}.` : 'Resolve the ESLint-reported issue.'
          })
        );
      }
    }
  } catch {
    findings.push(
      finding({
        check: 'eslint',
        severity: 'medium',
        file: 'package.json',
        line: 1,
        message: 'ESLint output could not be parsed as JSON.',
        recommendation: 'Verify the ESLint installation and formatter output.'
      })
    );
  }

  return { name: 'eslint', findings, summary: summarizeFindings(findings) };
}

export async function checkRuff(rootDir) {
  const findings = [];
  const ruffCommand = await getRuffCommand(rootDir);
  if (!ruffCommand) {
    return { name: 'ruff', findings, summary: summarizeFindings(findings), skipped: true };
  }

  const ruff = await runCommand(ruffCommand.command, [...ruffCommand.argsPrefix, 'check', '.', '--output-format', 'json'], rootDir);
  const output = ruff.stdout.trim();
  if (!output) {
    if (ruff.code === 0) {
      return { name: 'ruff', findings, summary: summarizeFindings(findings) };
    }
    findings.push(
      finding({
        check: 'ruff',
        severity: 'medium',
        file: 'ruff.toml',
        line: 1,
        message: 'Ruff failed to run or returned no parseable output.',
        recommendation: 'Run Ruff locally and verify the Python environment includes the tool.'
      })
    );
    return { name: 'ruff', findings, summary: summarizeFindings(findings) };
  }

  try {
    const parsed = JSON.parse(output);
    for (const item of parsed) {
      const rel = normalizePath(path.relative(rootDir, item.filename));
      findings.push(
        finding({
          check: 'ruff',
          severity: item.code?.startsWith('F') ? 'medium' : 'low',
          file: rel,
          line: item.location?.row ?? 1,
          message: `${item.code}: ${item.message}`,
          recommendation: item.fix ? 'Apply Ruff fix or update the code to satisfy the rule.' : 'Resolve the Ruff-reported issue.'
        })
      );
    }
  } catch {
    findings.push(
      finding({
        check: 'ruff',
        severity: 'medium',
        file: 'ruff.toml',
        line: 1,
        message: 'Ruff output could not be parsed as JSON.',
        recommendation: 'Verify Ruff installation and formatter output.'
      })
    );
  }

  return { name: 'ruff', findings, summary: summarizeFindings(findings) };
}

export async function checkGoLint(rootDir, config = DEFAULT_CONFIG) {
  const findings = [];
  const moduleDirs = await findGoModuleDirs(rootDir, config);
  if (moduleDirs.length === 0) {
    return { name: 'go-lint', findings, summary: summarizeFindings(findings), skipped: true };
  }

  const golangci = await getGoBinCommand('golangci-lint', rootDir);
  const gofmtExists = await commandExists('gofmt', rootDir);

  for (const moduleDir of moduleDirs) {
    const goModFile = relative(rootDir, path.join(moduleDir, 'go.mod'));
    if (gofmtExists) {
      const gofmt = await runCommand('gofmt', ['-l', '.'], moduleDir);
      const unformatted = gofmt.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const file of unformatted) {
        findings.push(
          finding({
            check: 'go-lint',
            severity: 'medium',
            file: relative(rootDir, path.join(moduleDir, file)),
            line: 1,
            message: 'Go file is not formatted with gofmt.',
            recommendation: 'Run gofmt -w on this file.'
          })
        );
      }
    }

    if (golangci) {
      const golint = await runCommand(golangci.command, [...golangci.argsPrefix, 'run', './...'], moduleDir);
      if (golint.code !== 0) {
        const output = `${golint.stdout}\n${golint.stderr}`.trim();
        const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
        for (const line of lines) {
          const match = /^(.*?):(\d+)(?::\d+)?\s+(.*)$/.exec(line);
          if (match) {
            findings.push(
              finding({
                check: 'go-lint',
                severity: 'medium',
                file: relative(rootDir, path.join(moduleDir, match[1])),
                line: Number.parseInt(match[2], 10),
                message: match[3],
                recommendation: 'Resolve the golangci-lint finding.'
              })
            );
          } else {
            findings.push(
              finding({
                check: 'go-lint',
                severity: 'medium',
                file: goModFile,
                line: 1,
                message: line,
                recommendation: 'Resolve the golangci-lint finding.'
              })
            );
          }
        }
      }
    }
  }

  return {
    name: 'go-lint',
    findings,
    summary: summarizeFindings(findings),
    skipped: moduleDirs.length === 0 || (!gofmtExists && !golangci)
  };
}

export async function checkServerReadiness(rootDir) {
  const findings = [];
  const filesToCheck = [
    path.join(rootDir, 'README.md'),
    path.join(rootDir, 'mcp', 'README.md'),
    path.join(rootDir, 'src', 'agent', 'shared', 'writing-prompt.json'),
  ];

  let corpus = '';
  for (const filePath of filesToCheck) {
    if (await fileExists(filePath)) {
      corpus += `\n${(await readText(filePath)).toLowerCase()}`;
    }
  }

  const checks = [
    {
      concept: 'Go concurrency with C/C++ acceleration across multi-core processors',
      patterns: [/goroutine|go concurrency|worker pool/, /c\+\+|c\/c\+\+|cgo/, /multi-core|multicore/],
      recommendation:
        'Document or implement Go concurrency primitives, optional C/C++ hot-path integration, and explicit multi-core execution strategy.',
    },
    {
      concept: 'Advanced memory management with custom allocators and optimized garbage collection',
      patterns: [/memory management|allocation/, /custom allocator|allocator/, /garbage collection|\bgc\b/, /latency/],
      recommendation:
        'Document allocator strategy, object reuse, and GC pressure controls with measurable latency targets.',
    },
    {
      concept: 'Asynchronous I/O for responsiveness under high I/O demand',
      patterns: [/asynchronous i\/o|non-blocking i\/o|async i\/o/, /blocking|responsiveness|throughput|high i\/o/],
      recommendation:
        'Document non-blocking I/O, timeout policies, backpressure handling, and connection pooling behavior.',
    },
    {
      concept: 'Sophisticated load balancing and horizontal scalability',
      patterns: [/load balancing|load balancer/, /bottleneck|hotspot/, /horizontal scal/],
      recommendation:
        'Document request distribution strategy, health checks, and stateless service scaling model.',
    },
    {
      concept: 'Intelligent caching for reduced redundant access and faster retrieval',
      patterns: [/cache|caching/, /redundant|repeated/, /retrieval|cache hit rate|latency/],
      recommendation:
        'Document cache key design, TTL and invalidation policy, and metrics for cache effectiveness.',
    },
    {
      concept: 'Comprehensive profiling and modular scaling boundaries',
      patterns: [/profiling|pprof|trace/, /modular|module|component/, /isolated scaling|independent scaling|optimization/],
      recommendation:
        'Document profiling workflow and module boundaries that permit isolated optimization and scaling.',
    },
  ];

  for (const item of checks) {
    const missing = item.patterns.some((pattern) => !pattern.test(corpus));
    if (missing) {
      findings.push(
        finding({
          check: 'server-readiness',
          severity: 'high',
          file: 'README.md',
          line: 1,
          message: `Missing or incomplete server-readiness concept coverage: ${item.concept}.`,
          recommendation: item.recommendation,
        })
      );
    }
  }

  return { name: 'server-readiness', findings, summary: summarizeFindings(findings) };
}

export async function runSmokeTests(rootDir) {
  const checks = [];
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (await fileExists(packageJsonPath)) {
    const build = await runCommand('npm', ['run', 'build'], rootDir);
    checks.push({
      name: 'npm-run-build',
      success: build.code === 0,
      output: build.code === 0 ? 'build passed' : (build.stderr || build.stdout).slice(0, 1200)
    });
  }

  return checks;
}

export function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

export function mergeFindings(results) {
  const merged = [];
  for (const result of results) {
    merged.push(...result.findings);
  }
  return sortFindings(merged);
}

// ---------------------------------------------------------------------------
// WCAG 2.1 color contrast check
// Analyzes CSS files for:
//   - Hardcoded hex color values that should be CSS custom properties
//   - Foreground / background pairings that fail AA or AAA contrast ratios
// ---------------------------------------------------------------------------

function channelToLinear(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToLuminance(hex) {
  const cleaned = hex.replace('#', '');
  let r, g, b;
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return null;
  }
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function buildVarMap(css) {
  const map = new Map();
  const varDef = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*[;}\n]/g;
  let m;
  while ((m = varDef.exec(css)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

function resolveColor(value, varMap) {
  const trimmed = value.trim();
  const varRef = /^var\(\s*(--[\w-]+)\s*\)$/.exec(trimmed);
  if (varRef) {
    return varMap.get(varRef[1]) ?? null;
  }
  if (/^#[0-9a-fA-F]{3,6}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

// Character-scan block extractor. Handles one level of @-rule nesting so
// that inner selectors inside @media are still checked.
function extractRuleBlocks(css) {
  const blocks = [];
  let depth = 0;
  let blockStart = -1;
  let selectorStart = 0;
  let currentSelector = '';
  let insideAtWrapper = false;

  const lineBreaks = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '\n') lineBreaks.push(i);
  }

  function lineOf(charIdx) {
    let lo = 0;
    let hi = lineBreaks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineBreaks[mid] < charIdx) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const selectorText = css.slice(selectorStart, i).trim();
      if (depth === 0) {
        if (selectorText.startsWith('@')) {
          insideAtWrapper = true;
        } else {
          currentSelector = selectorText;
          blockStart = i + 1;
          blocks.push({ selector: currentSelector, declarations: null, startLine: lineOf(i) });
        }
      } else if (depth === 1 && insideAtWrapper) {
        currentSelector = selectorText;
        blockStart = i + 1;
        blocks.push({ selector: currentSelector, declarations: null, startLine: lineOf(i) });
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth >= 0 && blocks.length > 0 && blocks[blocks.length - 1].declarations === null) {
        blocks[blocks.length - 1].declarations = css.slice(blockStart, i);
      }
      if (depth === 0 && insideAtWrapper) {
        insideAtWrapper = false;
      }
      selectorStart = i + 1;
    }
  }

  return blocks.filter((b) => b.declarations !== null);
}

function parseDeclarations(declarations) {
  const props = {};
  const declRe = /([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = declRe.exec(declarations)) !== null) {
    props[m[1].trim()] = m[2].trim();
  }
  return props;
}

export async function checkWcagColors(rootDir) {
  const files = await collectFiles(rootDir, DEFAULT_CONFIG);
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const findings = [];

  for (const filePath of cssFiles) {
    const rel = relative(rootDir, filePath);
    const rawText = await readText(filePath);
    const css = stripCssComments(rawText);
    const varMap = buildVarMap(css);
    const blocks = extractRuleBlocks(css);

    // Detect hardcoded hex colors in rule declarations that are not var() references.
    const hardcodedRe = /^[ \t]*([\w-]+)\s*:\s*([^;{}\n]*)#([0-9a-fA-F]{3,6})([^;{}\n]*);/gm;
    let hm;
    while ((hm = hardcodedRe.exec(css)) !== null) {
      const prop = hm[1].trim();
      const before = hm[2];
      const hexVal = '#' + hm[3];
      // Skip custom property definitions (--name: #hex) — those are intentional declarations.
      if (prop.startsWith('--')) continue;
      // Only flag color-related property names.
      if (!/\bcolor\b|background|border-color|outline|fill\b|stroke\b/.test(prop)) continue;
      // Skip if the value uses var() alongside the hex.
      if (before.includes('var(')) continue;
      const lineNum = rawText.slice(0, hm.index).split(/\r?\n/).length;
      findings.push(
        finding({
          check: 'wcag-colors',
          severity: 'low',
          file: rel,
          line: lineNum,
          message: `Hardcoded color '${hexVal}' in property '${prop}'. Replace with a CSS custom property.`,
          recommendation: 'Define this value as a --color-* variable in :root and reference it via var().',
        })
      );
    }

    // Check foreground / background contrast pairs within the same rule block.
    for (const block of blocks) {
      if (!block.declarations) continue;
      const props = parseDeclarations(block.declarations);
      const fgRaw = props['color'];
      const bgRaw = props['background-color'] ?? props['background'];
      if (!fgRaw || !bgRaw) continue;

      // Skip gradient or image backgrounds — cannot compute a single contrast value.
      if (/gradient|url\s*\(/.test(bgRaw)) continue;

      const fgHex = resolveColor(fgRaw, varMap);
      const bgHex = resolveColor(bgRaw, varMap);
      if (!fgHex || !bgHex) continue;

      const fgL = hexToLuminance(fgHex);
      const bgL = hexToLuminance(bgHex);
      if (fgL === null || bgL === null) continue;

      const ratio = contrastRatio(fgL, bgL);
      const ratioStr = ratio.toFixed(2);
      const selector = block.selector.replace(/\s+/g, ' ');

      if (ratio < 3.0) {
        findings.push(
          finding({
            check: 'wcag-colors',
            severity: 'high',
            file: rel,
            line: block.startLine,
            message: `Contrast fail: '${selector}' ratio ${ratioStr}:1 (${fgHex} on ${bgHex}). Fails all WCAG levels.`,
            recommendation: 'Minimum ratio is 3:1 for large text and 4.5:1 for normal text under WCAG 2.1 AA.',
          })
        );
      } else if (ratio < 4.5) {
        findings.push(
          finding({
            check: 'wcag-colors',
            severity: 'medium',
            file: rel,
            line: block.startLine,
            message: `WCAG AA fail: '${selector}' ratio ${ratioStr}:1 (${fgHex} on ${bgHex}). Normal text requires 4.5:1.`,
            recommendation: 'Increase foreground/background contrast to at least 4.5:1 for WCAG AA compliance.',
          })
        );
      } else if (ratio < 7.0) {
        findings.push(
          finding({
            check: 'wcag-colors',
            severity: 'low',
            file: rel,
            line: block.startLine,
            message: `WCAG AAA advisory: '${selector}' ratio ${ratioStr}:1 (${fgHex} on ${bgHex}). AAA requires 7:1.`,
            recommendation: 'Raise contrast to 7:1 for full AAA compliance in high-accessibility contexts.',
          })
        );
      }
    }
  }

  return { name: 'wcag-colors', findings, summary: summarizeFindings(findings) };
}

export const reviewChecks = {
  'file-lines': checkFileLines,
  'code-smells': checkCodeSmells,
  eslint: checkESLint,
  ruff: checkRuff,
  security: checkSecurity,
  complexity: checkComplexity,
  'performance-memory': checkPerformanceMemory,
  'go-funcs': checkGoFuncs,
  'go-lint': checkGoLint,
  'pdo-pep-templating': checkPdoPepTemplating,
  'dependency-audit': checkDependencyAudit,
  'server-readiness': checkServerReadiness,
  'wcag-colors': checkWcagColors,
};

export async function runReview(checkNames, rootDir, config = DEFAULT_CONFIG) {
  const effectiveConfig = mergeConfig(DEFAULT_CONFIG, config);
  const results = [];
  for (const checkName of checkNames) {
    const fn = reviewChecks[checkName];
    if (!fn) continue;
    const result = await fn(rootDir, effectiveConfig);
    const filteredFindings = applyIgnoreRules(effectiveConfig, checkName, result.findings);
    results.push({
      ...result,
      findings: filteredFindings,
      summary: summarizeFindings(filteredFindings),
    });
  }

  const findings = mergeFindings(results);
  const summary = summarizeFindings(findings);
  return { results, findings, summary };
}
