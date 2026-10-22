# Publishing

`lib/publishing.ts` (DB orkestrasyonu) + `lib/social/publishers/{twitter,linkedin,threads}.ts` (saf HTTP, `Deps={fetch,sleep}` enjekte edilir, testte gerçek ağ yok).

- **Metin**: `loadPublishJob` platform satırının `text`'ini de getirir; gönderilen metin `target.text ?? job.text`.
- **Atomik claim**: `claimPlatform` = `updateMany WHERE PENDING (veya 10 dk'dan eski PUBLISHING)`, count==1 olan kazanır. Cron ve "şimdi yayınla" çakışsa da tek gönderim. Çöken koşunun satırı 10 dk sonra yeniden alınır.
- **Durum**: platform satırı `PENDING→PUBLISHING→PUBLISHED|FAILED`; `derivePostStatus`: hepsi PUBLISHED → PUBLISHED, uçuşta bir şey varsa değişmez, aksi halde FAILED. Hata metni satırda (`error`), takvimde görünür.
- **Hata sınıfı** (`PublishError.retryable`): 429/5xx yeniden denenir; 4xx/ölü token/reddedilen içerik kalıcıdır (`NonRetriableError`).
- **X**: medya `initialize→append(4 MB)→finalize→STATUS` (v2), sonra `POST /2/tweets` `media.media_ids`. ≤4 görsel veya 1 video.
- **LinkedIn**: `/rest/posts` (Posts API, `Linkedin-Version: YYYYMM` + `X-Restli-Protocol-Version: 2.0.0`; ugcPosts'un halefi). Metin `escapeLittleText` ile kaçışlanır (`| { } @ [ ] ( ) < > \ * _ ~`; kelimeye bitişik `#` korunur). Görsel `/rest/images`, çoklu görsel `multiImage`, video `/rest/videos` parçalı + ETag. Gönderi kimliği `x-restli-id` başlığında.
- **Threads**: container → (medya varsa ~30 sn) → `threads_publish`; karusel 2+ öğe. Medya URL'si herkese açık olmalı.
- Bilinen sınır: tweet oluşup yanıt kaybolursa yeniden deneme çift gönderi yapabilir (platformlarda idempotency anahtarı yok).
- GERÇEK API'ye karşı yalnızca **geçersiz token** ile hata yolu denendi (X 403, LinkedIn 401, Threads OAuthException 190). Başarılı yayın gerçek hesap/anahtarla henüz denenmedi. Threads container durum alanı (`status`) dokümanda doğrulanamadı; kod, durum uç noktası yanıt vermezse yayına devam eder.
