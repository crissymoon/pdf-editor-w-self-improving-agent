#!/bin/bash

# XCM-PDF Desktop Packager (macOS/Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_OS_DIR="$(basename "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================="
echo "XCM-PDF Desktop Packager (macOS/Linux)"
echo "=========================================="
echo ""

if [ ! -d "node_modules" ]; then
  echo "[INFO] Dependencies not found. Running install.sh..."
  "./scripts/${SCRIPT_OS_DIR}/install.sh"
fi

OS_NAME="$(uname -s)"

if [ "$OS_NAME" = "Darwin" ]; then
  echo "[INFO] Building macOS DMG package..."
  npm run pack:mac
elif [ "$OS_NAME" = "Linux" ]; then
  echo "[INFO] Building Linux AppImage package..."
  npm run pack:linux
else
  echo "[ERROR] Unsupported OS for package-desktop.sh: $OS_NAME"
  exit 1
fi
