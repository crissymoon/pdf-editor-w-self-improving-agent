@echo off
:: Build the app and preview the production bundle in the browser.
:: Usage: run_dev\preview-browser.bat
setlocal

set "ROOT=%~dp0.."

echo --- XCM-PDF: preview production build ---
cd /d "%ROOT%"

where npm >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] npm not found. Install Node.js first.
  exit /b 1
)

echo [info] Building...
call npm run build
if %errorlevel% neq 0 exit /b %errorlevel%

echo [info] Serving production bundle at http://localhost:4173
npm run preview
