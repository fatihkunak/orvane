# Synapse

Tek içerik, tüm platformlar: Threads, LinkedIn ve X hesaplarını bağla; tek yerden gönderi oluştur, planla ve otomatik yayınla.

Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Prisma 7 + PostgreSQL · Auth.js v5 · Inngest · Recharts

## Çalıştırma

```bash
npm install
cp .env.example .env            # değerleri doldur (en az DATABASE_URL, DIRECT_URL, AUTH_SECRET, TOKEN_ENCRYPTION_KEY)
npx prisma migrate dev          # veritabanı şemasını kurar
npm run dev                     # http://localhost:3000

# Zamanlanmış yayın için ayrı terminalde:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Uygulama içindeki **Ayarlar → Kurulum durumu** sayfası hangi entegrasyonların hazır olduğunu gösterir.

## Nasıl çalışır

1. **Giriş:** Google ile (Auth.js, JWT oturum). Dashboard rotaları `proxy.ts` + layout'ta korunur.
2. **Hesap bağlama:** `/api/connect/<twitter|linkedin|threads>` → platformun onay ekranı → callback token'ları AES-256-GCM ile şifreleyip `SocialAccount`'a yazar. X için PKCE, tüm akışlarda `state` + httpOnly çerez ile CSRF koruması.
3. **Gönderi:** `/posts/new` formu; platform başına karakter sınırı, medya yükleme (Cloudinary ya da yerel), taslak / zamanla / şimdi yayınla.
4. **Yayın:** Inngest her dakika `SCHEDULED` ve zamanı gelmiş gönderileri bulur, her biri için `post/publish.requested` olayı üretir. `publish-post` fonksiyonu her platformu ayrı adımda yayınlar; bir platformun hatası diğerlerini engellemez. Çift gönderim, veritabanında atomik "claim" ile engellenir.
5. **Token yenileme:** X token'ı (2 saat) yayından hemen önce, Threads/LinkedIn günlük işle yenilenir.

## Test

```bash
npm test        # vitest: birim + gerçek Postgres ile entegrasyon (DATABASE_URL gerekir)
npm run lint
npx tsc --noEmit
```

Platform çağrıları testlerde sahte `fetch` ile doğrulanır; gerçek API'lere karşı yalnızca geçersiz token ile hata yolu denenmiştir (bkz. `docs/wiki/Publishing.md`).

## Önemli notlar

- `prisma` CLI ve `@prisma/client` aynı sürüme sabit (7.10.1); `prisma@latest` şu an 8.0 RC.
- Medya adresleri yalnızca bu uygulamanın yüklemeleri ya da kendi Cloudinary hesabın olabilir (SSRF koruması, `lib/media.ts`).
- Threads medya URL'lerini kendisi indirir; yerel `localhost` dosyaları çalışmaz, Cloudinary gerekir.
- Erişim/etkileşim metrikleri her platformun analitik API izni gerektirir; Analitik sayfası şimdilik yalnızca Synapse'in kendi yayın verilerini gösterir.
