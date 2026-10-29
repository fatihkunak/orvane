@echo off
REM Inngest Dev Server (zamanlanmış gönderiler ve yayın işleri). Uygulama ayağa kalksın diye ~25 sn bekler.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
ping -n 26 127.0.0.1 >nul
REM Sürüm sabit + --yes: "@latest" yeni sürüm çıkınca npx "Ok to proceed?" diye sorar ve gizli pencerede sonsuza dek bekler
npx --yes inngest-cli@1.49.0 dev -u http://localhost:3055/api/inngest >> deploy\logs\inngest.log 2>&1
