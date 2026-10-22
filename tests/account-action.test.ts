import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

/**
 * The guard in front of the irreversible action. `signOut` throws in the real app (Next redirects on it); the mock does the same
 * so the test can tell "deleted and signed out" apart from "refused".
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(async () => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const { auth, signOut } = await import("@/auth");
const { deleteAccountAction } = await import("@/server/actions/account");

let userId: string;
const stamp = Date.now();

const signInAs = (id: string, email: string | null) => vi.mocked(auth).mockResolvedValue({ user: { id, email } } as never);

describe("deleteAccountAction", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Unique per test: the e-mail column is unique and beforeEach runs for every case
    const unique = Math.random().toString(36).slice(2, 8);
    userId = (await prisma.user.create({ data: { email: `del-action-${stamp}-${unique}@test.local` } })).id;
    await prisma.socialAccount.create({
      data: { userId, provider: "TWITTER", platformUserId: `x-${stamp}-${unique}`, accessToken: encrypt("SECRET") },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `del-action-${stamp}` } } });
    await prisma.$disconnect();
  });

  it("refuses without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await deleteAccountAction(`del-action-${stamp}@test.local`)).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });

  it("refuses a wrong confirmation and deletes nothing", async () => {
    signInAs(userId, "someone@test.local");
    expect(await deleteAccountAction("other@test.local")).toMatchObject({ ok: false, error: expect.stringContaining("e-posta") });
    expect(await deleteAccountAction("someone@test.localx")).toMatchObject({ ok: false });
    expect(await deleteAccountAction("")).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
    expect(await prisma.socialAccount.count({ where: { userId } })).toBe(1);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses when the session carries no e-mail (fail closed)", async () => {
    signInAs(userId, null);
    expect(await deleteAccountAction("")).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });

  it("deletes everything and signs out on a match, ignoring case and stray spaces", async () => {
    signInAs(userId, "Del-Action@test.local");
    await expect(deleteAccountAction("  del-action@TEST.local  ")).rejects.toThrow("NEXT_REDIRECT");
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.socialAccount.count({ where: { userId } })).toBe(0);
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
