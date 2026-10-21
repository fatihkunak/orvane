# Synapse

## ⚠️ WIKI FIRST (MUTLAK KURAL)
Projeye her başladığında, herhangi bir kod okuma/grep/glob YAPMADAN ÖNCE `docs/wiki/` klasörünü tara (`Index.md` → ilgili node'lar). Proje bilgisi orada. Kod taramaya wiki'den sonra geç. Kesinleşen mimari değişiklikte ilgili node'u güncelle; `node docs/wiki/_build/map-nodes.mjs` ile `map.json`'u yeniden üret.

## Notlar
- Tailwind v4: `tailwind.config` yok; tema token'ları `app/globals.css` içinde.
- Uygulama yalnızca koyu tema; metinde gradient kullanma (ikon/buton/yüzeyde serbest).
- Kök dizin yapısı: `app/`, `components/`, `lib/`, `prisma/`, `server/actions/` (`src/` yok).
- Test: `npm test` (gerçek Postgres gerekir). Dev sunucuyu yalnız KENDİ portundan durdur (başka projelerin servisleri çalışıyor).
- Yerel Postgres: Docker `synapse-postgres` (127.0.0.1:5546). Zamanlanmış yayın denemesi için Inngest Dev Server: `npx inngest-cli@latest dev -u http://localhost:3055/api/inngest`.
- Güvenlik invariantları (bozma): medya URL'leri beyaz liste (`lib/media.ts`), token'lar şifreli, OAuth `state` çerezi, atomik claim (`lib/publishing.ts`).
