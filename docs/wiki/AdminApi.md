# AdminApi

fatihgo admin paneli (Cloudflare Pages Function) Orvane kullanıcılarını bu uçlardan yönetir. Kullanıcı oturumu DEĞİL, sunucudan sunucuya **servis belirteci**: `ORVANE_ADMIN_TOKEN` (en az 32 karakter; yoksa/kısaysa uçlar 503, yani kazara açık kalamaz).

- **Koruma:** `lib/admin-api.ts` `adminGuard`. `Authorization: Bearer`; iki tarafın SHA-256 özeti `timingSafeEqual` ile karşılaştırılır. Yanlış denemeler istemci (`cf-connecting-ip`) başına 10 dk'da 10 ile sınırlı (429); yalnız başarısızlar sayılır.
- **Uçlar:** `GET /api/admin/users?q=&page=` (25'erli, e-posta/ad arama, gönderi sayıları, bağlı platformlar) · `GET /api/admin/users/:id` (hesaplar, AI sağlayıcı ADLARI, belirteç adları/önekleri, son 10 gönderi) · `POST /api/admin/users/:id/suspend` `{suspended}` · `GET /api/admin/stats`. Mantık `lib/admin-users.ts`.
- **Sır dönmez:** OAuth token'ları, AI anahtarları, belirteç özetleri ve belirteçlerin kendisi yanıtta yok (test bunu doğrular).
- **Askıya alma (`User.suspendedAt`):** giriş engellenir (`signIn` callback), `auth()` askıdakini oturumsuz sayar (JWT'yi proxy okuyamadığı için her çağrıda DB kontrolü; sayfa kabuğu `authState` ile `/suspended`'a yollar, `/login` döngüsüne düşmez), MCP belirteçleri geçmez, zamanlayıcı/yayın askıdakinin gönderilerini ATLAR (`findDuePostIds`, `loadPublishJob`). Askıya alınırken `SCHEDULED` gönderiler `DRAFT`'a döner: yoksa hesap geri açılınca gecikmiş hepsi birden yayınlanırdı.
- **Bilinçli olarak YOK:** kullanıcı silme (geri alınamaz; gerekirse ayrı onaylı eylem).
- **Erişilebilirlik:** Orvane yerelde çalışır, panel tünelle ([[Auth]]) ulaşır; bilgisayar/tünel kapalıysa panel "Orvane'e ulaşılamıyor" gösterir.

Bkz. [[Mcp]], [[Auth]], [[Publishing]]. Panel tarafı: fatihgo `docs/wiki/AdminPanel.md`.
