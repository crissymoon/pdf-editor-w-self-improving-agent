#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="release"

if [ ! -d "$ARTIFACT_DIR" ]; then
  echo "[ERROR] release directory not found"
  exit 1
fi

if ! find "$ARTIFACT_DIR" -maxdepth 1 -type f -name "*.AppImage" | grep -q "."; then
  echo "[ERROR] Linux AppImage artifact not found in release/"
  exit 1
fi

echo "[OK] Linux electron artifact smoke test passed"
