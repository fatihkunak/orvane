# Posts

- Form: `components/posts/create-post-form.tsx` (client) + `components/platform/platform-selector.tsx`. Bağlı olmayan platform "Hesabı bağla →" linkidir. Seçim `setPlatforms(prev => ...)` ile yapılır (hızlı ardışık tıklamada eski değer tuzağı).
- Zamanlama: tarayıcının yerel `date`+`time` girdisi → `new Date(...).toISOString()` (UTC) → sunucu. Veritabanı UTC saklar.
- Doğrulama: `lib/validation/post.ts` (zod): boş metin, ≥1 platform, platform karakter sınırı (`lib/char-count.ts`: Threads emoji=UTF-8 bayt, X yaklaşık), ≤4 medya, geçmiş zaman yok, **medya adresi beyaz listesi** ([[Media]]).
- Sunucu eylemleri `server/actions/posts.ts`: `createPostAction` (platform başına bağlı hesap şart; `now` modunda Inngest olayı gönderir, başarısız olursa cron zaten alır), `deletePostAction` (yalnız sahibi, yayınlanmamış).
- Okuma: `lib/queries/posts.ts` → `PostDTO` (ISO string) → client `hydratePost`. Takvim ve dashboard artık GERÇEK veri; mock yok. Taslaklar tarihsiz olduğu için takvimde görünmez, dashboard sayısına girer.

- **AI ile yaz:** Metin alanının üstündeki panel taslak üretir ([[AiGeneration]]); "Kullan" metni doldurur, yayın yine kullanıcının onayıyla.

Bkz. [[Calendar]], [[Dashboard]], [[Publishing]], [[AiGeneration]].
