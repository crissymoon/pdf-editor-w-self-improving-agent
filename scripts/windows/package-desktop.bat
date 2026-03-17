@echo off
REM XCM-PDF Desktop Packager (Windows)

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%"

echo ==========================================
echo XCM-PDF Desktop Packager (Windows)
echo ==========================================
echo.

if not exist "node_modules" (
    echo [INFO] Dependencies not found. Running install.bat...
    call scripts\windows\install.bat
)

echo [INFO] Building Windows installer...
call npm run pack:win
popd
