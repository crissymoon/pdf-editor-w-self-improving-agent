@echo off
:: Start Vite + Electron in development mode (hot-reload).
:: Usage: run_dev\dev-electron.bat
setlocal

set "ROOT=%~dp0.."

echo --- XCM-PDF: Electron dev ---
cd /d "%ROOT%"

where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] npm not found. Install Node.js first.
  exit /b 1
)

echo [info] Starting Vite (port 5173) + Electron
echo [info] Hot-reload is active. Close the Electron window to stop.
npm run dev:electron
