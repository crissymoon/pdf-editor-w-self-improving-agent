# Code Review Toolkit

This folder contains repository quality checks aligned with coding requirements:

- No emojis in code/docs output.
- Prefer modular code and avoid hardcoded values.
- Flag files over 1000 lines.
- Review security, complexity, performance, and memory-risk patterns.
- Include language-specific checks for Go functions and Python/PHP conventions.
- Always run smoke testing as part of the review pipeline.

## Scripts

- `node code_review/scripts/run-all.mjs`: Full review suite + smoke test + JSON report.
- `npm run review:strict`: Strict CI profile (fails on configured thresholds).
- `npm run review:advisory`: Advisory profile (always exits zero, still writes findings).
- `node code_review/scripts/check-code-smells.mjs`: Code smell checks.
- `node code_review/scripts/check-security.mjs`: Security patterns + dependency audit.
- `node code_review/scripts/check-file-lines.mjs`: Files over 1000 lines.
- `node code_review/scripts/check-go-funcs.mjs`: Go exported function docs + `go vet` when available.
- `node code_review/scripts/check-pdo-pep-templating.mjs`: PDO/PEP and templating safety heuristics.
- `node code_review/scripts/check-complexity.mjs`: Complexity estimate checks.
- `node code_review/scripts/check-performance-memory.mjs`: Performance and memory safety heuristics.
- `node code_review/scripts/check-server-readiness.mjs`: Verifies documented multi-user server scalability concepts are present.
- `node code_review/scripts/smoke-test.mjs`: Smoke test entrypoint.

## Output

- Report output file: `code_review/reports/latest-review.json`
- `run-all` reads policy and ignore settings from `code_review/config.json`.
- In strict mode, `run-all` exits non-zero when configured fail-policy thresholds are exceeded or smoke tests fail.
