import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyApiToken } from "@/lib/api-tokens";
import { takeToken } from "@/lib/ai/rate-limit";
import { createMcpServer } from "@/lib/mcp/server";

/**
 * MCP endpoint (Streamable HTTP, stateless, JSON responses). Clients such as LM Studio (local models), Claude Desktop or
 * Cursor connect with `Authorization: Bearer orv_…`, a personal token made in Ayarlar → MCP. Each request builds a server
 * scoped to the token's user; there is no session to hijack.
 */
export const dynamic = "force-dynamic";

const RATE = { count: 120, windowMs: 60_000 };

const jsonError = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers });

/** Browsers send Origin; MCP clients do not. A foreign Origin means a web page is trying to drive the endpoint, so refuse it. */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([new URL(req.url).origin, process.env.APP_URL, process.env.AUTH_URL].filter(Boolean).map((u) => new URL(u!).origin));
  return allowed.has(origin);
}

export async function POST(req: Request): Promise<Response> {
  if (!originAllowed(req)) return jsonError(403, "Origin not allowed");

  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const who = token ? await verifyApiToken(token) : null;
  if (!who) return jsonError(401, "Missing, invalid or revoked token", { "WWW-Authenticate": 'Bearer realm="mcp"' });

  const limit = takeToken(`mcp:${who.tokenId}`, RATE.count, RATE.windowMs);
  if (!limit.ok) return jsonError(429, `Too many requests, retry in ${limit.retryAfterSec}s`, { "Retry-After": String(limit.retryAfterSec) });

  const server = createMcpServer(who.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // The response is already built (JSON mode), so the per-request server can be released
    void server.close();
  }
}

// Stateless: no server-initiated stream and no session to delete
const notAllowed = () => jsonError(405, "Method not allowed", { Allow: "POST" });
export const GET = notAllowed;
export const DELETE = notAllowed;
