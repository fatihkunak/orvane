import { adminGuard } from "@/lib/admin-api";
import { getUserDetail } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = adminGuard(req);
  if (denied) return denied;
  const user = await getUserDetail((await params).id);
  return user ? Response.json(user) : Response.json({ error: "Not found" }, { status: 404 });
}
