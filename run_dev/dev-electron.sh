#!/usr/bin/env bash
# Start Vite + Electron in development mode (hot-reload).
# Usage: bash run_dev/dev-electron.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "--- XCM-PDF: Electron dev ---"
cd "$ROOT"

if ! command -v npm &>/dev/null; then
  echo "[error] npm not found. Install Node.js first."
  exit 1
fi

echo "[info] Starting Vite (port 5173) + Electron"
echo "[info] Hot-reload is active. Close the Electron window to stop."
npm run dev:electron
