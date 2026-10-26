# Calendar

`components/calendar/calendar-view.tsx` (client) + `app/(dashboard)/calendar/page.tsx` (server, `listDatedPosts`).

- Haftalık (Pzt başlangıç) / Aylık görünüm, önceki-sonraki-Bugün, platform filtresi (Tümü/Threads/LinkedIn/X).
- Haftalık: mobilde gün şeridi + seçili gün listesi, `md+`'da 7 sütun. Aylık: hücreler (mobilde nokta, `md+`'da ilk 2 gönderi + "+n daha"), altta seçili gün listesi.
- `CalendarView` önce `useToday()` bekler (iskelet), sonra `CalendarInner` state'i `today` ile başlatır ([[Hydration]]).
- Veri GERÇEK: `PostDTO[]` → `hydratePost`. Taslaklar (tarihsiz) görünmez. Başarısız gönderi "Hata" rozeti + platform hata metniyle listelenir; silinebilir, düzenlenebilir, "Şimdi yeniden dene" / "Yeni saatte dene" ile yeniden gönderilir (yalnız başarısız platformlar, [[Posts]]).

Bkz. [[Dashboard]], [[Platforms]], [[Posts]].
