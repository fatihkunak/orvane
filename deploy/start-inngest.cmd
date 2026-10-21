@echo off
REM Inngest Dev Server (zamanlanmış gönderiler ve yayın işleri). Uygulama ayağa kalksın diye ~25 sn bekler.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
ping -n 26 127.0.0.1 >nul
npx inngest-cli@latest dev -u http://localhost:3055/api/inngest >> deploy\logs\inngest.log 2>&1
