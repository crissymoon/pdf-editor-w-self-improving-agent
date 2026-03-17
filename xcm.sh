#!/usr/bin/env bash
# xcm - interactive CLI launcher
# Double-click or run from any directory.
# Opens a menu showing all available commands, then prompts for input.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node &>/dev/null; then
  echo "[error] Node.js is not installed. Visit https://nodejs.org"
  read -rp "Press Enter to exit..."
  exit 1
fi

# Print the full help once on open.
node xcm_cli/xcm.mjs help

echo ""
echo "-----------------------------------------------------------"
echo " Quick options:"
echo "   help                  Show this menu"
echo "   version               Print version"
echo "   run browser           Preview production build in browser"
echo "   run electron          Launch Electron desktop app"
echo "   dev browser           Start Vite dev server"
echo "   dev electron          Start Vite + Electron (hot-reload)"
echo "   review all            Run full code review pipeline"
echo "   safety scan           Run security checks"
echo "   pack win|mac|linux    Package for a platform"
echo "   mobile run            Run Flutter app on device"
echo "   push:shared           Push all repos"
echo "   sync:auto             Auto-commit + push all repos"
echo "-----------------------------------------------------------"
echo ""

while true; do
  read -rp "xcm> " input
  [[ -z "$input" ]] && continue
  if [[ "$input" == "exit" || "$input" == "quit" || "$input" == "q" ]]; then
    echo "Bye."
    exit 0
  fi
  # shellcheck disable=SC2086
  node xcm_cli/xcm.mjs $input || true
  echo ""
done
