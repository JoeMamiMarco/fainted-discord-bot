@echo off
cd /d "%~dp0"
"%~dp0runtime\node\node.exe" "%~dp0scripts\start-web.js"
if errorlevel 1 pause
