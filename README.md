# Orvane
<p align="center"><img src="public/logo-full.png" alt="Orvane" width="220"></p>

Tek içerik, tüm platformlar: Threads, LinkedIn ve X hesaplarını bağla; tek yerden gönderi oluştur, planla ve otomatik yayınla.

Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Prisma 7 + PostgreSQL · Auth.js v5 · Inngest · Recharts

> **Durum:** Orvane şu an kendi bilgisayarında ya da sunucunda çalıştırdığın (self-host) bir projedir; herkese açık bir hizmet değildir. Platformların kendi geliştirici uygulamalarını (Google, LinkedIn, Threads, X) sen oluşturursun.

## Özellikler

- **Gönderi:** platform başına karakter sınırı ve canlı önizleme, en fazla 4 medya, taslak / zamanla / şimdi yayınla. İstersen her platform için **ayrı metin ve ayrı görsel**.
- **Taslaklar:** form, yapay zekâ ve MCP'den gelen taslaklar `/drafts` sayfasında listelenir; açıp görsel ekler, zamanlar ya da yayınlarsın.
- **AI ile yaz:** kendi anahtarınla 19 sağlayıcıdan biri (Gemini, Groq, OpenRouter, Anthropic, OpenAI, yerel Ollama/LM Studio...), yedek zinciri. Üretilenler yalnızca taslaktır.
- **AI ile görsel:** aynı panelden ("Görsel üret") tek görsel üretir; OpenAI-uyumlu `/images/generations` konuşan sağlayıcılar (Gemini, OpenAI, Together; evren modeli çıkınca aynı ayarla). Görsel gönderi medyası olarak kaydedilir, "Kullan" diyene kadar hiçbir yere eklenmez.
- **MCP:** LM Studio, Claude Code gibi istemciler kişisel belirteçle bağlanıp taslak hazırlar, ileri tarihe **zamanlar** (`schedule_post`) ve yalnızca açık onayla var olan bir taslağı **hemen yayınlar** (`publish_now`, `confirm: true` olmadan çalışmaz; tek çağrıda yazıp gönderme yok).
- **Takvim, ana sayfa, analitik** (yalnızca Orvane'in kendi yayın verisi). Takvimdeki yayınlanmamış gönderiyi düzenleyebilir, saatini hızlıca değiştirebilirsin.
- **Bildirim zili ve profil menüsü:** başarısız yayınlar + önümüzdeki 24 saatte çıkacak gönderiler; hesap, ayarlar ve çıkış tek menüde.

## Kurulum (yerel geliştirme)

Gerekenler: **Node.js 22+**, **Docker** (ya da kendi PostgreSQL 16'n) ve giriş için bir **Google hesabı**.

```bash
git clone https://github.com/fatihkunak/orvane.git
cd orvane

cp .env.example .env            # sonra aşağıdaki değerleri doldur (npm ci .env olmadan da çalışır)
docker compose up -d            # yerel PostgreSQL (docker-compose.yml)
npm ci                          # kilit dosyasına birebir kurulum
npx prisma migrate dev          # veritabanı şemasını kurar
npm run dev                     # http://localhost:3000

# Zamanlanmış yayın için ayrı bir terminalde:
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

> **5432 doluysa** (başka bir Postgres ya da Docker projesi): `ORVANE_DB_PORT=5546 docker compose up -d` ve `.env`'de adresi `:5546` yap. Aynı makinede iki klon sorunsuz çalışır; konteyner adı sabit değildir.

`.env` içinde doldurman gereken **en az** şunlar:

| Değişken | Nasıl |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | `docker compose` kullandıysan: `postgresql://orvane:orvane@localhost:5432/orvane?schema=public` |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Auth.js bu adı ortamdan kendisi okur, kodda ayrıca geçmez |
| `TOKEN_ENCRYPTION_KEY` | aynı komut (32 bayt, base64). Platform ve AI anahtarlarını şifreler; değiştirirsen kayıtlı anahtarlar okunamaz olur |
| `AUTH_URL`, `APP_URL` | `http://localhost:3000` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | aşağıya bak |

### Google ile giriş (zorunlu)

1. [Google Cloud Console](https://console.cloud.google.com/) → bir proje → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized redirect URI:** `http://localhost:3000/api/auth/callback/google`
3. **OAuth consent screen**'de uygulamayı "Testing" modunda bırakıp kendi Google hesabını **test kullanıcısı** olarak ekle.
4. Client ID ve Client Secret'ı `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` olarak `.env`'ye yaz.

Uygulama içindeki **Ayarlar → Kurulum durumu** sayfası hangi entegrasyonların hazır olduğunu gösterir.

## Platformları bağlama (isteğe bağlı, her biri ayrı)

Hesaplar sayfasında bağlamak istediğin her platform için kendi geliştirici uygulamanı oluşturursun. Redirect adresi hepsinde `{APP_URL}/api/connect/<twitter|linkedin|threads>/callback`.

- **X:** anahtarları `.env`'ye değil, uygulamada **Hesaplar → X** bölümüne girersin (callback adresi ve adımlar orada yazar). X, API kullanımını uygulamanın sahibine faturalar; yani gönderi maliyeti senin X hesabında kalır. Yalnızca tek kişilik, kapalı bir kurulumda `.env`'deki `TWITTER_CLIENT_ID/SECRET` ortak anahtarını kullanmak için `SHARED_X_APP=1` verebilirsin; başkalarının giriş yapabildiği bir kurulumda **verme**.
- **LinkedIn:** `.env`'de `LINKEDIN_CLIENT_ID/SECRET`. Uygulamada "Share on LinkedIn" ve "Sign In with LinkedIn using OpenID Connect" ürünleri eklenmiş olmalı.
- **Threads:** `.env`'de `THREADS_APP_ID/SECRET`. Threads yalnızca **HTTPS** yönlendirme adresi kabul eder; yerelde bir tünel (ör. Cloudflare Tunnel) kurup `APP_URL`/`AUTH_URL`'i o adrese çevir. Meta uygulaması geliştirme modundayken yalnızca davet ettiğin Threads test kullanıcıları bağlanabilir.
- **Medya:** `CLOUDINARY_URL` yoksa yüklemeler yerel diske gider. Threads yerel adresleri indiremez, Threads'e görselli gönderi için Cloudinary gerekir.
- **Yapay zekâ:** anahtarlar `.env`'de değil, **Ayarlar → Yapay zekâ sağlayıcıları** sayfasında girilir.
- **MCP:** **Ayarlar → MCP** sayfasında belirteç oluşturup istemciye yapıştırırsın (örnekler orada).

## Güncelleme (kendi kurulumunu güncel tutmak)

Kurulumun bir git kopyasıysa **Ayarlar → Sürüm ve güncelleme** kartı çalışan commit'i GitHub'daki `main` ile karşılaştırır ve yeni commit'leri listeler. Bu kart varsayılan olarak **kapalıdır**, çünkü "Güncelle" repo kodunu bu makinede çalıştırır:

```bash
# .env
ORVANE_UPDATE_ENABLED=1
ORVANE_OWNER_EMAIL=senin@epostan.com   # yalnız bu hesapla giriş yapınca görünür
```

Güncelleme şunları yapar (`deploy/update.cmd`): `git pull --ff-only` → `npm ci` → `prisma migrate deploy` → sunucuyu durdur → `npm run build` → yeniden başlat. Build başarısız olursa **eski sunucu ayakta kalır**. Yerelde commit edilmemiş değişiklik varsa `pull` reddeder (çalışman ezilmez). Kayıt: `deploy/logs/update.log`. Otomatik buton şu an **yalnız Windows** kurulumunda çalışır; diğer platformlarda aynı komutları elle çalıştır (kart bunu söyler).

## Nasıl çalışır

1. **Giriş:** Google ile (Auth.js, JWT oturum). Dashboard rotaları `proxy.ts` + layout'ta korunur.
2. **Hesap bağlama:** `/api/connect/<twitter|linkedin|threads>` → platformun onay ekranı → callback token'ları AES-256-GCM ile şifreleyip `SocialAccount`'a yazar. X için PKCE, tüm akışlarda `state` + httpOnly çerez ile CSRF koruması.
3. **Gönderi:** `/posts/new` formu; platform başına karakter sınırı, medya yükleme, taslak / zamanla / şimdi yayınla.
4. **Yayın:** Inngest her dakika `SCHEDULED` ve zamanı gelmiş gönderileri bulur, her biri için `post/publish.requested` olayı üretir. `publish-post` fonksiyonu her platformu ayrı adımda yayınlar; bir platformun hatası diğerlerini engellemez. Çift gönderim, veritabanında atomik "claim" ile engellenir.
5. **Token yenileme:** X token'ı (2 saat) yayından hemen önce, Threads/LinkedIn günlük işle yenilenir.

Ayrıntılı mimari: [`docs/wiki/`](docs/wiki/Index.md).

## Belgeler

- [SECURITY.md](SECURITY.md) — açık bildirimi ve kapsam
- [PRIVACY.md](PRIVACY.md) — hangi veri işlenir, nereye gider, hesap silme
- [TERMS.md](TERMS.md) — kullanım şartları, platform kuralları, sorumluluk
- [CONTRIBUTING.md](CONTRIBUTING.md) — geliştirme akışı ve kalite kapıları
- [CHANGELOG.md](CHANGELOG.md) — sürüm notları

## Test

```bash
npm test        # vitest: birim + gerçek Postgres ile entegrasyon (DATABASE_URL gerekir)
npm run lint
npx tsc --noEmit
npm run build
```

Bu dördü her push'ta GitHub Actions'ta da çalışır (`.github/workflows/ci.yml`, Postgres servisiyle).

Platform çağrıları testlerde sahte `fetch` ile doğrulanır. Gerçek hesaplarla yayın, geliştiricinin kendi hesaplarında denenmiştir (bkz. `docs/wiki/Publishing.md`).

## Önemli notlar

- `prisma` CLI ve `@prisma/client` aynı sürüme sabit (7.10.1); `prisma@latest` şu an 8.0 RC.
- Medya adresleri yalnızca bu uygulamanın yüklemeleri ya da kendi Cloudinary hesabın olabilir (SSRF koruması, `lib/media.ts`).
- Yapay zekâ için yerel sunuculara (Ollama, LM Studio) bağlanmak `ALLOW_PRIVATE_LLM_URLS=1` ister ve yalnızca kendi bilgisayarında, dışarıya açık olmayan bir kurulumda açılmalıdır.
- Yönetim API'si (`/api/admin/*`) `ORVANE_ADMIN_TOKEN` (en az 32 karakter) tanımlı değilse kapalıdır.
- MCP belirteci verdiğin istemci, var olan bir taslağı `publish_now` ile **gerçekten yayınlayabilir**. Araç `confirm: true` olmadan çalışmaz ve metin parametresi almaz (yayınlanan metin taslaktaki metindir), ama yine de belirteci yalnız güvendiğin istemciye ver.
- Erişim/etkileşim metrikleri her platformun analitik API izni gerektirir; Analitik sayfası şimdilik yalnızca Orvane'in kendi yayın verilerini gösterir.

## Lisans

MIT. Ayrıntı için [LICENSE](LICENSE) dosyasına bakın.
