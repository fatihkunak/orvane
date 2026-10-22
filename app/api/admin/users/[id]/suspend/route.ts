import { z } from "zod";
import { adminGuard } from "@/lib/admin-api";
import { setSuspended } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

const body = z.object({ suspended: z.boolean() });

/** POST { suspended: boolean }: suspend or restore a user. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = adminGuard(req);
  if (denied) return denied;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Body must be {suspended: boolean}" }, { status: 400 });
  const result = await setSuspended((await params).id, parsed.data.suspended);
  return result ? Response.json(result) : Response.json({ error: "Not found" }, { status: 404 });
}
