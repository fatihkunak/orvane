# Tests

`npm test` (vitest, `tests/*.test.ts`; dosyalar sırayla çünkü tek DB). `.env`'deki Postgres'e bağlanır; her test kendi kullanıcısını açar/siler (cascade).
- `unit.test.ts`: crypto, karakter sayımı, zod şeması, durum türetme, token yenileme politikası, LinkedIn kaçışı, OAuth URL/takas/yenileme (sahte fetch), SSRF beyaz listesi, dosya imzası.
- `publishers.test.ts`: X/LinkedIn/Threads tam istek dizileri (sahte fetch+sleep): parçalı yükleme, ETag, video işleme beklemesi, hata sınıflandırma.
- `publishing.test.ts`: GERÇEK DB; tam yayın, eşzamanlı iki koşuda tek gönderim, kısmi hata, token yenileme+rotasyon, ölü token, Threads adımları, bayat claim.
- `oauth-flow.test.ts`: GERÇEK DB; state/PKCE/çerez, CSRF reddi, başka kullanıcı/çerezsiz tekrar, reddetme, şifreli kayıt, yeniden bağlamada upsert.

Uçtan uca (elle, tarayıcı + Inngest Dev Server): form→olay→yayın→hata kaydı, cron ile zamanlı yayın, silme, yükleme korumaları.
GOTCHA: `localhost` oturum çerezi Auth.js tarafından HttpOnly yenilenir, JS ile ezilemez; test için `127.0.0.1` kullan (`next.config.ts` → `allowedDevOrigins`, yoksa sayfa hidrate olmaz).
