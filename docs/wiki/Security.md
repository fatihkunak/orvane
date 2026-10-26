# Security

Güvenlik kararları tek yerde: başlıklar, hız sınırları, sırlar ve raporlama. Ayrıntılı açık bildirim süreci kökteki [SECURITY.md](../../SECURITY.md)'de.

- **Güvenlik başlıkları** (`next.config.ts`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (kamera/mikrofon/konum/ödeme kapalı).
- **CSP bilinçli olarak REPORT-ONLY**: `Content-Security-Policy-Report-Only` gönderilir, hiçbir şeyi engellemez. Gerekçe: Next inline bootstrap script basıyor; zorlayıcı (enforcing) bir politika istek başına **nonce** gerektirir ve nonce'suz politika ya uygulamayı kırar ya da gevşek olduğu için tiyatrodur. Politikayı zorlamaya geçirmek için: `proxy.ts`'te nonce üret → `Content-Security-Policy` başlığına ekle (Next nonce'u script'lerine kendisi uygular) → `'unsafe-inline'`/`'unsafe-eval'` kaldır → konsolda ihlal kalmadığını doğrula.
- **Hız sınırları** (`lib/ai/rate-limit.ts`, süreç içi kayan pencere, kullanıcı başına):

| Yol | Sınır |
|---|---|
| `/api/mcp` | 120 istek / dk (belirteç başına) |
| AI metin üretimi | 20 / 10 dk |
| AI görsel üretimi | 10 / 10 dk |
| Sağlayıcı sınaması / model listesi | 30 / 10 dk |
| Dosya yükleme | 40 / 10 dk |
| Güncelleme başlatma | 3 / 10 dk |

- **Sırlar:** platform ve BYOK anahtarları AES-256-GCM ile şifreli (`TOKEN_ENCRYPTION_KEY`), tarayıcıya ve günlüklere dönmez; MCP belirteci yalnız SHA-256 özetiyle saklanır; `redact()` sağlayıcı hata gövdesinden anahtarı siler. Dev sunucusu Server Function argümanlarını basmasın diye `logging.serverFunctions: false`.
- **SSRF:** kullanıcı kaynaklı AI adresleri `assertSafeBaseUrl` (yalnız genel https; `ALLOW_PRIVATE_LLM_URLS=1` istisnası), medya adresleri `isAllowedMediaUrl` (yalnız kendi `/api/media/<uuid>` ya da kendi Cloudinary bulutu). Görsel üretiminde sağlayıcının döndürdüğü **URL kabul edilmez**, yalnız base64.
- **Yetkilendirme:** her `/api/*` rotası kendi kapısını taşır — `auth()` (upload), `verifyApiToken` (mcp), `adminGuard` (admin), `auth()` (connect/callback). `/api/health` bilinçli olarak genel ve sır döndürmez. Sayfa koruması `proxy.ts` + layout'taki gerçek oturum kontrolü.
- **Yükleme doğrulaması:** MIME + **magic bytes**, tür/boyut sınırları, UUID dosya adı, `nosniff` ile servis.
- **Yıkıcı işlemler:** hesap silme e-postayla onaylanır (istemci + sunucu), güncelleme sahip e-postasıyla sınırlı, MCP `publish_now` `confirm: true` olmadan çalışmaz.
- **Bağımlılıklar:** `npm audit --omit=dev` temiz. Geliştirme ağacındaki `braces` uyarısı yamasız (npm'de yeni sürüm yok) ve yalnız `shadcn` CLI'den geliyor; üretim ağacına girmez.
- **Sertleştirme turu (2026-10-26):** dış çağrılarda (`downloadMedia`, `lib/ai/client.ts`, `lib/ai/image.ts`) yönlendirme takip edilmez (`redirect: manual|error`; 3xx kalıcı hata) — izinli adres iç adrese sıçratamaz, `x-api-key` yönlendirmeyle sızmaz. Sağlayıcı yanıt gövdesi `readCapped` ile sınırlı. `fence()` kullanıcı metninin prompt etiketlerini kapatmasını önler. `adminGuard` istemci adresinden bağımsız genel bir başarısız-deneme kovasına sahip (10 dk'da 100); `takeToken` süresi dolan anahtarları siler ve 20.000 anahtarla sınırlıdır. Upload `Content-Length` ön kontrolü yapar ve başlıksız/yalan başlıklı gövdeyi akarken sayıp keser (`readFormCapped`). Inngest adım çıktısına token yazılmaz.
- **DNS rebinding kapalı (2026-10-26):** `assertSafeBaseUrl` adı yalnız kaydederken/kullanırken bir kez çözer; bağlanırken ad başka bir (iç) adrese çözülebilirdi. Sağlayıcı çağrıları artık `lib/ai/safe-fetch.ts#guardedFetch` üzerinden gider: undici `Agent`'ının `connect.lookup`'ı bağlantının kendi DNS cevabını doğrular (herhangi bir adres özelse bağlanmaz), yani kontrol edilen adres ile bağlanılan adres aynıdır. undici'nin KENDİ `fetch`'i + `Agent`'ı kullanılır (Node'un gömülü undici'si 6.x; sürümler arası dispatcher karışımı desteklenmez), `undici` açık bağımlılık. `ALLOW_PRIVATE_LLM_URLS=1` ise düz `fetch` (yerel Ollama). Not: yönlendirme zaten kapalı (`redirect: error`); IP literal adresler `assertSafeBaseUrl`'de kontrol edilir (soket çözümleme yapmaz).
- **MCP'ye kimliksiz yük (2026-10-26):** `/api/mcp` token'ı sorgulamadan ÖNCE iki kapıdan geçirir: (1) biçim (`looksLikeToken`: `orv_` + 43 base64url karakter) tutmayan sunucuya/DB'ye hiç gitmez; (2) istemci başına (`cf-connecting-ip` → `x-forwarded-for`) 10 dakikada 30 BAŞARISIZ denemeden sonra `429`, sorgu yapılmaz (`isLimited`, sayıcıyı tüketmez; yalnız başarısızlıklar sayılır, geçerli kullanım hiç sınırlanmaz). Sınır: aynı IP'yi paylaşan biri 30 kez yanlış token denerse o IP'nin geçerli token'ları da 10 dk bloklanır (NAT yan etkisi, bilinçli). Adres başlığı doğrudan erişimde sahte olabilir; Cloudflare tüneli arkasında `cf-connecting-ip` sahtelenemez.
- **Bilinen açık sınırlar:** hız sınırlayıcı süreç içi (tek instance varsayımı).

Bkz. [[Auth]], [[Media]], [[Mcp]], [[Settings]], [[Tests]].
