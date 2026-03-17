@echo off
REM XCM-PDF Editor - Example PDF Generator Script
REM Leto's Angels Educational Project
REM Developed by XcaliburMoon Web Development

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%"

echo ==========================================
echo XCM-PDF Editor - Example PDF Generator
echo Leto's Angels Educational Project
echo XcaliburMoon Web Development
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [ERROR] Dependencies not installed!
    echo Please run scripts\windows\install.bat first
    popd
    pause
    exit /b 1
)

echo Generating example PDF...
echo.

call npm run generate-example

echo.
echo Done!
echo.
echo The example PDF has been created in the public/ directory
echo You can now open it in the PDF editor to test all features
echo.
popd
pause
