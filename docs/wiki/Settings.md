# Settings

`app/(dashboard)/settings/page.tsx`: profil + "Kurulum durumu". X/LinkedIn/Threads anahtarları, `TOKEN_ENCRYPTION_KEY`, Google girişi, Cloudinary ve Inngest anahtarları için yalnız VAR/YOK gösterilir (değer asla gösterilmez).

Bkz. [[AiSettings]] (yapay zekâ sağlayıcıları, `/settings/ai`).
- `/settings/mcp`: MCP belirteçleri ([[Mcp]]). Kurulum durumuna `ORVANE_ADMIN_TOKEN` (yönetim API'si) eklendi.
- **Sürüm ve güncelleme (2026-10-22):** `components/settings/version-card.tsx` + `lib/update.ts` + `server/actions/update.ts` + `deploy/update.cmd`.
  - Kart yalnız `ORVANE_UPDATE_ENABLED=1` **ve** oturumdaki e-postanın `ORVANE_OWNER_EMAIL` ile eşleşmesi hâlinde görünür (ikisi de yoksa **kapalı**; admin token'ı bile yetmez).
  - "Kontrol et": yerel `git rev-parse HEAD` + GitHub `repos/{ORVANE_REPO}/commits?sha={ORVANE_BRANCH}` (varsayılan `fatihkunak/orvane` / `main`) → aradaki commit'ler listelenir. Yerel commit listede yoksa (shallow clone, farklı dal) tarihe göre yaklaşık hesaplanır ve bunu **söyler**.
  - "Güncelle" iki adımlı onay ister, sonra `deploy/update.cmd`'yi **kendi sürecinde** başlatır (`%TEMP%`'e kopyalanmış hâlinden, çünkü script çalışırken repo değişir): `git pull --ff-only` → `npm ci` → `prisma migrate deploy` + `generate` → port 3055'teki sunucuyu durdur → `npm run build` → `start-app.cmd`. Build patlarsa **eski sunucu ayakta kalır**.
  - Cevap yalnız "başladı"dır: sunucu kendi kendini yeniden başlatır, sayfa 5 sn'de bir `/login`'e bakıp sunucu dönünce kendini yeniler. Kayıt: `deploy/logs/update.log`.
  - Otomatik güncelleme yalnız Windows/git kopyası kurulumunda (bu makine) çalışır; başka platformda eylem açık bir hata ile elle komutları söyler.
  - Doğrulama: `tests/update.test.ts` (ayrıştırma, commit karşılaştırma, sahip/kapalı kapıları). **Canlı güncelleme denenmedi** (kullanıcının sunucusunu yeniden başlatmak anlamına gelir).
