@echo off
REM Inngest Dev Server (zamanlanmis gonderiler ve yayin isleri). Uygulama ayaga kalksin diye ~25 sn bekler.
REM Bu dosya ASCII + CRLF kalmali: cmd, LF satir sonlu ve UTF-8 cok baytli karakter iceren .cmd dosyasini yanlis ayristirir (satirlarin basi kaybolur, cd/set calismaz).
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
ping -n 26 127.0.0.1 >nul
REM Surum sabit + --yes: "@latest" yeni surum cikinca npx "Ok to proceed?" diye sorar ve gizli pencerede sonsuza dek bekler
npx --yes inngest-cli@1.49.0 dev -u http://localhost:3055/api/inngest >> deploy\logs\inngest.log 2>&1
