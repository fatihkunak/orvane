# Layout

`app/(dashboard)/layout.tsx` — oturum yoksa `/login`'e yönlendirir (asıl koruma; proxy DB okuyamaz), sonra kabuğu çizer.

- `components/layout/nav-items.ts` — TEK nav kaynağı (Ana Sayfa, Takvim, Taslaklar, Analitik, Hesaplar, Ayarlar) + `NEW_POST_HREF=/posts/new`, `titleForPath`, `isActive`.
- `sidebar.tsx` — `lg+`: logo, "Yeni İçerik Oluştur" (gradient), menü. Aktif öğe `aria-current`.
- `mobile-nav.tsx` — `< lg` alt bar: Ana Sayfa, Takvim, ortada yuvarlak +, Hesaplar, Ayarlar. **Analitik ve Taslaklar bar'da YOK** (tasarım tahtasındaki 4 sekme) → mobilde Dashboard'dan link verilmeli (Adım 4).
- `topbar.tsx` — `/dashboard`'da "Merhaba, {ad}", diğerlerinde sayfa başlığı; **bildirim zili** (başarısız yayınlar + önümüzdeki 24 saatte çıkacak gönderiler; kırmızı nokta yalnız başarısız yayında) ve **profil menüsü** (ad/e-posta, Profil ve ayarlar, Yapay zekâ, MCP, Çıkış). Bildirim verisi `lib/queries/notifications.ts`'ten layout'ta hesaplanır (okundu/okunmadı tablosu yok: her satır eyleme dönük).
  - **Base UI kuralları (2026-10-30):** `DropdownMenuLabel` (= `Menu.GroupLabel`) MUTLAKA `DropdownMenuGroup` içinde olmalı, yoksa menü açılınca "MenuGroupContext is missing" fırlatır ve sayfa hata ekranına düşer. `render={<button/>}` kullanan öğe `nativeButton` almalı.
  - **Tünel önbelleği (açık):** Cloudflare, dev chunk'larının `no-cache` başlığını 4 saatlik tarayıcı TTL'ine çeviriyor; kod/güncelleme sonrası tarayıcı eski JS çalıştırabilir (Ctrl+F5 çözer). Uygulamada `no-store` vermek `next dev`'i yeniden yükleme döngüsüne soktu, geri alındı. Kalıcı çözüm Cloudflare'de: `orvane-dev` için Cache Rule → Browser TTL "Respect origin".
- `placeholder.tsx` — Adım 4-6'da doldurulacak sayfaların geçici gövdesi.
- Rotalar: `/dashboard /calendar /analytics /accounts /settings /posts/new /drafts` (hepsi `auth.config.ts` PROTECTED_PREFIXES'te, `/posts` dahil).

Bkz. [[Auth]], [[DesignSystem]].
