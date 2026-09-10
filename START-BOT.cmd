@echo off
setlocal
cd /d "%~dp0"
set "FAINTED_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "FAINTED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "runtime\node\node.exe" set "FAINTED_NODE=%~dp0runtime\node\node.exe"
"%FAINTED_NODE%" --version >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then reopen this launcher.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
"%FAINTED_NODE%" --env-file-if-exists=.env src/check.js
if errorlevel 1 (
  echo Open .env in this folder and fill the required settings.
  pause
  exit /b 1
)
if not exist "node_modules\discord.js\package.json" (
  echo Dependencies are missing. Open a terminal in this folder and run npm install.
  pause
  exit /b 1
)
if "%~1"=="setup" (
  "%FAINTED_NODE%" --env-file-if-exists=.env src/register.js
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
"%FAINTED_NODE%" --env-file-if-exists=.env src/desktop.js start
pause
