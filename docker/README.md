# Docker Containerization Testing for Electron Builds

This folder provides containerized testing for Electron packaging workflows.

## Scope

- Linux packaging test in container.
- Windows packaging test in container.
- macOS packaging readiness checks in container.

Note: Full macOS `.dmg` packaging is not supported in Linux Docker containers. Use a macOS host or macOS CI runner for final macOS artifact builds.

## Files

- `docker-compose.electron.yml`: Multi-service test entrypoint.
- `Dockerfile.linux`: Linux packaging test image.
- `scripts/smoke-linux.sh`: Verifies Linux AppImage artifact output.
- `scripts/smoke-windows.sh`: Verifies Windows installer artifact output.
- `scripts/verify-macos-config.js`: Verifies macOS pack config in package.json.
- `scripts/smoke-macos-check.sh`: Verifies Electron entrypoints and macOS readiness.

## Run Commands

Run from repository root.

### Linux packaging smoke test

```bash
docker compose -f docker/docker-compose.electron.yml --profile linux run --rm electron-linux
```

### Windows packaging smoke test

```bash
docker compose -f docker/docker-compose.electron.yml --profile windows run --rm electron-windows
```

### macOS readiness smoke test

```bash
docker compose -f docker/docker-compose.electron.yml --profile macos run --rm electron-macos-check
```

### Run all tests

```bash
docker compose -f docker/docker-compose.electron.yml --profile all run --rm electron-linux
docker compose -f docker/docker-compose.electron.yml --profile all run --rm electron-windows
docker compose -f docker/docker-compose.electron.yml --profile all run --rm electron-macos-check
```

## Smoke Testing Guarantees

- Linux test fails if no `.AppImage` appears in `release/`.
- Windows test fails if no `.exe` appears in `release/`.
- macOS readiness test fails if packaging config or Electron entry files are missing.

## Continuous Integration

GitHub Actions workflow added at:

- `.github/workflows/electron-container-tests.yml`

Workflow coverage:

- Ubuntu runner executes Docker-based Linux packaging smoke test.
- Ubuntu runner executes Docker-based Windows packaging smoke test using the Wine builder container.
- macOS runner executes direct macOS packaging smoke test.
