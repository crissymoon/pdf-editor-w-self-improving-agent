@echo off
:: xcm - interactive CLI launcher
:: Double-click or run from any directory.
:: Opens a menu showing all available commands, then prompts for input.
setlocal enabledelayedexpansion

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [error] Node.js is not installed. Visit https://nodejs.org
  pause
  exit /b 1
)

:: Print help once on launch.
node xcm_cli\xcm.mjs help

echo.
echo -----------------------------------------------------------
echo  Quick options:
echo    help                  Show this menu
echo    version               Print version
echo    run browser           Preview production build in browser
echo    run electron          Launch Electron desktop app
echo    dev browser           Start Vite dev server
echo    dev electron          Start Vite + Electron (hot-reload)
echo    review all            Run full code review pipeline
echo    safety scan           Run security checks
echo    pack win^|mac^|linux    Package for a platform
echo    mobile run            Run Flutter app on device
echo    push:shared           Push all repos
echo    sync:auto             Auto-commit + push all repos
echo -----------------------------------------------------------
echo.

:loop
set "input="
set /p "input=xcm> "
if not defined input goto loop
if /i "!input!"=="exit" goto done
if /i "!input!"=="quit" goto done
if /i "!input!"=="q" goto done
node xcm_cli\xcm.mjs !input!
echo.
goto loop

:done
echo Bye.
endlocal
