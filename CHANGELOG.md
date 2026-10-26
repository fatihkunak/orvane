# Değişiklik Günlüğü

Bu dosya [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler; sürümleme [SemVer](https://semver.org/lang/tr/) benzeri ilerler (0.x: her an değişebilir).

## [Unreleased]

### Eklenen

- **Başarısız gönderiyi yeniden dene / düzelt:** takvimde "Şimdi yeniden dene" ve "Yeni saatte dene"; kalem ikonuyla form açılır, metin düzeltilip yeniden gönderilir. Kısmen yayınlanmış gönderide yayınlanan platform kilitlidir ve ikinci kez GÖNDERİLMEZ, yalnız başarısız platformlar yeniden denenir. Başarısız gönderi artık taslağa çevrilemez.

### Düzeltilen

- **Takvim:** 500'den fazla tarihli gönderisi olan kullanıcıda yaklaşan gönderiler listeden düşüyordu.
- **Düzenleme formu:** zamanlanmış gönderi açılınca saat "şimdi + 1 saat"e kayıyordu; artık gönderinin kendi saatiyle açılır.
- **404:** başarısız gönderinin bildirimi ve takvim satırındaki kalem, düzenlenemeyen gönderiye götürüyordu. Bildirim takvime gider, kalem yalnız taslak ve zamanlanmış gönderide görünür.
- **Yayın hattı:** geçici token yenileme hatası (ağ, 5xx, 429) gönderiyi kalıcı FAILED yapıyordu, artık yeniden denenir. Düz metin token Inngest adım çıktısına yazılmıyor.
- **X karakter sayımı:** URL 23, emoji ve CJK 2 sayılır (twitter-text ağırlıkları).

### Güvenlik

- X token yenileme yarışı kapandı: yenileme hesap başına Postgres advisory lock ile serileştirilir; eşzamanlı işler tek kullanımlık refresh token'ı iki kez göndermez, kaybeden iş artık yanlışlıkla "hesabı yeniden bağla" hatası almaz. OAuth çağrılarına 15 sn zaman aşımı.
- Medya indirme ve yapay zekâ sağlayıcı isteklerinde yönlendirme takibi kapatıldı (SSRF, `x-api-key` sızıntısı).
- Sağlayıcı yanıt gövdesine boyut sınırı; eksik özel IP aralıkları (`198.18.0.0/15`, `192.0.0.0/24`, çok noktaya yayın, `fec0::/10`, NAT64) eklendi.
- DNS rebinding kapandı: yapay zekâ sağlayıcı çağrıları bağlantı anında çözülen adresi doğrulayan `guardedFetch` ile yapılır (yeni açık bağımlılık: `undici`).
- `/api/mcp`: biçimi bozuk token'lar veritabanına hiç gitmez; çok başarısız deneme yapan istemci (10 dk'da 30) sorgudan önce 429 alır. Geçerli kullanım etkilenmez.
- Kullanıcı metni prompt etiketlerini (`</brief>`, `</text>`, `<task>`, `<rules>`) kapatıp talimat enjekte edemez.
- Yönetim API'sinin başarısız-deneme sınırı sahte `X-Forwarded-For` ile atlatılamaz; hız sınırlayıcı bellek sızıntısı kapandı.
- Yükleme: `Content-Length` izin verilen en büyük dosyayı aşıyorsa gövde belleğe alınmadan 413; başlık yoksa (chunked) ya da yalansa gövde akarken sayılır ve sınırı geçince kesilir.

## [0.1.0] — 2026-10-22

İlk sürüm: tek içerik, üç platform (X, LinkedIn, Threads).

### Eklenen

- **Gönderi formu:** platform başına karakter sınırı ve canlı önizleme, en fazla 4 medya, platform başına **ayrı metin ve ayrı görsel**, taslak / zamanla / şimdi yayınla.
- **Taslaklar:** `/drafts`; form, yapay zekâ ve MCP'den gelen tüm taslaklar burada. Taslak ve **ileri tarihli** zamanlanmış gönderi aynı formdan düzenlenebilir.
- **Takvim:** haftalık/aylık görünüm, platform filtresi, seçili gün listesi, **gerçek küçük resimler**, listeden **hızlı saat değiştirme**.
- **Yayın hattı:** Inngest cron + olay fan-out; platform başına ayrı adım, atomik claim ile çift gönderim engeli, hata sınıflandırma, token yenileme (X 2 saat, Threads/LinkedIn günlük).
- **Yapay zekâ (metin):** 19 sağlayıcılı BYOK kaydı, yedek zinciri ve model yedeği, "sıfırdan yaz" ve "mevcut metni iyileştir", platform başına ayrı metin, karakter sınırına göre onarım.
- **Yapay zekâ (görsel):** AI panelinde "Görsel üret"; OpenAI-uyumlu `/images/generations` (Gemini, OpenAI, Together), yalnız base64 kabulü (SSRF yok), üretilen görsel gönderi medyası olarak kaydedilir.
- **MCP:** kişisel belirteçle taslak okuma/yazma, **`schedule_post`** (ileri tarih) ve **`publish_now`** (yalnız var olan taslak, `confirm: true`, tek çağrıda üret+yayınla yok).
- **Bildirim zili ve profil menüsü:** başarısız yayınlar + önümüzdeki 24 saat; hesap, ayarlar, çıkış.
- **Tek tıkla güncelleme:** `/settings` → sürüm karşılaştırma ve `deploy/update.cmd` (git pull → npm ci → migrate → build → restart); sahip e-postasıyla sınırlı, varsayılan kapalı.
- **Hesap silme:** `/settings` → hesabımı sil; kullanıcıya bağlı tüm satırlar ve yerel medya dosyaları silinir.
- **Yönetim API'si:** `/api/admin/*` (belirteçli), kullanıcı listesi/detayı, askıya alma (askıdakiler giriş yapamaz, belirteç kullanamaz, gönderisi yayınlanmaz).
- **CI:** her push/PR'da tsc, eslint, gerçek Postgres ile test, üretim derlemesi.

### Güvenlik

- Platform OAuth token'ları ve BYOK anahtarları **AES-256-GCM** ile şifreli; tarayıcıya ve günlüklere geri dönmez.
- MCP belirteçleri yalnız **SHA-256 özetiyle** saklanır, oluşturulurken bir kez gösterilir.
- Medya adresleri beyaz liste ile sınırlı (`/api/media/<uuid>` ya da kendi Cloudinary hesabı) — SSRF koruması; yüklemelerde **magic-byte** doğrulaması.
- Kullanıcı kaynaklı AI adresleri SSRF denetiminden geçer; yerel adresler yalnız `ALLOW_PRIVATE_LLM_URLS=1` ile.
- Yönetim API'si `ORVANE_ADMIN_TOKEN` (≥32 karakter, sabit zamanlı karşılaştırma) olmadan kapalı.
- `shadcn` geliştirme bağımlılığına taşındı: üretim ağacında yaması olmayan `braces` uyarısı kalmadı.
- Silinen gönderinin/hesabın medyası temizlenir: yerel dosyalar yalnız referans kalmadıysa silinir, Cloudinary nesneleri imzalı Admin API ile kaldırılır (yabancı bulut reddedilir).
- Güncelleme öncesi otomatik **veritabanı yedeği** (`pg_dump`, gerekirse Docker konteyneri üzerinden), son 5 dump saklanır.

### Operasyon

- `GET /api/health`: süreç + veritabanı hazırlığı (yeniden başlatma sonrası güncelleme kartı bunu bekler).
- Tek tıkla güncelleme Windows ve Linux/macOS'ta (`deploy/update.cmd` / `deploy/update.sh`), öncesinde otomatik veritabanı yedeği.
- Log rotasyonu: güncelleme sırasında uygulama durdurulduktan sonra `app.log`/`inngest.log` 5 MB'ı geçtiyse döndürülür (son 2 kopya).
- Güvenlik başlıkları (`next.config.ts`): `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, **CSP report-only**.
- Tarayıcı testleri (Playwright) CI'da: giriş sayfası, kendi 404'ümüz, girişe yönlendirme, güvenlik başlıkları, health.
- Yükleme hız sınırı: kullanıcı başına 10 dakikada 40 dosya.
- Özel `error.tsx` / `not-found.tsx`: hata ve 404 ekranları Türkçe, kayıt koduyla.

### Belgeler

- README sıfırdan kurulum için yeniden yazıldı (önkoşullar, adım adım kurulum, Google OAuth, platform başına notlar, güncelleme, güvenlik notları).
- `SECURITY.md`, `PRIVACY.md`, `TERMS.md`, `CONTRIBUTING.md` eklendi.
- Mimari wiki (`docs/wiki/`) her modül için tek kaynak; `map-nodes.mjs` node→kod eşlemesini üretir.
