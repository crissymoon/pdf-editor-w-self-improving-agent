# XCM CLI

A modular JSON-driven CLI for this repository.

## Why

- Commands and help text are generated from `xcm_cli/config/commands.json`
- Additions are simple: add one command object in JSON
- Execution is modular and reusable

## Usage

```bash
node xcm_cli/xcm.mjs help
node xcm_cli/xcm.mjs build
node xcm_cli/xcm.mjs dev:browser
node xcm_cli/xcm.mjs dev:electron
node xcm_cli/xcm.mjs run:browser
node xcm_cli/xcm.mjs run browser
node xcm_cli/xcm.mjs run:electron
node xcm_cli/xcm.mjs run electron
node xcm_cli/xcm.mjs code-review
node xcm_cli/xcm.mjs code review
node xcm_cli/xcm.mjs code review server
node xcm_cli/xcm.mjs push
```

## Groups

Group names show subcommand help:

```bash
node xcm_cli/xcm.mjs run
node xcm_cli/xcm.mjs dev
node xcm_cli/xcm.mjs review
node xcm_cli/xcm.mjs pack
```

Group subcommand forms:

```bash
node xcm_cli/xcm.mjs run browser
node xcm_cli/xcm.mjs run electron
node xcm_cli/xcm.mjs dev browser
node xcm_cli/xcm.mjs dev electron
node xcm_cli/xcm.mjs review all
node xcm_cli/xcm.mjs review server
node xcm_cli/xcm.mjs review wcag
node xcm_cli/xcm.mjs review security
node xcm_cli/xcm.mjs review performance
node xcm_cli/xcm.mjs review complexity
node xcm_cli/xcm.mjs review smells
node xcm_cli/xcm.mjs pack all
node xcm_cli/xcm.mjs pack win
node xcm_cli/xcm.mjs pack mac
node xcm_cli/xcm.mjs pack linux
```

## Extend

Add a flat command in `xcm_cli/config/commands.json`:

```json
{
  "name": "example",
  "summary": "Run example",
  "action": "npm",
  "script": "dev"
}
```

Add a group in `xcm_cli/config/commands.json`:

```json
{
  "name": "mygroup",
  "summary": "Group description",
  "subcommands": [
    {
      "name": "task",
      "summary": "Run a task",
      "action": "npm",
      "script": "some:script"
    }
  ]
}
```

Available actions:
- `help`
- `version`
- `npm`
- `sequence`
- `git-push-current`
