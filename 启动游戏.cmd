@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 22.13 or newer from https://nodejs.org
  pause
  exit /b 1
)

node "scripts\play.mjs" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [launcher] Game stopped with an error, code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
