# AiSettings

`/settings/ai`: sağlayıcı yönetimi. `app/(dashboard)/settings/ai/page.tsx` (sunucu, `listConfigs`) + `components/ai/provider-manager.tsx` (client). `Ayarlar` sayfasından bağlantı.

- **Zincirim:** Ana / Yedek N sırası, ↑↓, "Ana yap", satır başına "Sına" (küçük gerçek istek, ms), düzenle, kaldır (satır içi onay).
- **Sağlayıcılar:** 4 grup, her biri için editör: API anahtarı (password; kayıtlıysa boş bırakmak anahtarı korur), adres (yalnız özel/yerel), model (yazılabilir + `datalist` + "Modelleri getir" ile gelen liste), Kaydet, Sına.
- **Depo:** `lib/ai/store.ts` + Prisma `AiProviderConfig` (kullanıcı başına sağlayıcı başına tek satır, `position` 0 = ana). Anahtar `lib/crypto.ts` ile AES-256-GCM şifreli (`v1.` biçimi), tarayıcıya ASLA geri dönmez (`ProviderView` yalnız `hasKey`). Çözülemeyen anahtar (`TOKEN_ENCRYPTION_KEY` değişti) "anahtar yok" sayılır.
- **Eylemler:** `saveAiProviderAction`, `removeAiProviderAction`, `makePrimaryAiProviderAction`, `moveAiProviderAction`, `fetchAiModelsAction`, `checkAiProviderAction` (oturum şart; ağ gerektirenler 30 istek/10 dk). Yazarken adres SSRF denetiminden geçer, çağrı anında yeniden denetlenir.
- **Gotcha:** Prisma şeması değişince dev sunucusu yeniden başlatılmalı (istemci `globalThis`'te önbellekli, yeni model `undefined` olur).

Bkz. [[AiProviders]], [[AiGeneration]], [[Settings]].
