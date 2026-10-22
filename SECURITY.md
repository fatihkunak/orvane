# Güvenlik Politikası

Orvane, kullanıcıların sosyal medya hesaplarını yönettiği için güvenlik açıkları geri alınamaz sonuçlar doğurabilir (yanlış gönderi, token sızıntısı, üçüncü bir hesaba erişim). Bu yüzden bildirimleri ciddiye alıyoruz.

## Açık bildirme

**Genel bir issue açmayın.** GitHub'ın özel bildirim kanalını kullanın:

1. Deponun **Security → Report a vulnerability** (GitHub Private Vulnerability Reporting) düğmesi.
2. Mümkünse: etkilenen sürüm/commit, tekrar üretme adımları, beklenen ve gerçek davranış, varsa kavram kanıtı (PoC).

Yanıt hedefi: **72 saat içinde ilk dönüş**, düzeltme için makul bir süre (önem derecesine göre 1–30 gün). Düzeltme yayınlandıktan sonra isterseniz adınızı teşekkür listesine ekleriz.

Lütfen **gerçek kullanıcı verisiyle** test etmeyin; kendi kurulumunuzu veya kendi test hesaplarınızı kullanın.

## Kapsam

Kapsam içi:

- Kimlik doğrulama ve oturum yönetimi (`auth.ts`, `auth.config.ts`, `proxy.ts`)
- Platform token'larının saklanması/şifrelenmesi (`lib/crypto.ts`, `lib/social/*`)
- SSRF korumaları: kullanıcı kaynaklı adresler (`lib/ai/security.ts`) ve medya adresleri (`lib/media.ts`)
- MCP uç noktası ve belirteçleri (`app/api/mcp/route.ts`, `lib/api-tokens.ts`, `lib/mcp/server.ts`)
- Yayın hattında çift gönderim / yetkisiz yayın (`lib/publishing.ts`, Inngest fonksiyonları)
- Yönetim API'si (`/api/admin/*`) ve askıya alma
- Yetkilendirme hataları (başka kullanıcının gönderisine/taslağına erişim, IDOR)
- Yükleme doğrulamaları (tür/imza/boyut)

Kapsam dışı:

- **Kendi kurulumunuzun yanlış yapılandırılması**: `.env` içinde zayıf `AUTH_SECRET`/`TOKEN_ENCRYPTION_KEY`, `ALLOW_PRIVATE_LLM_URLS=1` ile dışarıya açık kurulum, `SHARED_X_APP=1` ile çok kullanıcılı kurulum, `ORVANE_UPDATE_ENABLED=1` ile güncelleme butonunun paylaşılan kurulumda açık bırakılması.
- Üçüncü taraf servislerin (Google, X, LinkedIn, Meta, Inngest, Cloudinary, AI sağlayıcıları) kendi açıkları.
- Platform API'lerinin oran limitleri veya politikaları.
- Bilinen ve yaması olmayan bağımlılık uyarıları: `npm audit` yalnız geliştirme ağacında (`shadcn → fast-glob → micromatch → braces`) uyarı verir; üretim ağacı temizdir ve şu an `braces` için yayınlanmış bir düzeltme yoktur.

## Tasarım gereği sınırlar (açık değil)

Bunlar hata değil, bilinçli kararlar:

- AI çıktısı **taslaktır**; kullanıcı "Kullan" demeden hiçbir yere yazılmaz.
- MCP `publish_now` yalnız **var olan bir taslağı**, `confirm: true` ile yayınlar; metin parametresi almaz (tek çağrıda üret+yayınla yok).
- Yayın iki kez gitmesin diye veritabanında atomik claim vardır; bu yarış koşullarını kapatır, kapatmadığı bir durum bulursanız bildirin.

## Sürüm desteği

Yalnız `main` dalının en son commit'i desteklenir. Eski sürümler için geriye dönük yama yayınlamıyoruz; `git pull` + migration ile güncelleyin (bkz. README → Güncelleme).

## Güvenli liman

İyi niyetli araştırma desteklenir: kendi kurulumunuzda, veri tahribatı ve hizmet kesintisi yaratmadan yaptığınız testler için yasal işlem başlatmayız.
