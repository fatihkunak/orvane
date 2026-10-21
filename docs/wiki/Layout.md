# Layout

`app/(dashboard)/layout.tsx` — oturum yoksa `/login`'e yönlendirir (asıl koruma; proxy DB okuyamaz), sonra kabuğu çizer.

- `components/layout/nav-items.ts` — TEK nav kaynağı (Ana Sayfa, Takvim, Analitik, Hesaplar, Ayarlar) + `NEW_POST_HREF=/posts/new`, `titleForPath`, `isActive`.
- `sidebar.tsx` — `lg+`: logo, "Yeni İçerik Oluştur" (gradient), menü. Aktif öğe `aria-current`.
- `mobile-nav.tsx` — `< lg` alt bar: Ana Sayfa, Takvim, ortada yuvarlak +, Hesaplar, Ayarlar. **Analitik bar'da YOK** (tasarım tahtasındaki 4 sekme) → mobilde Dashboard'dan link verilmeli (Adım 4).
- `topbar.tsx` — `/dashboard`'da "Merhaba, {ad}", diğerlerinde sayfa başlığı; bildirim, çıkış (server action prop), avatar.
- `placeholder.tsx` — Adım 4-6'da doldurulacak sayfaların geçici gövdesi.
- Rotalar: `/dashboard /calendar /analytics /accounts /settings /posts/new` (hepsi `auth.config.ts` PROTECTED_PREFIXES'te, `/posts` dahil).

Bkz. [[Auth]], [[DesignSystem]].
