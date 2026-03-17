#!/usr/bin/env bash
# Build the app and preview the production bundle in the browser.
# Usage: bash run_dev/preview-browser.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "--- XCM-PDF: preview production build ---"
cd "$ROOT"

if ! command -v npm &>/dev/null; then
  echo "[error] npm not found. Install Node.js first."
  exit 1
fi

echo "[info] Building..."
npm run build

echo "[info] Serving production bundle at http://localhost:4173"
npm run preview
