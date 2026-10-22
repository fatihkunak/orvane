import { prisma } from "@/lib/prisma";

/**
 * Liveness/readiness probe. Public and cheap: the update card polls it to know when the restarted server is back, and an uptime
 * monitor can hit it. `db: false` means the process is up but the database is unreachable (or a migration has not run yet).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await prisma.$queryRaw`select 1`.then(() => true).catch(() => false);
  return Response.json(
    { ok: db, db, time: new Date().toISOString() },
    { status: db ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
