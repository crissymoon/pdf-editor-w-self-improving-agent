#!/bin/bash

# XCM-PDF Desktop Runner (macOS/Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_OS_DIR="$(basename "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================="
echo "XCM-PDF Editor Desktop Runner (macOS/Linux)"
echo "=========================================="
echo ""

if [ ! -d "node_modules" ]; then
  echo "[INFO] Dependencies not found. Running install.sh..."
  "./scripts/${SCRIPT_OS_DIR}/install.sh"
fi

if [ ! -f "dist/index.html" ]; then
  echo "[INFO] Desktop build not found. Running npm run build..."
  npm run build
fi

echo "[INFO] Launching desktop app..."
npm run electron
