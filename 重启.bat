@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
if errorlevel 1 goto failed
node scripts\local.mjs restart
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo See logs\web.log or run: node scripts\local.mjs doctor
pause
exit /b 1
