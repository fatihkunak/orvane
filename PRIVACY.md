# Gizlilik Politikası

> **Önemli:** Orvane herkese açık bir hizmet değildir; kendi sunucunuzda çalıştırdığınız bir uygulamadır. **Veri sorumlusu, uygulamayı çalıştıran kişidir** (kurulum sahibi). Bu belge, uygulamanın hangi veriyi işlediğini ve nereye gönderdiğini açıklar; kurulum sahibi kendi politikasını yayınlamakla yükümlüdür.

Son güncelleme: 2026-10-22

## Hangi veriler işlenir

| Veri | Neden | Nerede saklanır |
|---|---|---|
| Google hesabınızın adı, e-posta adresi, profil resmi adresi | Giriş ve oturum | Uygulama veritabanı (`User`, `Account`) |
| Platform hesaplarınızın kullanıcı adı ve **OAuth token'ları** | Sizin adınıza gönderi yayınlamak | Veritabanı; token'lar **AES-256-GCM ile şifreli** (`TOKEN_ENCRYPTION_KEY`) |
| Gönderi metinleri, zamanlamaları, durumları | Planlama ve yayın | Veritabanı |
| Yüklediğiniz veya ürettiğiniz görsel/video | Gönderiye eklenmesi | Cloudinary yapılandırıldıysa orada; yoksa sunucudaki `.uploads/` klasöründe |
| Yapay zekâ sağlayıcı anahtarlarınız (BYOK) | Sizin adınıza metin/görsel üretmek | Veritabanı; **şifreli**, tarayıcıya geri gönderilmez |
| MCP belirteçleri | Yerel modellerin/istemcilerin bağlanması | Veritabanı; yalnız **SHA-256 özeti** (belirtecin kendisi saklanmaz) |
| Uygulama günlükleri | Hata ayıklama | Sunucuda `deploy/logs/` (istemler ve token'lar günlüğe yazılmaz) |

Çerezler: yalnızca zorunlu olanlar kullanılır — Auth.js oturum çerezi (httpOnly) ve OAuth akışı sırasında `state`/PKCE çerezi (httpOnly). Analitik veya reklam çerezi yoktur.

## Veri nereye gönderilir (üçüncü taraflar)

Gönderi yayınlamak ve yapay zekâ özellikleri doğası gereği dışarıya veri çıkarır:

- **Google** — yalnız giriş (OAuth).
- **X / LinkedIn / Threads** — yalnız o platformu hedefleyen gönderinin metni ve medyası, yayın anında. Token'lar platformun kendi API'sine gider.
- **Seçtiğiniz yapay zekâ sağlayıcısı** (Gemini, OpenAI, Groq, yerel Ollama/LM Studio vb.) — yazdığınız istem ve iyileştirilecek metin. Görsel üretiminde istem ve dönen görsel.
- **Inngest** — yalnız iş kimliği ve gönderi kimliği (metin gönderilmez). Yerel Inngest Dev Server kullanıyorsanız veri makinenizden çıkmaz.
- **Cloudinary** (yalnız yapılandırıldıysa) — yüklediğiniz/ürettiğiniz medya.
- **GitHub** (yalnız güncelleme kartını kullanırsanız) — depo commit listesi sorgulanır; size ait bir veri gönderilmez.

Bu servislerin kendi gizlilik politikaları geçerlidir. Yerel modeller (Ollama, LM Studio) dışarıya veri göndermez.

## Saklama süresi

Veriler, siz silene kadar saklanır. Bir gönderiyi silmek satırını siler; hesabınızı silmek (aşağıya bakın) tüm kayıtlarınızı kaldırır. Sunucu yedekleri varsa, yedeklerin döngüsü kurulum sahibine bağlıdır.

## Hesabınızı ve verilerinizi silme

**Ayarlar → Hesabımı sil** ile hesabınızı kalıcı olarak silebilirsiniz:

- Kullanıcı kaydı, bağlı platform hesapları ve token'lar, gönderiler, medya kayıtları, yapay zekâ sağlayıcı ayarları ve MCP belirteçleri **silinir** (veritabanında `ON DELETE CASCADE`).
- Sunucudaki yerel medya dosyalarınız (`.uploads/`) diskten kaldırılır.
- **Cloudinary** yapılandırıldıysa, yalnızca sizin gönderilerinizin kullandığı görseller **silinmeye çalışılır** (imzalı Admin API `destroy`). Cloudinary anahtarınıza silme yetkisi verilmemişse ya da istek başarısız olursa dosya orada kalır; o durumda Cloudinary panelinizden silin.
- Platformlarda **yayınlanmış** gönderiler silinmez — onları ilgili platformdan silmelisiniz.
- İşlem geri alınamaz. Yeniden kullanmak istersen aynı Google hesabıyla yeniden giriş yapıp yeni bir hesap oluşturursun (eski veriler geri gelmez).

## Haklarınız

Kurulum sahibi olarak siz, kullanıcı olarak da sizin adınıza veri işleyen kişi şu haklara sahiptir: verilerinize erişme (uygulama ekranları), düzeltme (ayarlar/formlar), silme (yukarıdaki akış) ve itiraz. Uygulama verilerinizi dışa aktarma (export) özelliği **yoktur**; ihtiyaç varsa veritabanından `User` kimliğinize bağlı satırları alabilirsiniz.

## Çocuklar

Uygulama 13 yaş altındaki kişilere yönelik değildir; platformların kendi yaş kuralları ayrıca geçerlidir.

## Değişiklikler

Bu belge depoda yaşar; değişiklikler commit geçmişinde görülür. Kendi kurulumunuzu işletiyorsanız bu metni kendi koşullarınıza göre uyarlamak sizin sorumluluğunuzdadır.
