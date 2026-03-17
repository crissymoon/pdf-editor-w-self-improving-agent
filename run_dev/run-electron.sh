#!/usr/bin/env bash
# Build the app and launch the packaged Electron binary (production).
# Usage: bash run_dev/run-electron.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "--- XCM-PDF: run Electron (production) ---"
cd "$ROOT"

if ! command -v npm &>/dev/null; then
  echo "[error] npm not found. Install Node.js first."
  exit 1
fi

echo "[info] Launching Electron against the current dist/ folder."
echo "[info] Run 'npm run build' first if you have pending source changes."
npm run electron
