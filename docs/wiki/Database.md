# Database

Kaynak: `prisma/schema.prisma`, `prisma.config.ts`, `lib/prisma.ts`. Üretilen istemci `generated/prisma` (gitignore'da; `npm install` → `postinstall` ile yeniden üretilir).

- **Prisma 7**: bağlantı URL'si şemada değil `prisma.config.ts`'te (`DIRECT_URL`, migrasyon için havuzsuz). Çalışma zamanı `DATABASE_URL` ile `@prisma/adapter-pg` (`lib/prisma.ts` singleton).
- `prisma` CLI ve `@prisma/client` AYNI sürüme sabit (7.10.1); `prisma@latest` şu an 8.0 RC, karıştırma.
- Modeller: `User`, `SocialAccount` (bağlı Threads/LinkedIn/X; token'lar şifreli saklanacak), `Post`, `PostPlatform` (post↔platform pivot, `@@unique[postId, platform]`). Enum'lar: `Platform`, `PostStatus`, `PostPlatformStatus`.
- Auth.js modelleri (`Account`, `Session`, `VerificationToken`) giriş kimliği içindir; bağlı sosyal hesaplar `SocialAccount`'tadır, karıştırma. Bkz. [[Auth]].
- Zamanlayıcı sorgusu `Post @@index([status, scheduledAt])` üzerine kurulu.
- Yerel DB: Docker `postforge-postgres` (postgres:16, 127.0.0.1:5546, veritabanı `postforge`, volume `synapse-pgdata` — eski ad, volume yeniden adlandırılamadığı için bırakıldı). Kimlik bilgileri `.env`'de.
- Komutlar: `npm run db:migrate`, `npm run db:studio`.
