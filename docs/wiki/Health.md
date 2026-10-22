# Health

`app/api/health/route.ts` — genel (giriş gerektirmeyen), ucuz bir canlılık/hazırlık ucu.

- Cevap: `{ ok, db, time }`; veritabanına `select 1` atar. `200` = süreç ayakta **ve** veritabanı erişilebilir; `503` = süreç ayakta ama DB yok ya da migration henüz uygulanmamış. `cache-control: no-store`.
- Neden ayrı bir uç: [[Settings]] içindeki "Sürüm ve güncelleme" kartı, sunucu yeniden başladıktan sonra **hazır olup olmadığını** bilmek zorunda. `/login`'e bakmak yalnız sürecin ayakta olduğunu söylüyordu; migration sürerken ya da DB kapalıyken sayfa yenilenirse kullanıcı hata ekranı görürdü. Kart artık 5 sn'de bir `/api/health` yoklar ve yalnız `200` aldığında sayfayı yeniler.
- Uptime izleme için de kullanılabilir; sır döndürmez, yazma yapmaz.

Bkz. [[Settings]], [[Database]].
