@echo off
rem Starts the Outlier server from a source checkout (Node.js 24 or newer on the PATH). Close the window to stop it.
rem Run "npm run build" first. Admin commands work too, for example:  start-windows.bat reset-password dana
rem The offline package (npm run bundle) has its own start scripts with Node.js included.
cd /d "%~dp0"
node server\server.ts %*
if "%~1"=="" pause
