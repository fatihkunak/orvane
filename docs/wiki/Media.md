# Media

- Yükleme: `app/api/upload/route.ts` (giriş şart). JPG/PNG/GIF ≤5 MB, MP4 ≤200 MB, ≤4 dosya. Bildirilen MIME'a ek olarak **dosya imzası** (`matchesSignature`) doğrulanır.
- Depolama: `CLOUDINARY_URL` varsa imzalı REST yükleme (`folder=synapse`); yoksa `.uploads/` (gitignore) + `app/api/media/[name]` (UUID adlı, `nosniff`). Yerel mod yalnız geliştirme içindir ve Threads'te çalışmaz.
- **SSRF beyaz listesi** (`lib/media.ts#isAllowedMediaUrl`): yalnız `/api/media/<uuid>.<ext>` veya KENDİ Cloudinary hesabın (`https://res.cloudinary.com/<cloud>/...`). Yayıncılar bu adresleri sunucuda indirdiği için serbest URL, iç ağ/metadata adreslerine istek demekti. Hem şemada hem `downloadMedia`'da zorlanır.
- `mediaKind`: `/video/upload/` veya `.mp4` → video.
