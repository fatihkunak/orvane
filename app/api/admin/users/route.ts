import { adminGuard } from "@/lib/admin-api";
import { listUsers } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/** GET /api/admin/users?q=&page=: users with counts (service token only, see lib/admin-api.ts). */
export async function GET(req: Request): Promise<Response> {
  const denied = adminGuard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  return Response.json(await listUsers({ q: url.searchParams.get("q") ?? undefined, page: Number(url.searchParams.get("page") ?? 1) || 1 }));
}
