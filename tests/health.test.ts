import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/prisma";

/** The probe must reflect the database, since the update card reloads the page only on a healthy answer. */

describe("health endpoint", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("answers 200 with db:true while the database is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; db: boolean; time: string };
    expect(body).toMatchObject({ ok: true, db: true });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
