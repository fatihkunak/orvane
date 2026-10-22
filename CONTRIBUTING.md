# Katkı Rehberi

Teşekkürler. Bu proje tek kişilik bir kurulumda çalışacak şekilde tasarlandı ve şu kurallarla geliştiriliyor.

## Başlamadan

- `.specify/memory/constitution.md` **diğer tüm kuralların üstündedir**. Bir değişiklik anayasayla çelişiyorsa önce anayasayı değiştir, sonra kodu.
- `docs/wiki/Index.md` → ilgili node'ları oku (wiki-first). Mimari, davranış veya tasarım kararı değiştiyse **aynı commit'te** wiki'yi ve `node docs/wiki/_build/map-nodes.mjs` çıktısını güncelle.
- Sır yazma: `.env` dosyaları, token'lar, API anahtarları commit'e girmez. Yalnız `.env.example` izlenir.

## Kurulum

README'deki adımlar. Özet: `cp .env.example .env`, `docker compose up -d`, `npm ci`, `npx prisma migrate dev`, `npm run dev`.

## Kalite kapıları (dördü de geçmeli)

```bash
npx tsc --noEmit
npm run lint
npm test            # GERÇEK Postgres'e karşı; her test kendi kullanıcısını açar/siler
npm run build
```

Aynı dördü CI'da her push ve PR'da çalışır (`.github/workflows/ci.yml`). Kırmızı CI ile birleştirme yapılmaz.

Test yazarken:

- Ağ çağrısı yapan katmanlarda `fetch` enjekte edilir; testler gerçek sağlayıcıya/platforma **çıkmaz**.
- Yayın olayı gönderen testler `inngest.send`'i taklit eder; yoksa sahte token'larla gerçek yayın denemesi olur.
- Güvenlik değişmezlerini (token şifreleme, SSRF, çift gönderim, MCP yetkileri) etkileyen her değişiklik test içerir.

## Commit ve dal

- `main` korumalıdır; değişiklikler PR ile gelir.
- Commit mesajı: ne + **neden**. "Refactor" gibi içeriksiz mesajlar kabul edilmez; davranış değişikliği varsa tek satırda görünmeli.
- Büyük kararlar ve yarım bırakılan çözümler `docs/wiki/` veya commit gövdesinde gerekçesiyle yazılır.
- Commit/push için depo sahibinin onayı gerekir; katkı olarak PR açmak serbesttir.

## Üslup

- Arayüz ve belgeler Türkçe; kod ve kod yorumları İngilizce.
- Marka adı `lib/brand.ts`'ten okunur, sabit hex renk kullanılmaz, tema token'ları `app/globals.css` içinde.
- Erken soyutlama yok: aynı kural iki yerde yaşıyorsa tek kaynağa indir (ör. zaman doğrulaması `scheduleTimeSchema`).

## Güvenlik açıkları

Lütfen issue açmak yerine [SECURITY.md](SECURITY.md) içindeki özel bildirim yolunu kullan.
