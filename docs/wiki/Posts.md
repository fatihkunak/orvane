# Posts

- Form: `components/posts/create-post-form.tsx` (client) + `components/platform/platform-selector.tsx`. Bağlı olmayan platform "Hesabı bağla →" linkidir. Seçim `setPlatforms(prev => ...)` ile yapılır (hızlı ardışık tıklamada eski değer tuzağı).
- Zamanlama: tarayıcının yerel `date`+`time` girdisi → `new Date(...).toISOString()` (UTC) → sunucu. Veritabanı UTC saklar.
- Doğrulama: `lib/validation/post.ts` (zod): boş metin, ≥1 platform, platform karakter sınırı (`lib/char-count.ts`: Threads emoji=UTF-8 bayt, X yaklaşık), ≤4 medya, geçmiş zaman yok, **medya adresi beyaz listesi** ([[Media]]).
- Oluşturma mantığı `lib/post-create.ts` `createPostForUser` (form eylemi VE [[Mcp]] ortak kullanır). Sunucu eylemleri `server/actions/posts.ts`: `createPostAction` (platform başına bağlı hesap şart; `now` modunda Inngest olayı gönderir, başarısız olursa cron zaten alır), `deletePostAction` (yalnız sahibi, yayınlanmamış).
- Okuma: `lib/queries/posts.ts` → `PostDTO` (ISO string) → client `hydratePost`. Takvim ve dashboard artık GERÇEK veri; mock yok. Taslaklar tarihsiz olduğu için takvimde görünmez, dashboard sayısına girer.

- **Platform başına ayrı metin (2026-10-22):** `PostPlatform.text` (null = gönderinin `text`'i). Doğrulama `overrides` kabul eder: her platform kendi (ya da ortak) metninin kendi limitine karşı denir; ortak metin yalnızca ayrı metni olmayan platform varsa zorunlu. Yayında etkin metin `target.text ?? job.text` (`inngest/functions.ts`). Formda AI'daki platform başına taslağın "Kullan"ı o platformun kartına (`X için ayrı metin`) yazar, "Genel metne dön" geri alır. Seçimden çıkarılan platformun ayrı metni gönderilmez. Takvim/liste yine `Post.text` gösterir (tüm platformlar ayrıysa ilk platformun metni).
- **AI ile yaz:** Metin alanının üstündeki panel taslak üretir ([[AiGeneration]]); "Kullan" metni doldurur, yayın yine kullanıcının onayıyla.

Bkz. [[Calendar]], [[Dashboard]], [[Publishing]], [[AiGeneration]].

## Taslaklar ve platform başına medya (2026-10-22)
- **Taslaklar sayfası** `/drafts` (`components/posts/draft-row.tsx`, `lib/queries/posts.ts` `listDrafts`): form, AI ve MCP'den gelen TÜM taslaklar burada listelenir (takvim yalnız tarihli gönderileri gösterir, taslakların tarihi yoktur). Menüde "Taslaklar" var (mobil alt barda YOK, ana sayfadaki "N taslak seni bekliyor" kartı oraya götürür). Satırdan silinir ya da açılır.
- **Taslağı düzenle** `/posts/[id]/edit` → aynı `CreatePostForm` (`initial` prop'u ile dolu). `getDraftForForm` yalnız sahibinin DRAFT'ını döndürür, başkası 404. Kaydet: `updateDraftAction` → `updateDraftForUser` (`lib/post-create.ts`): AYNI gönderi güncellenir (kopya yok), platform satırları seçime uyar, durum `DRAFT`'ta kalır ya da `SCHEDULED` olur; yalnız hâlâ DRAFT ise (atomik `updateMany`). "Taslak olarak kaydet" → `/drafts`, planla/yayınla → `/calendar`.
- **Platform başına medya:** `PostPlatform.mediaUrls` (boş = gönderinin `mediaUrls`'i). Doğrulama `mediaByPlatform` (seçili olmayan platform reddedilir, her adres beyaz listeden). Yayında `mediaFor(target, job.mediaUrls)` (`lib/publishing.ts`). Formda her platform kartında "X için ayrı medya"; "+ X için ayrı metin ve medya" düğmesi kartı açar; "Genel metne ve medyaya dön" ikisini de temizler. Önizleme platformun kendi medyasını gösterir.
- **Sınır:** bir gönderinin TEK zamanı var; platformlara farklı saat için ayrı gönderi gerekir.
