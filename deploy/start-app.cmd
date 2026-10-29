@echo off
REM Orvane dev sunucusu (localhost:3055). HTTPS tuneli (orvane-dev.fatihgo.com) bunu disari acar.
REM Bu dosya ASCII + CRLF kalmali: cmd, LF satir sonlu ve UTF-8 cok baytli karakter iceren .cmd dosyasini yanlis ayristirir (satirlarin basi kaybolur, cd/set calismaz).
set "PATH=C:\Program Files\nodejs;%PATH%"
set INNGEST_DEV=1
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
node node_modules\next\dist\bin\next dev -p 3055 >> deploy\logs\app.log 2>&1
