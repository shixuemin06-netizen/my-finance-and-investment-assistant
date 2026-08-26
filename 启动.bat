@echo off
setlocal
title Invest Daily
cd /d "%~dp0"

echo.
echo  ============================================
echo    Invest Daily System - starting...
echo  ============================================
echo.

:: === API Key ===
:: The key must be set locally before starting this script.
if "%DEEPSEEK_API_KEY%"=="" (
  echo [error] DEEPSEEK_API_KEY is not set.
  echo Set it in this Command Prompt, then start again:
  echo   set DEEPSEEK_API_KEY=your_key
  pause
  exit /b 1
)

:: === 1. Status check: generate today's digest if missing ===
echo [status] checking today's digest...
node node_modules\tsx\dist\cli.mjs pipeline\catchup.ts

:: === 2. Frontend (bind 127.0.0.1) ===
echo.
echo [frontend] starting Next.js on 127.0.0.1:3099 ...
start "invest-frontend" cmd /c "node node_modules\next\dist\bin\next dev -H 127.0.0.1 --port 3099"

:: === 3. Wait for frontend to be ready ===
timeout /t 5 /nobreak >nul

:: === 4. Scheduler (daily 08:00) ===
echo [scheduler] starting daily timer ...
start "invest-scheduler" cmd /c "node node_modules\tsx\dist\cli.mjs scheduler.ts"

:: === 5. Open browser ===
echo [browser] opening http://localhost:3099 ...
start http://localhost:3099

echo.
echo  ============================================
echo    Started OK.
echo      view:  http://localhost:3099
echo      inbox: http://localhost:3099/import
echo      auto digest: daily 08:00
echo  ============================================
echo.
echo  Closing this window does not stop the services.
pause
