# AiGeneration

Gönderi formundaki **"AI ile yaz"** paneli ve arkasındaki üretim hattı. Üretilenler YALNIZCA taslaktır: kullanıcı "Kullan" der, normal metin kutusunda düzenler, hiçbir şey otomatik yayınlanmaz.

- **UI:** `components/ai/ai-assistant.tsx` (`create-post-form.tsx` içinde, Metin alanının üstünde). Biçimler: "Sıfırdan yaz" (konu → N varyasyon) ve "Mevcut metni iyileştir" (kısalt, genişlet, düzelt, tonu değiştir, çevir, güçlü açılış). Ton (8), dil (11), varyasyon (1-3), emoji, hashtag, sağlayıcı seçimi (varsayılan: zincir sırası). Sonuç kartında platform başına karakter sayacı (aşan kırmızı), "Kullan", "Kopyala", hangi sağlayıcı/model/süre.
- **İstem:** `lib/ai/prompt.ts` (saf). Seçili platformların EN SIKI limiti hedeflenir (tek metin hepsine sığmalı; %92 güvenlik payı), platform notları (X kısa + en fazla 2 hashtag, LinkedIn güçlü ilk satır, Threads sohbet havası). Kullanıcı metni `<brief>`/`<text>` içinde VERİ olarak sunulur, talimat değildir. Çıktı JSON `{"variants":[{"text":…}]}`; `parseVariants` fence, `<think>`, çevresindeki metin, farklı şekiller ve (tek varyasyonda) düz metni tolere eder.
- **Hat:** `lib/ai/service.ts` `generateForUser`: istek zod ile doğrulanır → zincir (tercih edilen sağlayıcı öne) → çağrı + model yedeği → ayrıştırma (boşsa BAD_OUTPUT → yedeğe) → limit aşımı varsa AYNI sağlayıcıyla TEK kısaltma denemesi, olmazsa özgün metin "sınırı aşıyor" bayrağıyla kalır. Üret → değerlendir → onar.
- **Eylem:** `server/actions/ai.ts` `generatePostAction` (oturum şart, kullanıcı başına 20 istek/10 dk, `lib/ai/rate-limit.ts`; hata kodları UI'ya gider, anahtar asla).
- **Sınırlar:** brief ≤2000, mevcut metin ≤5000 karakter. İstem seçilen sağlayıcıya gider (gizlilik metni bunu söylemeli).

Bkz. [[AiProviders]], [[AiSettings]], [[Posts]].
