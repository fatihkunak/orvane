# Değişiklik Günlüğü

Bu dosya [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) biçimini izler; sürümleme [SemVer](https://semver.org/lang/tr/) benzeri ilerler (0.x: her an değişebilir).

## [Unreleased]

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

### Belgeler

- README sıfırdan kurulum için yeniden yazıldı (önkoşullar, adım adım kurulum, Google OAuth, platform başına notlar, güncelleme, güvenlik notları).
- `SECURITY.md`, `PRIVACY.md`, `TERMS.md`, `CONTRIBUTING.md` eklendi.
- Mimari wiki (`docs/wiki/`) her modül için tek kaynak; `map-nodes.mjs` node→kod eşlemesini üretir.
