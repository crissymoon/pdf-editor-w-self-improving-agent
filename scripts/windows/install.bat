@echo off
REM XCM-PDF Editor Installation Script
REM Leto's Angels Educational Project
REM Developed by XcaliburMoon Web Development
REM Cross-platform installation for Windows

setlocal enabledelayedexpansion
set "REPO_ROOT=%~dp0..\.."
pushd "%REPO_ROOT%"

echo ==========================================
echo XCM-PDF Editor Installation
echo Leto's Angels Educational Project
echo XcaliburMoon Web Development
echo ==========================================
echo.

REM Check for Node.js
echo [1/4] Checking Node.js installation...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from one of the following sources:
    echo   - Official website: https://nodejs.org/
    echo   - Using nvm-windows: https://github.com/coreybutler/nvm-windows
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js is installed: %NODE_VERSION%

REM Extract major version number
for /f "tokens=1 delims=." %%a in ("%NODE_VERSION:~1%") do set MAJOR_VERSION=%%a
if %MAJOR_VERSION% LSS 16 (
    echo [WARNING] Node.js version 16 or higher is recommended
    echo Current version: %NODE_VERSION%
)

REM Check for npm
echo [2/4] Checking npm installation...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed!
    echo npm should come with Node.js. Please reinstall Node.js.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm is installed: v%NPM_VERSION%

REM Clean installation
echo.
echo [3/4] Cleaning previous installation...
if exist "node_modules" (
    echo Removing existing node_modules directory...
    rmdir /s /q node_modules
)

REM Install dependencies
echo.
echo [4/4] Installing dependencies...
echo This may take a few minutes...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed!
    pause
    exit /b 1
)

REM Verify installation
echo.
echo Verifying installation...
if exist "node_modules" (
    echo [OK] Dependencies installed successfully!
) else (
    echo [ERROR] Installation failed!
    pause
    exit /b 1
)

REM Success message
echo.
echo ==========================================
echo Installation Complete!
echo ==========================================
echo.
echo To start the development server, run:
echo   scripts\windows\run.bat  or  npm run dev
echo.
echo To build for production, run:
echo   npm run build
echo.
echo To preview production build, run:
echo   npm run preview
echo.
echo ==========================================
echo.
popd
pause
