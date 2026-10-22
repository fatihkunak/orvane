import { adminGuard } from "@/lib/admin-api";
import { adminStats } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = adminGuard(req);
  if (denied) return denied;
  return Response.json(await adminStats());
}
