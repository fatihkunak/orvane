# Dashboard

`app/(dashboard)/dashboard/page.tsx` (server; `auth()` + Prisma sorguları) + `components/dashboard/upcoming-posts.tsx` (client).

- 3 gerçek sayaç (`postCounts`): Toplam, Planlanan, Yayınlanan; başarısız gönderi varsa takvime giden uyarı.
- Taslak varsa "N taslak seni bekliyor" kartı `/drafts`'a götürür.
- Mobilde selamlama + "Yeni İçerik Oluştur" (masaüstünde sidebar'da) + Analitik linki (mobil bar'da Analitik yok, buradan erişilir).
- "Yaklaşan Yayınlar": tarayıcı saatinden sonraki ilk 3 `SCHEDULED` gönderi; "Tümünü Gör" → `/calendar`. Tarih tarayıcıya bağlı, ilk render iskelet ([[Hydration]]).
- Satır bileşeni `components/posts/post-row.tsx` (client): durum rozeti `STATUS_META`, başarısız gönderide hata metni, silme düğmesi (`deletePostAction`).

Bkz. [[Layout]], [[Calendar]], [[Posts]].
