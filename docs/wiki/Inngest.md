# Inngest

`inngest/client.ts`, `inngest/functions.ts`, `app/api/inngest/route.ts` (SDK v4: `createFunction({id, triggers:[...]}, handler)`).

- `schedule-due-posts`: cron `* * * * *`, `findDuePostIds` → `step.sendEvent` ile her gönderi için `post/publish.requested` (olay id'si 10 dk kovasına göre, mükerrer olay düşer).
  - **Parti sınırı (2026-10-22):** bir tik en fazla `DUE_BATCH` gönderi devralır (`lib/publishing.ts`, varsayılan 100, `ORVANE_DUE_BATCH` ile 1–500 arası). Sorgu `scheduledAt` artan sırada (`@@index([status, scheduledAt])`) ve askıdaki kullanıcıları atlar. Parti dolduğunda log'a `due batch full` yazılır ve `batchFull: true` döner: kalan gönderiler bir sonraki dakikada işlenir, hiçbiri kaybolmaz. Böylece kullanıcı sayısı artınca tek tik her şeyi yüklemeye çalışmaz; yayın hızı zaten `concurrency: 5` ile sınırlı.
- `publish-post`: olay; her platform için `claim-X` (kendi adımı, sonucu önbelleğe alınır) → `publish-X` → `done-X`/`fail-X`; Threads: `threads-container` → `step.sleep 30s` → `threads-publish`. `retries: 3`, `concurrency: 5`. Handler `publishPostHandler` olarak dışa açık (testte sahte `step` ile çağrılır).
- `refresh-expiring-tokens`: günlük 03:00, 7 gün içinde bitenleri yeniler.
- Yerel: `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`, uygulama `INNGEST_DEV=1`. Üretimde `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.
- DOĞRULANDI (Dev Server ile): cron her dakika tetiklendi, planlı gönderi zamanında alındı, "şimdi yayınla" olayı fonksiyonu çalıştırdı.
