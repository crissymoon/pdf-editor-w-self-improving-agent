#!/usr/bin/env bash
# Start the Vite development server and open the app in the default browser.
# Usage: bash run_dev/dev-browser.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "--- XCM-PDF: browser dev ---"
cd "$ROOT"

if ! command -v npm &>/dev/null; then
  echo "[error] npm not found. Install Node.js first."
  exit 1
fi

echo "[info] Starting Vite dev server at http://localhost:5173"
npm run dev
