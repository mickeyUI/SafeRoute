@echo off
setlocal
cd /d "%~dp0"
title SafeRoute - Full Stack Launcher

echo ==============================================
echo       SAFEROUTE FULL STACK LAUNCHER
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is required for frontend.
  pause
  exit /b 1
)

set "PYTHON_EXE="
if exist "%~dp0backend\venv\Scripts\python.exe" (
  set "PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe"
) else if exist "%~dp0..\..\FullStack\SafeRoute\backend\venv\Scripts\python.exe" (
  set "PYTHON_EXE=%~dp0..\..\FullStack\SafeRoute\backend\venv\Scripts\python.exe"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_EXE=python"
  )
)

if "%PYTHON_EXE%"=="" (
  echo Error: Python was not found to run backend.
  pause
  exit /b 1
)

echo [1/2] Starting SafeRoute FastAPI Backend on http://127.0.0.1:8000 ...
start "SafeRoute Backend API" cmd /k "cd /d "%~dp0" && set PYTHONPATH=backend&& "%PYTHON_EXE%" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting SafeRoute Frontend on http://localhost:5173 ...
cd /d "%~dp0frontend"
if not exist "node_modules" (
  echo Installing frontend packages...
  call npm install
)

start "SafeRoute Frontend UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both backend and frontend servers have been started in separate windows!
echo - Frontend: http://localhost:5173
echo - Backend Docs: http://127.0.0.1:8000/docs
echo.
pause
