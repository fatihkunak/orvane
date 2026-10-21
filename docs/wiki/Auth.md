# Auth

Auth.js v5 (`next-auth@beta`), giriş sağlayıcısı Google (`AUTH_GOOGLE_ID/SECRET`).

- `auth.config.ts` — edge-safe: sağlayıcılar, `pages.signIn=/login`, `authorized` callback'i (korumalı: `/dashboard /calendar /analytics /accounts /settings`).
- `auth.ts` — tam örnek: `PrismaAdapter` + `session.strategy="jwt"`; `session.user.id` = `token.sub`.
- `proxy.ts` — Next 16'da middleware'in adı. Adapter OLMADAN `auth.config`'i kullanır. `export const proxy = auth` açık olmalı (destructured export build'i kırar).
- `app/api/auth/[...nextauth]/route.ts` — handlers; `app/login/page.tsx` — Google ile giriş (server action).
- Sosyal platform bağlama (X/LinkedIn/Threads) Auth.js'ten AYRIDIR: Adım 6'da kendi OAuth rotalarıyla `SocialAccount`'a yazılır. Bkz. [[Database]].
