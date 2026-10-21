# DesignSystem

Tek (koyu) tema; `<html class="dark">` her zaman açık. Kaynak: `app/globals.css`. Marka adı tek yerden gelir: `lib/brand.ts` (`BRAND`).

## Palet (marka panosundan)

- Lacivert `#0E1B2B` (kart/yüzey), zemin `#09131F`, yan menü `#0B1724`, kenarlık `white/8%`
- Turkuaz `#00A896` (birincil, `brand-teal`), açık turkuaz `#5EC6C0` (linkler/vurgu, `brand-mist`), krem `#F5F4EF` (ön plan, `brand-cream`), grafit `#4A4A4A`
- `brand-ink` (`#0E1B2B`): turkuaz yüzey üstündeki yazı rengi. Beyaz/turkuaz kontrastı yetersiz olduğu için `text-white` kullanılmaz.
- `brand-orange` `#ffb072` yalnızca uyarı; durum renkleri anlamsal kalır (başarı zümrüt, hata kırmızı)
- Yardımcılar: `bg-brand-gradient` (turkuaz→açık turkuaz), `bg-brand-gradient-warm` (turkuaz→açık turkuaz→krem, "Planla" CTA), `card-surface`, `shadow-glow`
- Yazı tipi: Inter (`latin` + `latin-ext`, Türkçe karakterler için). Marka yazısı görseldir (aşağıda).
- Gradient yalnızca ikon/buton/yüzeylerde; metinde gradient yok (tasarım kararı)

Bkz. [[RootLayout]].

## Logo ve marka (Orvane)

- Marka adı **Orvane** (logoda küçük harf `orvane`). Önceki adlar: Synapse, PostForge (alınmış çıktı). Sembol: krem "O" + turkuaz ok.
- Varlıklar: `public/logo-mark.png` (şeffaf sembol), `public/logo-wordmark.png` (şeffaf krem yazı, 480x72), `public/logo-full.png` (lacivert zeminli yatay logo, README), `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` (lacivert kare üstünde sembol).
- Bileşenler: `components/layout/logo.tsx` (`LogoMark`, `Wordmark`, `Logo`). Kural: renk sembolde kalır, yazı kremdir, yazıda gradient YOK.
- Kaynak panodaki sembol küçük çözünürlükteydi (~150px); büyük baskı/store görseli gerekirse vektör veya yüksek çözünürlüklü dosya istenmeli.
- Panodaki slogan ("Daha fazlasını keşfet") başka bir ürüne (seyahat) ait göründüğü için kullanılmadı; uygulama sloganı `BRAND.tagline`.
