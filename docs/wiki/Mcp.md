# Mcp

Orvane bir **MCP sunucusu**: LM Studio (yerel modeller), Cursor, Claude Desktop (`mcp-remote` ile) gibi istemciler kişisel belirteçle bağlanıp taslak hazırlar.

- **Uç nokta:** `app/api/mcp/route.ts`. Streamable HTTP, **durumsuz**, JSON yanıt (`enableJsonResponse`); her istek kullanıcıya özel bir `McpServer` kurar (`lib/mcp/server.ts`). Yalnızca POST (GET/DELETE 405). `Authorization: Bearer orv_…`; yoksa/yanlışsa 401. Tarayıcı `Origin` başlığı uygulamanın kendi adresi değilse 403 (web sayfası uç noktayı süremesin). Belirteç başına dakikada 120 istek.
- **Belirteçler:** `lib/api-tokens.ts`, tablo `ApiToken`. `orv_` + 32 rastgele bayt; **yalnız SHA-256 özeti saklanır**, belirteç oluşturulurken BİR KEZ gösterilir. En fazla 10 etkin; iptal = `revokedAt`. Askıdaki kullanıcının belirteci geçmez. `lastUsedAt` dakikada en çok bir yazılır.
- **Araçlar (yalnız taslak):** `get_platform_limits`, `list_connected_accounts`, `list_posts`, `get_post`, `create_draft`, `update_draft`, `delete_draft`. **Zamanlama/yayın aracı YOK** (anayasa II: gerçek yayın kişinin kendi onayıyla uygulamada). Kurallar uygulamayla aynı: `createPostForUser` (`lib/post-create.ts`, form eylemiyle ortak) → platform başına limit, bağlı hesap şartı, `overrides`. Sır dönmez (hesap listesi yalnız platform/kullanıcı adı).
- **Arayüz:** `/settings/mcp` (`components/mcp/token-manager.tsx`, `server/actions/mcp.ts`): oluştur, listele, iptal (satır içi onay), LM Studio `mcp.json` ve `mcp-remote` kopyala-yapıştır örnekleri (adres sayfanın açıldığı host'tan).
- **Neden yerel LLM için güvenli yol:** sunucu kullanıcının yerel adreslerine ÇIKMAZ ([[AiProviders]] SSRF kuralı sürer); bağlantıyı yerel istemci Orvane'e kurar.
- **Doğrulama (2026-10-22):** resmi SDK istemcisi tünel (`orvane-dev.fatihgo.com`) üzerinden: araç listesi, taslak oluştur/oku/sil, limit aşımı hatası, iptal sonrası reddedilme. LM Studio'nun kendisiyle DENENMEDİ (yalnız resmi `mcp.json` biçimi dokümandan doğrulandı).

Bkz. [[Posts]], [[Auth]], [[Settings]], [[AdminApi]].
