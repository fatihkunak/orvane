import { headers } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { TokenManager } from "@/components/mcp/token-manager";
import { listApiTokens } from "@/lib/api-tokens";

export const metadata = { title: "MCP" };

export default async function McpSettingsPage() {
  const session = await auth();
  const tokens = await listApiTokens(session!.user.id); // layout guarantees a session

  // The address the client should use: the one this page was opened on
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3055";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/mcp`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <Link href="/settings" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden /> Ayarlar
        </Link>
        <h1 className="mt-2 text-xl font-semibold">MCP: yerel modeller ve diğer istemciler</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          LM Studio gibi MCP destekli bir istemci, kişisel belirtecinle buraya bağlanıp gönderi taslağı hazırlayabilir. Belirtecin kendisi saklanmaz, yalnızca özeti tutulur.
        </p>
      </div>
      <TokenManager
        endpoint={endpoint}
        tokens={tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
