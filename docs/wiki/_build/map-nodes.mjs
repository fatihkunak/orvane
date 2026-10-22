// Wiki node → kod dosyası/dizini mapping builder (Orvane).
// Çalıştır: node docs/wiki/_build/map-nodes.mjs  → _build/map.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WIKI = join(HERE, '..');
const ROOT = join(WIKI, '..', '..');

// Node adı → ilgili kod yolları (ROOT'a göre). İsim↔dosya uyumsuzluğu için elle eşleme.
const mapping = {
  Overview: { paths: [], noCode: true },
  TechStack: { paths: ['package.json'] },
  DesignSystem: { paths: ['app/globals.css'] },
  Providers: { paths: ['components/providers.tsx'] },
  RootLayout: { paths: ['app/layout.tsx'] },
  Database: { paths: ['prisma/schema.prisma', 'prisma.config.ts', 'lib/prisma.ts'] },
  Layout: { paths: ['app/(dashboard)/layout.tsx', 'components/layout/nav-items.ts', 'components/layout/sidebar.tsx', 'components/layout/mobile-nav.tsx', 'components/layout/topbar.tsx', 'lib/queries/notifications.ts'] },
  Dashboard: { paths: ['app/(dashboard)/dashboard/page.tsx', 'components/dashboard/upcoming-posts.tsx', 'components/posts/post-row.tsx'] },
  Calendar: { paths: ['app/(dashboard)/calendar/page.tsx', 'components/calendar/calendar-view.tsx'] },
  Platforms: { paths: ['lib/platforms.ts', 'components/platform/platform-icon.tsx'] },
  Hydration: { paths: ['lib/use-today.ts', 'lib/format.ts'] },
  Analytics: { paths: ['lib/queries/analytics.ts', 'components/analytics/analytics-view.tsx', 'app/(dashboard)/analytics/page.tsx'] },
  Settings: { paths: ['app/(dashboard)/settings/page.tsx', 'lib/update.ts', 'server/actions/update.ts', 'components/settings/version-card.tsx', 'deploy/update.cmd', 'deploy/start-app.cmd', 'tests/update.test.ts'] },
  Posts: { paths: ['components/posts/create-post-form.tsx', 'components/posts/draft-row.tsx', 'app/(dashboard)/drafts/page.tsx', 'app/(dashboard)/posts/[id]/edit/page.tsx', 'lib/post-create.ts', 'tests/drafts.test.ts', 'components/platform/platform-selector.tsx', 'lib/validation/post.ts', 'lib/char-count.ts', 'server/actions/posts.ts', 'lib/queries/posts.ts', 'lib/post-types.ts'] },
  Media: { paths: ['lib/media.ts', 'lib/media-store.ts', 'app/api/upload/route.ts', 'app/api/media/[name]/route.ts'] },
  Accounts: { paths: ['lib/social/app-credentials.ts', 'components/platform/app-keys-form.tsx', 'tests/app-credentials.test.ts', 'lib/social/providers.ts', 'lib/social/oauth-flow.ts', 'lib/social/tokens.ts', 'lib/crypto.ts', 'server/actions/accounts.ts', 'app/(dashboard)/accounts/page.tsx', 'app/api/connect/[provider]/route.ts'] },
  Publishing: { paths: ['lib/publishing.ts', 'lib/social/publishers/shared.ts', 'lib/social/publishers/twitter.ts', 'lib/social/publishers/linkedin.ts', 'lib/social/publishers/threads.ts'] },
  Inngest: { paths: ['inngest/client.ts', 'inngest/functions.ts', 'app/api/inngest/route.ts'] },
  Tests: { paths: ['vitest.config.mts', '.github/workflows/ci.yml', 'tests/unit.test.ts', 'tests/publishers.test.ts', 'tests/publishing.test.ts', 'tests/oauth-flow.test.ts', 'tests/ai-core.test.ts', 'tests/ai-service.test.ts', 'tests/ai-image.test.ts', 'tests/mcp-admin.test.ts', 'tests/update.test.ts'] },
  AiProviders: { paths: ['lib/ai/providers.ts', 'lib/ai/client.ts', 'lib/ai/errors.ts', 'lib/ai/security.ts', 'lib/ai/failover.ts', 'lib/ai/text.ts'] },
  AiGeneration: { paths: ['components/ai/ai-assistant.tsx', 'lib/ai/prompt.ts', 'lib/ai/service.ts', 'lib/ai/image.ts', 'lib/ai/image-meta.ts', 'lib/ai/image-service.ts', 'lib/ai/rate-limit.ts', 'server/actions/ai.ts', 'tests/ai-image.test.ts'] },
  AiSettings: { paths: ['app/(dashboard)/settings/ai/page.tsx', 'components/ai/provider-manager.tsx', 'lib/ai/store.ts', 'components/ui/native-select.tsx'] },
  Mcp: { paths: ['app/api/mcp/route.ts', 'lib/mcp/server.ts', 'lib/api-tokens.ts', 'lib/post-create.ts', 'app/(dashboard)/settings/mcp/page.tsx', 'components/mcp/token-manager.tsx', 'server/actions/mcp.ts', 'tests/mcp-admin.test.ts'] },
  AdminApi: { paths: ['lib/admin-api.ts', 'lib/admin-users.ts', 'app/api/admin/users/route.ts', 'app/api/admin/users/[id]/route.ts', 'app/api/admin/users/[id]/suspend/route.ts', 'app/api/admin/stats/route.ts', 'app/suspended/page.tsx'] },
  Auth: { paths: ['auth.config.ts', 'auth.ts', 'proxy.ts', 'app/api/auth/[...nextauth]/route.ts', 'app/login/page.tsx'] },
};

// Index.md'deki kategori başlıklarını oku (## 🎯 Kategori)
const categories = {};
let current = null;
for (const line of readFileSync(join(WIKI, 'Index.md'), 'utf8').split(/\r?\n/)) {
  const cat = line.match(/^## (.+)$/);
  if (cat) { current = cat[1].replace(/^[^\w]+/, '').trim(); continue; }
  const link = line.match(/\[\[([^\]]+)\]\]/);
  if (link && current) categories[link[1]] = current;
}

const out = {};
for (const [node, categoryName] of Object.entries(categories)) {
  const m = mapping[node] ?? { paths: [] };
  out[node] = {
    category: categoryName,
    paths: m.paths,
    missing: m.paths.filter(p => !existsSync(join(ROOT, p))),
    noCode: m.noCode ?? m.paths.length === 0,
  };
}

writeFileSync(join(HERE, 'map.json'), JSON.stringify(out, null, 2));
const bad = Object.entries(out).filter(([, v]) => v.missing.length);
console.log(`${Object.keys(out).length} node, ${bad.length} eksik yol`);
for (const [k, v] of bad) console.log(' -', k, v.missing.join(', '));
