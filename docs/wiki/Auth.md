# Auth

Auth.js v5 (`next-auth@beta`), giriş sağlayıcısı Google (`AUTH_GOOGLE_ID/SECRET`).

- `auth.config.ts` — edge-safe: sağlayıcılar, `pages.signIn=/login`, `authorized` callback'i (korumalı: `/dashboard /calendar /analytics /accounts /settings`).
- `auth.ts` — tam örnek: `PrismaAdapter` + `session.strategy="jwt"`; `session.user.id` = `token.sub`.
- `proxy.ts` — Next 16'da middleware'in adı. Adapter OLMADAN `auth.config`'i kullanır. `export const proxy = auth` açık olmalı (destructured export build'i kırar).
- `app/api/auth/[...nextauth]/route.ts` — handlers; `app/login/page.tsx` — Google ile giriş (server action).
- Sosyal platform bağlama (X/LinkedIn/Threads) Auth.js'ten AYRIDIR: Adım 6'da kendi OAuth rotalarıyla `SocialAccount`'a yazılır. Bkz. [[Database]].

## HTTPS geliştirme adresi (Threads için)

- Threads yalnızca HTTPS redirect kabul eder; uygulama yerelde `https://orvane-dev.fatihgo.com` adresinden kullanılır (`AUTH_URL` ve `APP_URL` bu adres, oturum çerezi aynı origin'de kalmalı).
- Cloudflare tüneli `orvane-dev` (yapılandırma `~/.cloudflared/orvane-dev.yml`, `http2`) bu adresi `localhost:3055`'e bağlar; `fatihgo.com` bölgesinde `orvane-dev` CNAME'i tüneli gösterir. Tüneli açık tutan komut: `cloudflared tunnel --config C:\Users\Fatih\.cloudflared\orvane-dev.yml run orvane-dev` (`--config` şart: varsayılan config.yml başka tünele ait).
- `next.config.ts` → `allowedDevOrigins` bu host'u içerir. Google, X, LinkedIn ve Meta (Threads) callback listelerinde hem `localhost:3055` hem bu HTTPS adres kayıtlıdır.
- Meta uygulaması "Orvane" (App ID 929456846712040), kullanım amacı Threads API; geliştirme modunda yalnızca davet edilen Threads test kullanıcıları bağlanabilir.

## Askıya alma (2026-10-22)
`User.suspendedAt` ([[AdminApi]]). `auth.ts` artık `auth()`'u saran bir fonksiyon dışa aktarır: JWT geçerli olsa da kullanıcı askıdaysa `null` döner (sayfa, sunucu eylemi, API rotası hepsinde). `signIn` callback'i askıdakinin yeni girişini reddeder. `authState()` yalnız dashboard kabuğu için: askıdakini `/suspended`'a yollar (proxy çerezi görüp `/login`'i `/dashboard`'a geri attığı için `/login`'e yollamak döngü olurdu). `proxy.ts` DB okuyamaz, o yüzden asıl kapı bu sunucu tarafı kontrol.
