@echo off
:: Launch the Electron app against the current dist/ build.
:: Usage: run_dev\run-electron.bat
setlocal

set "ROOT=%~dp0.."

echo --- XCM-PDF: run Electron (production) ---
cd /d "%ROOT%"

where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] npm not found. Install Node.js first.
  exit /b 1
)

echo [info] Launching Electron against the current dist/ folder.
echo [info] Run npm run build first if you have pending source changes.
npm run electron
