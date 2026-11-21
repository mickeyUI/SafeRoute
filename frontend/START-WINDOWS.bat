@echo off
setlocal
cd /d "%~dp0"
title SafeRoute - Start

echo ==============================
echo       SAFEROUTE FRONTEND
echo ==============================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available in PATH.
  echo Install Node.js 20 or later, then reopen this file.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project dependencies. Internet access is required.
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo Starting SafeRoute. Keep this window open while using the app.
echo Open the local URL printed below in your browser.
echo.
call npm run dev
pause
