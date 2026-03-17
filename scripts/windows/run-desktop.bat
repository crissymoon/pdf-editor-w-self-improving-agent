@echo off
REM XCM-PDF Desktop Runner (Windows)

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%"

echo ==========================================
echo XCM-PDF Editor Desktop Runner (Windows)
echo ==========================================
echo.

if not exist "node_modules" (
    echo [INFO] Dependencies not found. Running install.bat...
    call scripts\windows\install.bat
)

if not exist "dist\index.html" (
    echo [INFO] Desktop build not found. Running npm run build...
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Build failed.
        exit /b 1
    )
)

echo [INFO] Launching desktop app...
call npm run electron
popd
