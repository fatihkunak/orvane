# DesignSystem

Tek (koyu) tema; `<html class="dark">` her zaman açık. Kaynak: `app/globals.css`.

- Zemin `#0b0f19`, kart `#111726`, kenarlık `white/8%`
- Marka: mor `#7c5cff`, mavi `#4f8cff`, pembe `#f0479a`, turuncu `#ffb072`
- Yardımcılar: `bg-brand-gradient` (mor→mavi), `bg-brand-gradient-warm` (mavi→pembe), `card-surface`, `shadow-glow`
- Yazı tipi: Inter (`latin` + `latin-ext`, Türkçe karakterler için)
- Gradient yalnızca ikon/buton/yüzeylerde; metinde gradient yok (tasarım kararı)

Bkz. [[RootLayout]].

## Logo ve marka (PostForge)

- Marka adı **PostForge** (eski ad Synapse). Logo: mor→mavi→nane yeşili gradyanlı "P" sembolü + "PostForge" yazısı.
- Varlıklar: `public/logo-mark.png` (şeffaf sembol, UI'da `LogoMark`/`Logo` bileşenleri), `public/logo-full.png` (sembol + yazı, tam logo), `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` (koyu zeminli kare).
- Kural: renk sembolde kalır, yazıda gradient YOK (yazı beyaz). Bileşen: `components/layout/logo.tsx`.
