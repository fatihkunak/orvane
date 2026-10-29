# Inngest

`inngest/client.ts`, `inngest/functions.ts`, `app/api/inngest/route.ts` (SDK v4: `createFunction({id, triggers:[...]}, handler)`).

- `schedule-due-posts`: cron `* * * * *`, `findDuePostIds` → `step.sendEvent` ile her gönderi için `post/publish.requested` (olay id'si 10 dk kovasına göre, mükerrer olay düşer).
  - **Parti sınırı (2026-10-22):** bir tik en fazla `DUE_BATCH` gönderi devralır (`lib/publishing.ts`, varsayılan 100, `ORVANE_DUE_BATCH` ile 1–500 arası). Sorgu `scheduledAt` artan sırada (`@@index([status, scheduledAt])`) ve askıdaki kullanıcıları atlar. Parti dolduğunda log'a `due batch full` yazılır ve `batchFull: true` döner: kalan gönderiler bir sonraki dakikada işlenir, hiçbiri kaybolmaz. Böylece kullanıcı sayısı artınca tek tik her şeyi yüklemeye çalışmaz; yayın hızı zaten `concurrency: 5` ile sınırlı.
- `publish-post`: olay; her platform için `claim-X` (kendi adımı, sonucu önbelleğe alınır) → `publish-X` → `done-X`/`fail-X`; Threads: `threads-container` → `step.sleep 30s` → `threads-publish`. `retries: 3`, `concurrency: 5`. Handler `publishPostHandler` olarak dışa açık (testte sahte `step` ile çağrılır).
- `refresh-expiring-tokens`: günlük 03:00, 7 gün içinde bitenleri yeniler.
- `cleanup-orphan-media`: günlük 04:30, `sweepOrphanMedia` ile `.uploads`'ta 24 saatten eski ve referanssız dosyaları siler ([[Media]]).
- Yerel: `npx --yes inngest-cli@1.49.0 dev -u http://localhost:3055/api/inngest` (`deploy/start-inngest.cmd`, açılışta `OrvaneInngest` görevi), uygulama `INNGEST_DEV=1`. Üretimde `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.
  - **Sürüm sabit + `--yes` (2026-10-30):** `@latest` yeni CLI sürümü çıkınca npx "Ok to proceed?" sorar; gizli pencerede cevap veren olmadığı için Dev Server hiç açılmıyor, zamanlı yayın sessizce duruyordu. CLI'ı yükseltmek = betikteki sürümü elle değiştirmek.
- **Dev modu kapısı (2026-10-30):** dev modunda (INNGEST_DEV ya da imza anahtarı yok) SDK imzasız her isteği — uydurulmuş adım sonuçları dahil — çalıştırır; `orvane-dev.fatihgo.com` tüneli de `/api/inngest`'i internete açıyordu. `app/api/inngest/route.ts` artık `inngestRequestAllowed` (`lib/inngest-guard.ts`) ile sarılı: imzasız modda yalnız loopback `Host` ve Cloudflare başlığı (`cf-connecting-ip`/`cf-ray`) taşımayan istek geçer, diğerleri 404. İmza anahtarı varken (ve INNGEST_DEV kapalıyken) kontrol SDK'nın kendi imza doğrulamasına bırakılır. Test: `tests/inngest-guard.test.ts`.
- DOĞRULANDI (Dev Server ile): cron her dakika tetiklendi, planlı gönderi zamanında alındı, "şimdi yayınla" olayı fonksiyonu çalıştırdı.
