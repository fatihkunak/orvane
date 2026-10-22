# Media

- Yükleme: `app/api/upload/route.ts` (giriş şart). JPG/PNG/GIF ≤5 MB, MP4 ≤200 MB, ≤4 dosya. Bildirilen MIME'a ek olarak **dosya imzası** (`matchesSignature`) doğrulanır.
- Depolama: `CLOUDINARY_URL` varsa imzalı REST yükleme (`folder=orvane`); yoksa `.uploads/` (gitignore) + `app/api/media/[name]` (UUID adlı, `nosniff`). Yerel mod yalnız geliştirme içindir ve Threads'te çalışmaz.
- **SSRF beyaz listesi** (`lib/media.ts#isAllowedMediaUrl`): yalnız `/api/media/<uuid>.<ext>` veya KENDİ Cloudinary hesabın (`https://res.cloudinary.com/<cloud>/...`). Yayıncılar bu adresleri sunucuda indirdiği için serbest URL, iç ağ/metadata adreslerine istek demekti. Hem şemada hem `downloadMedia`'da zorlanır.
- `mediaKind`: `/video/upload/` veya `.mp4` → video.
- **Tek depolama yolu (2026-10-22):** doğrulama + yazma `lib/media-store.ts#storeMediaBytes` içinde. Hem `app/api/upload/route.ts` (kişi dosya seçer) hem AI görsel üretimi (`lib/ai/image-service.ts`) buradan geçer; böylece üretilen görsel de aynı tür/imza/boyut kurallarına uyar ve `isAllowedMediaUrl`'in kabul ettiği bir adres üretir. Cloudinary varsa imzalı yükleme, yoksa `.uploads/` + `/api/media/<uuid>`.
- **Yerel dosya temizliği (2026-10-22):** `lib/media-cleanup.ts`. Bir dosya yalnız **hiçbir gönderi/platform satırı onu göstermiyorsa** silinir (iki gönderi aynı yüklemeyi paylaşabilir).
  - Gönderi silme (`deletePostAction`) satırları sildikten sonra artık kimsenin göstermediği dosyaları kaldırır.
  - Hesap silme (`lib/account.ts`) aynı kontrolü kullanır.
  - Günlük Inngest işi `cleanup-orphan-media` (04:30) yalnız **24 saatten eski** ve referanssız dosyaları süpürür — formu açık bırakılmış, henüz kaydedilmemiş bir yükleme silinmesin. Yalnız `/api/media/<uuid>.<ext>` kalıbındaki adlar "bizim" sayılır; yabancı dosyalara dokunulmaz.
  - Cloudinary nesneleri burada da silinmez (destroy API'si çağrılmıyor, bkz. `PRIVACY.md`).
