@echo off
REM Orvane dev sunucusu (localhost:3055). HTTPS tüneli (orvane-dev.fatihgo.com) bunu dışarı açar.
set "PATH=C:\Program Files\nodejs;%PATH%"
set INNGEST_DEV=1
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
node node_modules\next\dist\bin\next dev -p 3055 >> deploy\logs\app.log 2>&1
