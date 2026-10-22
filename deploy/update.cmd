@echo off
REM Orvane self-update. Started detached by the app (server/actions/update.ts) from a COPY in %TEMP%, so this file may
REM change under us without breaking the run. Arguments: %1 = repo root.
REM Order matters: the dev/prod server must be stopped BEFORE the build (they share .next), and only a clean build is
REM allowed to restart it -- a failed update leaves the old server running.
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "REPO=%~1"
if "%REPO%"=="" set "REPO=%~dp0.."
cd /d "%REPO%" || exit /b 1
if not exist deploy\logs mkdir deploy\logs
set "LOG=%REPO%\deploy\logs\update.log"
echo. >> "%LOG%"
echo ===== %DATE% %TIME% update started >> "%LOG%"
git rev-parse --short HEAD >> "%LOG%" 2>&1

echo [1/7] git pull --ff-only >> "%LOG%"
call git pull --ff-only >> "%LOG%" 2>&1 || goto fail

echo [2/7] npm ci >> "%LOG%"
call npm ci >> "%LOG%" 2>&1 || goto fail

echo [3/7] veritabani yedegi >> "%LOG%"
call node deploy\backup.mjs >> "%LOG%" 2>&1 || (echo UPDATE FAILED (backup) - hicbir sey degistirilmedi, migration calismadi >> "%LOG%" & exit /b 1)

echo [4/7] prisma migrate deploy >> "%LOG%"
call npx prisma migrate deploy >> "%LOG%" 2>&1 || goto fail
call npx prisma generate >> "%LOG%" 2>&1 || goto fail

echo [5/7] stopping the app on port 3055 >> "%LOG%"
REM Let the HTTP request that started this finish before killing its own server
call :sleep 4
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 3055 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >> "%LOG%" 2>&1
call :sleep 2

REM Logs can only be rotated while nothing holds them open
call node deploy\rotate-logs.mjs >> "%LOG%" 2>&1

echo [6/7] npm run build >> "%LOG%"
call npm run build >> "%LOG%" 2>&1 || (echo UPDATE FAILED (build) - app left stopped, start it by hand >> "%LOG%" & exit /b 1)

echo [7/7] starting the app >> "%LOG%"
wscript //nologo "%REPO%\deploy\run-hidden.vbs" "%REPO%\deploy\start-app.cmd"
echo ===== %DATE% %TIME% update done >> "%LOG%"
exit /b 0

:fail
echo UPDATE FAILED - the old app keeps running >> "%LOG%"
exit /b 1

:sleep
powershell -NoProfile -Command "Start-Sleep -Seconds %1" >nul 2>&1
exit /b 0
