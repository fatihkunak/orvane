# Tests

`npm test` (vitest, `tests/*.test.ts`; dosyalar sırayla çünkü tek DB). `.env`'deki Postgres'e bağlanır; her test kendi kullanıcısını açar/siler (cascade).
- `unit.test.ts`: crypto, karakter sayımı, zod şeması, durum türetme, token yenileme politikası, LinkedIn kaçışı, OAuth URL/takas/yenileme (sahte fetch), SSRF beyaz listesi, dosya imzası.
- `publishers.test.ts`: X/LinkedIn/Threads tam istek dizileri (sahte fetch+sleep): parçalı yükleme, ETag, video işleme beklemesi, hata sınıflandırma.
- `token-refresh-race.test.ts`: GERÇEK DB + X gibi davranan sahte sağlayıcı (tek kullanımlık refresh token, yavaş yanıt); 3 eşzamanlı `getAccessToken` → tek yenileme, hepsi yeni token alır; gerçek ret → yine `ReconnectRequiredError`.
- `publishing.test.ts`: GERÇEK DB; tam yayın, eşzamanlı iki koşuda tek gönderim, kısmi hata, token yenileme+rotasyon, ölü token, Threads adımları, bayat claim.
- `oauth-flow.test.ts`: GERÇEK DB; state/PKCE/çerez, CSRF reddi, başka kullanıcı/çerezsiz tekrar, reddetme, şifreli kayıt, yeniden bağlamada upsert.

Uçtan uca (elle, tarayıcı + Inngest Dev Server): form→olay→yayın→hata kaydı, cron ile zamanlı yayın, silme, yükleme korumaları.
GOTCHA: `localhost` oturum çerezi Auth.js tarafından HttpOnly yenilenir, JS ile ezilemez; test için `127.0.0.1` kullan (`next.config.ts` → `allowedDevOrigins`, yoksa sayfa hidrate olmaz).
- `ai-core.test.ts`: sağlayıcı kaydı bütünlüğü ve tuzaklar, SSRF koruması, istek/yanıt biçimleri, HTTP hata sınıflandırma, yedek zinciri, model yedeği, istem ve JSON ayrıştırma (taklit `fetch`).
- `ai-service.test.ts`: GERÇEK DB; şifreli anahtar deposu, sıralama, SSRF reddi, üretim hattı (yedeğe geçiş, model yedeği, limit aşımı onarımı, anahtar sızıntısı yok), hız sınırı ve gerçek HTTP loopback sunucusuyla uçtan uca. Hiçbiri gerçek sağlayıcıya gitmez.
- `ai-image.test.ts`: görsel isteği/ayrıştırma/limitler, URL cevabının reddi (SSRF), sağlayıcı seçimi; GERÇEK DB + yerel HTTP görsel sunucusuyla uçtan uca (baytlar `.uploads`'a yazılır, kota hatasında yedek).
- `drafts.test.ts`: taslak listesi/formu, kaydetme (planlama, platform düşürme), **ileri tarihli SCHEDULED düzenleme**, vadesi gelmiş gönderinin reddi, **hızlı saat değiştirme** (geçmiş/başkası/taslak/yayınlanmış reddi), platform başına medya.
- `mcp-admin.test.ts`: MCP araç listesi, `schedule_post`, `publish_now` (onaysız/gizli metin/başkasının/yayınlanmış reddi, tek olay), belirteç deposu, uç nokta yetkisi, yönetim API'si ve askıya alma.
- `update.test.ts`: GitHub commit ayrıştırma, yerel↔uzak karşılaştırma (yerel commit listede yoksa tarih tahmini), `ORVANE_UPDATE_ENABLED` / `ORVANE_OWNER_EMAIL` kapıları (fail-closed).
- **CI:** `.github/workflows/ci.yml` her push/PR'da Postgres 16 servisiyle `tsc --noEmit` → `eslint` → `npm test` → `npm run build` → **`npm run e2e`** çalıştırır; dördü de geçmeden birleştirme yapılmaz.
- **Tarayıcı testleri (Playwright, 2026-10-22):** `tests/e2e/public.spec.ts` — yalnız oturum gerektirmeyen yüzeyler: `/api/health` veritabanını görüyor mu, `/login` Google düğmesini çiziyor mu, `/login` **konsol hatası üretmeden** açılıyor mu, olmayan yol kendi 404 sayfamızı veriyor mu, korumalı sayfa girişe atıyor mu (Location başlığı üzerinden; yönlendirmeyi takip etmez), güvenlik başlıkları var mı (CSP report-only). Yerelde `npm run build && npm run e2e` (kendi `next start`'ını 3100'de açar). Oturumlu akışlar bilinçli olarak **`docs/VERIFY.md`**'de elle: bir test için oturum üretmek ya giriş bypass'ı ya da gerçek `AUTH_SECRET` demek olurdu.
