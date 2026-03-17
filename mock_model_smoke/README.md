# Mock Model Smoke Tool

`mock_model_smoke` is a reusable local developer tool for validating prompt-to-edit workflows before using a real AI API.

It provides:
- Deterministic mock NLP parsing for file-edit prompts.
- JSON action parsing for tool-call style prompts.
- Worker-thread request handling for multitask simulation.
- Token-bucket rate limiting for throughput and backpressure testing.
- Surgical file edits with diff output.
- Smoke tests that verify dry-run and applied-edit behavior.

## Why Use This

Use this tool when you want to:
- Validate run commands and dev tooling without opening the UI.
- Stress request handling under concurrency and rate limits.
- Check whether prompt parsing and edit execution logic are reliable.
- Reuse the same harness in future projects by adding parser plugins.

## Commands

From the project root:

```bash
npm run mock:smoke
npm run mock:simulate
npm run mock:run -- --prompt "replace text \"Hello PDF World\" with \"Hello A\" in ${TARGET_FILE}" --target-file mock_model_smoke/fixtures/sample.ts
npm run mock:simulate:pdf
npm run mock:simulate:mcp
npm run mock:file-worker:smoke
npm run mock:evaluate
npm run mock:evaluate:stress
npm run mock:evaluate:stress:constrained
npm run mock:evaluate:stress:high
npm run mock:evaluate:ci
```

For strict MCP live validation in the evaluator:

```bash
npm run mock:evaluate -- --strict-mcp
```

To skip stress or MCP live checks explicitly:

```bash
npm run mock:evaluate -- --skip-stress
npm run mock:evaluate -- --skip-live-mcp
npm run mock:evaluate -- --stress-profile constrained
npm run mock:evaluate -- --stress-profile high-throughput
npm run mock:evaluate -- --thresholds mock_model_smoke/config/stress-thresholds.json
```

## Parser Plugin System

Parsers live in `mock_model_smoke/src/parsers`.

Each parser module must export:
- `name` (string)
- `parsePrompt(prompt)` (function)

The loader auto-discovers parser files, so adding or removing a parser only requires adding or deleting a `.mjs` file.

Built-in parsers:
- `generic-ts-edit`: natural-language style edit prompts.
- `json-edit`: JSON object prompts, for example `{"type":"replace_text", ...}`.

`json-edit` supports action types:
- `replace_text`, `insert_line`, `delete_line`, `append_text`
- `create_directory`, `create_file`, `delete_file`, `move_file`, `list_directory`

## Project Scenarios

- `mock_model_smoke/scenarios/pdf-editor-scenario.json`: PDF editor workflow prompt simulation.
- `mock_model_smoke/scenarios/mcp-json-scenario.json`: MCP integration prompt simulation using JSON parser.

Both scenarios run in an isolated temp workspace under `mock_model_smoke/output/eval-workspace` when using `mock:evaluate`.

## Automated Tooling Evaluation

`mock_model_smoke/scripts/test-pdf-mcp-tooling.mjs` runs:
- PDF editor scenario with applied edits.
- MCP JSON scenario with applied edits.
- MCP live smoke (`mcp/scripts/live-smoke-openai.mjs`) unless skipped.

It then writes a combined report with pass/fail state and a `toolingNeeded` section so you can see what tooling gaps remain for reliable PDF + MCP validation.

The evaluator also runs a stress profile by default (unless `--skip-stress` is used) and records:
- latency percentiles (`p50`, `p90`, `p95`, `p99`)
- rate-limit wait percentiles
- histogram bins for latency and wait times

Stress profiles:
- `constrained`: lower burst and rate for backpressure behavior.
- `high-throughput`: higher rate and worker count for capacity testing.

Threshold gate:
- The evaluator compares each stress profile to budgets in `mock_model_smoke/config/stress-thresholds.json`.
- If any budget is exceeded, the threshold gate fails and the command exits with a non-zero code.

CI gate:
- `npm run mock:evaluate:ci` runs smoke + constrained profile + high-throughput profile.
- It is configured to skip live MCP checks for deterministic CI behavior while still enforcing stress thresholds.
- GitHub Actions uploads two artifact bundles after each run:
- `mock-model-smoke-reports` (`mock_model_smoke/output/*.json`, retained 14 days).
- `mock-model-smoke-fixtures` (`mock_model_smoke/output/eval-workspace/*.ts`, retained 7 days).

## Scenario Format

Scenario files are JSON and support `${TARGET_FILE}` templates:

```json
{
  "name": "my-scenario",
  "requests": [
    {
      "id": "r1",
      "prompt": "replace text \"A\" with \"B\" in ${TARGET_FILE}",
      "expectSuccess": true
    }
  ]
}
```

## Output

Reports are saved to `mock_model_smoke/output` and include:
- pass/fail status
- latency metrics (`avg`, `p95`, `max`)
- rate-limit wait totals
- per-request parse/edit results
