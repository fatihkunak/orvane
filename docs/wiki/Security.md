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
- **Sertleştirme turu (2026-10-26):** dış çağrılarda (`downloadMedia`, `lib/ai/client.ts`, `lib/ai/image.ts`) yönlendirme takip edilmez (`redirect: manual|error`; 3xx kalıcı hata) — izinli adres iç adrese sıçratamaz, `x-api-key` yönlendirmeyle sızmaz. Sağlayıcı yanıt gövdesi `readCapped` ile sınırlı. `fence()` kullanıcı metninin prompt etiketlerini kapatmasını önler. `adminGuard` istemci adresinden bağımsız genel bir başarısız-deneme kovasına sahip (10 dk'da 100); `takeToken` süresi dolan anahtarları siler ve 20.000 anahtarla sınırlıdır. Upload `Content-Length` ön kontrolü yapar. Inngest adım çıktısına token yazılmaz.
- **Bilinen açık sınırlar:** chunked (Content-Length'siz) upload gövdesi hâlâ tamponlanır; DNS rebinding `assertSafeBaseUrl` ile kapanmaz (IP sabitleme gerekir); `/api/mcp` geçersiz belirteç istekleri hız sınırına girmez (256 bit belirteç, yalnız DB yükü); X token yenileme yarışı kilitsiz; hız sınırlayıcı süreç içi (tek instance varsayımı).

Bkz. [[Auth]], [[Media]], [[Mcp]], [[Settings]], [[Tests]].
