# Settings

`app/(dashboard)/settings/page.tsx`: profil + "Kurulum durumu". X/LinkedIn/Threads anahtarları, `TOKEN_ENCRYPTION_KEY`, Google girişi, Cloudinary ve Inngest anahtarları için yalnız VAR/YOK gösterilir (değer asla gösterilmez).

Bkz. [[AiSettings]] (yapay zekâ sağlayıcıları, `/settings/ai`).
- `/settings/mcp`: MCP belirteçleri ([[Mcp]]). Kurulum durumuna `ORVANE_ADMIN_TOKEN` (yönetim API'si) eklendi.
- **Sürüm ve güncelleme (2026-10-22):** `components/settings/version-card.tsx` + `lib/update.ts` + `server/actions/update.ts` + `deploy/update.cmd`.
  - Kart yalnız `ORVANE_UPDATE_ENABLED=1` **ve** oturumdaki e-postanın `ORVANE_OWNER_EMAIL` ile eşleşmesi hâlinde görünür (ikisi de yoksa **kapalı**; admin token'ı bile yetmez).
  - "Kontrol et": yerel `git rev-parse HEAD` + GitHub `repos/{ORVANE_REPO}/commits?sha={ORVANE_BRANCH}` (varsayılan `fatihkunak/orvane` / `main`) → aradaki commit'ler listelenir. Yerel commit listede yoksa (shallow clone, farklı dal) tarihe göre yaklaşık hesaplanır ve bunu **söyler**.
  - "Güncelle" iki adımlı onay ister, sonra `deploy/update.cmd`'yi **kendi sürecinde** başlatır (`%TEMP%`'e kopyalanmış hâlinden, çünkü script çalışırken repo değişir): `git pull --ff-only` → `npm ci` → `prisma migrate deploy` + `generate` → port 3055'teki sunucuyu durdur → `npm run build` → `start-app.cmd`. Build patlarsa **eski sunucu ayakta kalır**.
  - Cevap yalnız "başladı"dır: sunucu kendi kendini yeniden başlatır, sayfa 5 sn'de bir `/login`'e bakıp sunucu dönünce kendini yeniler. Kayıt: `deploy/logs/update.log`.
  - Otomatik güncelleme hem Windows (`deploy/update.cmd`, port 3055'teki süreci kendisi yönetir) hem Linux/macOS (`deploy/update.sh`; `orvane` adlı systemd birimi veya pm2 uygulaması varsa onunla durdurup başlatır, yoksa "kendin yeniden başlat" der) üzerinde çalışır. `startUpdate` platforma göre betiği seçer (`updateInvocation`).
  - `deploy/backup.mjs` migrate'ten ÖNCE yedek alır: `pg_dump` PATH'te yoksa DATABASE_URL'deki portu yayınlayan Docker konteynerini kullanır; ikisi de yoksa yedeği atlar ve devam eder (log'a yazar). Son 5 dump tutulur.
  - Doğrulama: `tests/update.test.ts` (ayrıştırma, commit karşılaştırma, sahip/kapalı kapıları, platform seçimi). **Canlı güncelleme denenmedi** (kullanıcının sunucusunu yeniden başlatmak anlamına gelir).
- **Hesap silme (2026-10-22):** `components/settings/delete-account.tsx` (onay için e-posta yazdırır) + `server/actions/account.ts` (`deleteAccountAction`, sunucu da aynı e-postayı doğrular) + `lib/account.ts` (`deleteUserAccount`).
  - Veritabanı tek `delete` ile silinir: şemadaki tüm ilişkiler `onDelete: Cascade` (gönderiler, platform satırları, sosyal hesaplar/token'lar, AI sağlayıcıları, MCP belirteçleri).
  - Yerel medya dosyaları (`.uploads/`) silinir; ad yalnız `/api/media/<uuid>.<ext>` kalıbına uyuyorsa (path traversal yok). **Cloudinary nesneleri silinmez** — uygulama destroy API'si çağırmaz, [[Media]] ve `PRIVACY.md` bunu söyler.
  - En sonda `signOut({ redirectTo: "/login" })`: silme başarısız olursa oturum ve veri yerinde kalır. Doğrulama: `tests/account-deletion.test.ts` (ilişkiler silinir, yerel dosya gider, başka kullanıcı etkilenmez).
