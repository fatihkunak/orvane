import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPostForForm } from "@/lib/queries/posts";
import { isEditableStatus } from "@/lib/post-types";
import { PostStatus } from "@/generated/prisma/enums";

/** The pencil in a post list must only appear where the edit page can actually open the post (otherwise it is a 404). */

let userId: string;
const stamp = Date.now();

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `editable-${stamp}@test.local` } })).id;
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("isEditableStatus", () => {
  it("is true only for DRAFT and SCHEDULED", () => {
    const editable = Object.values(PostStatus).filter(isEditableStatus).sort();
    expect(editable).toEqual(["DRAFT", "SCHEDULED"]);
  });

  it("agrees with what the edit page opens for a future post", async () => {
    for (const status of Object.values(PostStatus)) {
      const p = await prisma.post.create({ data: { userId, text: `s-${status}`, status, scheduledAt: new Date(Date.now() + 3600_000) } });
      expect(!!(await getPostForForm(userId, p.id)), status).toBe(isEditableStatus(status));
    }
  });
});
