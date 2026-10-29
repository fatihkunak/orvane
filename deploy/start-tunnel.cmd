@echo off
REM Orvane HTTPS tuneli (orvane-dev.fatihgo.com -> localhost:3055). Ayri tunel: diger projelerin tunellerine dokunmaz.
REM --config SART: varsayilan ~/.cloudflared/config.yml baska bir tunele (sound-platform-dev) aittir.
REM Bu dosya ASCII + CRLF kalmali: cmd, LF satir sonlu ve UTF-8 cok baytli karakter iceren .cmd dosyasini yanlis ayristirir (satirlarin basi kaybolur, cd/set calismaz).
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config "C:\Users\Fatih\.cloudflared\orvane-dev.yml" run orvane-dev >> deploy\logs\cloudflared.log 2>&1
