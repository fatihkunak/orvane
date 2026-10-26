# Elle Doğrulama Listesi

Otomatik testler para/hesap gerektiren yolları kapsamaz. Bu liste, **yeni bir tarayıcı oturumunda** (gizli pencere) sırayla yapılacak kabul kontrolüdür. Her adımda "beklenen" yazıyor; tutmazsa yanındaki ipucuna bak.

> İlk kurulumda `.env` dolu, `docker compose up -d` çalışıyor, `npm run dev` + `npx inngest-cli@latest dev` açık olmalı.

## 1. Giriş

- [ ] `/login` → "Google ile devam et" → izin ekranı → panele dönüş.
- **Beklenen:** Dashboard açılır, sağ üstte adının baş harfi; e-posta menüde görünür.
- **Tutmazsa:** Google Console'da redirect URI `{APP_URL}/api/auth/callback/google` tam eşleşiyor mu, hesap "test kullanıcısı" olarak ekli mi.

## 2. Hesap bağlama (platform başına)

- [ ] `/accounts` → platformu bağla → onay ekranı → geri dönüş.
- **Beklenen:** Hesap kullanıcı adıyla listelenir; "bağlı" görünür.
- **Tutmazsa:** platformun redirect URI'si `{APP_URL}/api/connect/<twitter|linkedin|threads>/callback`; Threads için HTTPS tünel şart.

## 3. Gönderi akışı (en kritik)

- [ ] `/posts/new` → metin yaz, bir platform seç → **Taslak** olarak kaydet.
- [ ] `/drafts` → taslağı aç → **zamanla**: 3 dakika sonrası → Kaydet.
- [ ] `/calendar` → satırda kalem ikonuna bas → metni değiştir → Kaydet.
- [ ] Aynı satırda **"Saati değiştir"** → 4 dakika sonrası → Kaydet.
- [ ] Zamanı gelene kadar bekle (Inngest her dakika bakar).
- **Beklenen:** Gönderi platformda görünür, durum `Yayınlandı`; başarısızsa zil menüsünde hata mesajı.
- [ ] **Başarısız gönderi:** bir platformu bilerek hatalı bırak (ör. hesabın token'ını iptal et) → zil → bildirim `/calendar`'a götürür → satırda **"Hata"** rozeti, kalem ikonu, **"Şimdi yeniden dene"** ve **"Yeni saatte dene"**.
- [ ] Kalem → form açılır, metin düzeltilebilir; **"Taslak olarak kaydet" görünmez**. Birden fazla platformlu bir gönderide biri yayınlanmış, biri başarısızsa yayınlanan platform **"Zaten yayınlandı"** ile kilitlidir ve yeniden gönderilmez.
- **Beklenen:** Yalnız başarısız platform yeniden yayınlanır; yayınlanmış olan platformda İKİNCİ bir gönderi OLUŞMAZ.
- **Tutmazsa:** Inngest Dev Server penceresinde `schedule-due-posts` çalışıyor mu; platform token süresi; X kredisi.

## 4. Yapay zekâ — metin

- [ ] AI paneli → "Sıfırdan yaz" → kısa bir brief → **Taslak üret**.
- **Beklenen:** 1–3 varyasyon, platform başına karakter sayacı; "Kullan" metni kutuya yazar.
- **Tutmazsa:** `/settings/ai` → sağlayıcı "Sına" düğmesi; hata kodu `AUTH/PAYMENT/RATE_LIMIT` ise mesaj zaten sebebini söyler.

## 5. Yapay zekâ — görsel

- [ ] AI paneli → **Görsel üret** → istem yaz → üret.
- **Beklenen:** Önizleme gelir, "Kullan" gönderiye ekler, listede küçük resim görünür.
- **Tutmazsa:** `/settings/ai` → ilgili sağlayıcıda **Görsel modeli** dolu mu (Gemini: `gemini-2.5-flash-image`); sağlayıcı `images/generations` destekliyor mu; Cloudinary yoksa dosya `.uploads/`'a düşer (Threads'e görselli gönderi için Cloudinary gerekir).

## 6. MCP

- [ ] `/settings/mcp` → belirteç oluştur → istemciye yapıştır (LM Studio / Claude Code) → `tools/list`.
      Hızlı yol: `Authorization: Bearer orv_…` ile `/api/mcp`'ye `tools/list` POST'u.
- **Beklenen:** 9 araç görünür (`create_draft`, `update_draft`, `delete_draft`, `schedule_post`, `publish_now`, …).
- [ ] `create_draft` → dönen id ile `publish_now` (`confirm: true`).
- **Beklenen:** Taslak gerçekten yayınlanır; `confirm` olmadan çağrı hata verir.
- **Tutmazsa:** belirteç iptal mi, kullanıcı askıda mı (`/api/admin`), Inngest açık mı.

## 7. Bildirim ve profil

- [ ] Zil → menü açılır (başarısız yayın varsa kırmızı nokta).
- [ ] Avatar → ad/e-posta + Ayarlar / Yapay zekâ / MCP / Çıkış.
- **Beklenen:** Hepsi gezinir; çıkış `/login`'e atar.

## 8. Güncelleme (yalnız sahip hesabı)

- [ ] `.env`'de `ORVANE_UPDATE_ENABLED=1` + `ORVANE_OWNER_EMAIL` senin e-postan.
- [ ] `/settings` → **Güncellemeyi kontrol et**.
- **Beklenen:** Yerel commit + GitHub'daki en yeni commit görünür; geride commit yoksa "Güncelsin".
- [ ] (İsteğe bağlı, gerçek güncelleme) Uzakta bir commit varken **Güncelle** → iki adımlı onay.
- **Beklenen:** ~1–2 dk sonra sayfa kendini yeniler; `deploy/logs/update.log` sonunda `update done`/`restarted`.
- **Tutmazsa:** log'daki ilk `UPDATE FAILED` satırı; yerelde commit edilmemiş değişiklik `git pull`'u durdurur.

## 9. Hesap silme (atıl bir hesapla dene)

- [ ] İkinci bir Google hesabıyla giriş yap (ya da önce veritabanı yedeği al).
- [ ] `/settings` → **Hesabımı sil** → e-postayı yaz → Kalıcı olarak sil.
- **Beklenen:** `/login`'e atar; aynı e-postayla tekrar giriş yapınca boş bir hesap açılır; gönderiler/bağlantılar yok.
- **Tutmazsa:** `PRIVACY.md`'deki sınırlar (Cloudinary'de kalan dosyalar, platformda kalmış gönderiler).

## 10. Sağlık

- [ ] `GET /api/health` → `{"ok":true,"db":true}`.
- **Beklenen:** 200. Veritabanı kapalıysa 503 (süreç ayakta, DB yok).

---

Bir adım tutmazsa: `deploy/logs/app.log` (uygulama), `deploy/logs/update.log` (güncelleme), Inngest Dev Server konsolu. Hata mesajlarında token/anahtar görünmez; görünüyorsa bu bir güvenlik hatasıdır → [SECURITY.md](../SECURITY.md).
