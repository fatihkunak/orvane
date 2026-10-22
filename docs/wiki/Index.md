# Orvane — Mimari Wiki

> Bu wiki, projenin canlı mimari dokümantasyonudur. Her modül bir node'dur.
> Cross-reference: çift köşeli parantez `[[Node]]` syntax'ı (Obsidian graph view'da gezilebilir).
> **Kod mapping:** `_build/map-nodes.mjs` her node'u ilgili kod dosyasına/dizinine eşler (`_build/map.json`).

---

## 🎯 Genel
- [[Overview]] — Orvane nedir: Threads/LinkedIn/X için çoklu platform gönderi planlama
- [[TechStack]] — Next.js App Router, Tailwind v4, shadcn/ui, Prisma, Auth.js, Inngest

## 🎨 Tasarım
- [[DesignSystem]] — koyu tema token'ları (`app/globals.css`), marka renkleri, gradient yardımcıları

## 🗄️ Veri & Kimlik
- [[Database]] — Prisma 7 + PostgreSQL şeması, driver adapter, yerel Docker (`orvane-postgres`, :5546)
- [[Auth]] — Auth.js v5: edge-safe `auth.config.ts` + `auth.ts` (Prisma adapter, JWT), `proxy.ts` rota koruması

## 🧩 Frontend
- [[Providers]] — React Query + Sonner toaster sağlayıcıları
- [[RootLayout]] — `app/layout.tsx`: Inter fontu, `dark` sınıfı, metadata
- [[Layout]] — dashboard kabuğu: Sidebar (lg+), Topbar, MobileNav (< lg, ortada + butonu), nav-items

## 📊 Sayfalar
- [[Dashboard]] — Ana Sayfa: gerçek sayaçlar + Yaklaşan Yayınlar
- [[Calendar]] — haftalık/aylık takvim, platform filtresi, seçili gün listesi
- [[Platforms]] — platform meta (etiket, karakter limiti), marka ikonları
- [[Hydration]] — `useToday` deseni: tarih-bağımlı UI hidrasyon uyuşmazlığı yaşamasın
- [[Analytics]] — Recharts: günlük gönderi, platform başarı oranı (yalnızca Orvane verisi)
- [[Settings]] — profil + kurulum durumu (hangi env değişkenleri hazır)

## ✍️ Gönderi & Medya
- [[Posts]] — form, doğrulama (zod), sunucu eylemleri, takvim/dashboard sorguları
- [[Media]] — yükleme (Cloudinary/yerel), SSRF beyaz listesi, dosya imzası

## 🧠 Yapay Zekâ
- [[AiProviders]] — 19 sağlayıcılı BYOK kaydı, istemci, SSRF koruması, yedek zinciri
- [[AiGeneration]] — "AI ile yaz" paneli, istem/ayrıştırma, üret → değerlendir → onar hattı
- [[AiSettings]] — `/settings/ai`: zincir, model listesi, anahtar sınama, şifreli depo

## 🔌 Entegrasyonlar
- [[Mcp]] — MCP sunucusu: yerel modeller/istemciler belirteçle bağlanıp taslak hazırlar ve ileri tarihe zamanlar (anlık yayın yok)
- [[AdminApi]] — fatihgo paneli için servis-belirteçli kullanıcı yönetimi, askıya alma
- [[Accounts]] — OAuth bağlama akışı (X PKCE, LinkedIn, Threads), token şifreleme ve yenileme
- [[Publishing]] — yayıncılar, atomik claim, durum türetme, hata sınıflandırma
- [[Inngest]] — cron + olay fan-out, publish-post adımları, yerel Dev Server

## 🧪 Kalite
- [[Tests]] — vitest: birim + gerçek DB entegrasyonu, neyin gerçek API'ye karşı denendiği
