@echo off
:: Start the Vite development server and open the app in the default browser.
:: Usage: run_dev\dev-browser.bat
setlocal

set "ROOT=%~dp0.."

echo --- XCM-PDF: browser dev ---
cd /d "%ROOT%"

where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] npm not found. Install Node.js first.
  exit /b 1
)

echo [info] Starting Vite dev server at http://localhost:5173
npm run dev
