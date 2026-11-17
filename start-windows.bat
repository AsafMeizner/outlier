@echo off
rem Starts the Outlier server with the bundled Node.js. Close this window or press Ctrl+C to stop it.
rem Admin commands work too, for example:  start-windows.bat reset-password dana
cd /d "%~dp0"
set "NODE=%~dp0runtime\win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" src\server.mjs %*
if "%~1"=="" pause
