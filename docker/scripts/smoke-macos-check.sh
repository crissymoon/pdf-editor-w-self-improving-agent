#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "package.json" ]; then
  echo "[ERROR] package.json not found"
  exit 1
fi

if [ ! -f "electron/main.cjs" ]; then
  echo "[ERROR] electron main process entrypoint not found"
  exit 1
fi

if [ ! -f "electron/preload.cjs" ]; then
  echo "[ERROR] electron preload entrypoint not found"
  exit 1
fi

echo "[OK] macOS containerized readiness smoke checks passed"
echo "[INFO] Full dmg packaging must run on macOS host or macOS CI runner"
