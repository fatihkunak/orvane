@echo off
REM Orvane HTTPS tüneli (orvane-dev.fatihgo.com -> localhost:3055). Ayrı tünel: diğer projelerin tünellerine dokunmaz.
REM --config ŞART: varsayılan ~/.cloudflared/config.yml başka bir tünele (sound-platform-dev) aittir.
cd /d "C:\Users\Fatih\orvane"
if not exist deploy\logs mkdir deploy\logs
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config "C:\Users\Fatih\.cloudflared\orvane-dev.yml" run orvane-dev >> deploy\logs\cloudflared.log 2>&1
