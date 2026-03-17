@echo off
REM XCM-PDF Editor Run Script
REM Leto's Angels Educational Project
REM Developed by XcaliburMoon Web Development
REM Cross-platform run script for Windows

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%"

echo ==========================================
echo XCM-PDF Editor Development Server
echo Leto's Angels Educational Project
echo XcaliburMoon Web Development
echo ==========================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo [WARNING] Dependencies not installed!
    echo Running installation script...
    echo.
    call scripts\windows\install.bat
    echo.
)

REM Start the development server
echo Starting development server...
echo.
echo [OK] The application will open in your default browser
echo [INFO] Press Ctrl+C to stop the server
echo.
echo ==========================================
echo.

call npm run dev
popd
