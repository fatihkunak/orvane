# Hydration

`lib/use-today.ts`: `useSyncExternalStore` (sunucuda `null`, tarayıcıda sabit `Date`). Sunucu saat dilimiyle çizip uyuşmazlık yaşamamak için tarih-bağımlı UI bunu bekler ([[Calendar]], [[Dashboard]], [[Analytics]]). `useEffect+setState` yazma: `react-hooks/set-state-in-effect` lint hatası verir.
Zaman dilimi: tarih ve saat girdileri tarayıcı yerelinde, veritabanı UTC; gün kovaları tarayıcıda hesaplanır.
