import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { Platform } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/brand";
import { PLATFORMS } from "@/lib/platforms";
import { createPostForUser } from "@/lib/post-create";
import { createPostSchema, scheduleTimeSchema } from "@/lib/validation/post";

/**
 * The MCP server for ONE user (built per request from a verified API token). Tools read the user's accounts and posts and
 * manage DRAFTS, plus ONE schedule tool (`schedule_post`). There is deliberately no tool that publishes: a real post to X,
 * LinkedIn or Threads needs the person's own click in the app (constitution II), so a model can prepare text and pick a
 * future time, but never send anything.
 */

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

const platformEnum = z.enum(Platform);
const POST_STATUS = z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"]);
const MAX_LIST = 50;

const preview = (t: string, n = 200) => (t.length > n ? `${t.slice(0, n)}…` : t);

export function createMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: BRAND.name.toLowerCase(), version: "1.0.0" },
    {
      instructions: [
        `${BRAND.name} plans posts for X, LinkedIn and Threads. You can read the user's connected accounts and posts, create and edit DRAFTS, and schedule a post for a future time.`,
        "You cannot publish: nothing goes out while you are working. A scheduled post is published later by the app's own scheduler, and the user can still open it and cancel or edit it before then.",
        "Prefer creating a draft first; use schedule_post with the draft's id only when the user has picked a time.",
        "Call get_platform_limits before writing, and keep each text within the limit of the platform it is for.",
        "Use `overrides` to give one platform its own text (e.g. a short X version and a longer LinkedIn version).",
      ].join(" "),
    },
  );

  server.registerTool(
    "get_platform_limits",
    { description: "Character limits of every supported platform. Check this before writing a post." },
    async () => text(Object.values(PLATFORMS).map((p) => ({ platform: p.id, name: p.label, maxCharacters: p.charLimit }))),
  );

  server.registerTool(
    "list_connected_accounts",
    { description: "The social accounts the user has connected. A post can only target a platform that has a connected account." },
    async () => {
      const rows = await prisma.socialAccount.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { provider: true, username: true, displayName: true },
      });
      return text(rows.map((r) => ({ platform: r.provider, handle: r.username, name: r.displayName })));
    },
  );

  server.registerTool(
    "list_posts",
    {
      description: "The user's posts, newest first. Texts are shortened; use get_post for the full text.",
      inputSchema: z.object({
        status: POST_STATUS.optional().describe("Only posts with this status"),
        limit: z.number().int().min(1).max(MAX_LIST).default(20),
      }),
    },
    async ({ status, limit }) => {
      const rows = await prisma.post.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { platforms: { select: { platform: true } } },
      });
      return text(
        rows.map((p) => ({
          id: p.id,
          status: p.status,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
          platforms: p.platforms.map((x) => x.platform),
          text: preview(p.text),
        })),
      );
    },
  );

  server.registerTool(
    "get_post",
    { description: "One post with its full text and the text each platform will get.", inputSchema: z.object({ id: z.string().min(1) }) },
    async ({ id }) => {
      const p = await prisma.post.findFirst({
        where: { id, userId },
        include: { platforms: { select: { platform: true, text: true, status: true, error: true } } },
      });
      if (!p) return fail("Gönderi bulunamadı.");
      return text({
        id: p.id,
        status: p.status,
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        text: p.text,
        platforms: p.platforms.map((x) => ({ platform: x.platform, ownText: x.text, status: x.status, error: x.error })),
      });
    },
  );

  server.registerTool(
    "create_draft",
    {
      description: "Create a DRAFT post. It is not scheduled or published; the user reviews it in the app. Every platform needs a connected account.",
      inputSchema: z.object({
        text: z.string().default("").describe("Text for every platform that has no entry in `overrides`"),
        platforms: z.array(platformEnum).min(1),
        overrides: z.partialRecord(platformEnum, z.string()).optional().describe("Text for one platform only, keyed by platform"),
      }),
    },
    async ({ text: body, platforms, overrides }) => {
      const r = await createPostForUser(userId, { text: body, platforms, overrides, mediaUrls: [], mode: "draft" });
      return r.ok ? text({ id: r.id, status: "DRAFT", note: "Draft saved. The user must review and publish it in the app." }) : fail(r.error);
    },
  );

  server.registerTool(
    "update_draft",
    {
      description:
        "Change the text of a DRAFT. `text` replaces the shared text; `overrides` sets a platform's own text (an empty string removes it). Platforms cannot be changed; create a new draft for that.",
      inputSchema: z.object({
        id: z.string().min(1),
        text: z.string().optional(),
        overrides: z.partialRecord(platformEnum, z.string()).optional(),
      }),
    },
    async ({ id, text: body, overrides }) => {
      const post = await prisma.post.findFirst({ where: { id, userId }, include: { platforms: true } });
      if (!post) return fail("Gönderi bulunamadı.");
      if (post.status !== "DRAFT") return fail("Yalnızca taslaklar değiştirilebilir.");

      const platforms = post.platforms.map((p) => p.platform);
      const nextOverrides: Partial<Record<Platform, string>> = {};
      for (const p of post.platforms) if (p.text) nextOverrides[p.platform] = p.text;
      for (const [k, v] of Object.entries(overrides ?? {}) as [Platform, string][]) {
        if (!platforms.includes(k)) return fail(`${PLATFORMS[k].label} bu taslakta seçili değil.`);
        if (v.trim()) nextOverrides[k] = v;
        else delete nextOverrides[k];
      }

      // Same rules as creating: limits per platform, shared text only where a platform has none of its own
      const check = createPostSchema.safeParse({ text: body ?? post.text, platforms, overrides: nextOverrides, mediaUrls: [], mode: "draft" });
      if (!check.success) return fail(check.error.issues[0]?.message ?? "Geçersiz veri");

      await prisma.$transaction([
        prisma.post.update({ where: { id }, data: { text: check.data.text || nextOverrides[platforms[0]!]! } }),
        ...post.platforms.map((p) => prisma.postPlatform.update({ where: { id: p.id }, data: { text: nextOverrides[p.platform] ?? null } })),
      ]);
      return text({ id, status: "DRAFT", updated: true });
    },
  );

  server.registerTool(
    "schedule_post",
    {
      description:
        "Schedule a post for a future time. Nothing is published now: the app's scheduler picks it up at that time, and the user can still open the post and cancel or edit it before then. Pass an existing DRAFT `id` to schedule that draft as it is, or `text` + `platforms` to schedule a new post.",
      inputSchema: z.object({
        scheduledAt: scheduleTimeSchema.describe("ISO 8601 with timezone offset, e.g. 2026-10-23T09:30:00+03:00. Must not be in the past."),
        id: z.string().min(1).optional().describe("A DRAFT of this user to schedule; its own text and platforms are kept"),
        text: z.string().default("").describe("Text for a NEW post; ignored when `id` is given"),
        platforms: z.array(platformEnum).min(1).optional().describe("Platforms of a NEW post; required when `id` is not given"),
        overrides: z.partialRecord(platformEnum, z.string()).optional(),
      }),
    },
    async ({ scheduledAt, id, text: body, platforms, overrides }) => {
      const when = new Date(scheduledAt);

      // Existing draft: one atomic move, so a draft that is no longer a draft (published meanwhile) is never rescheduled
      if (id) {
        if (platforms?.length || body.trim()) return fail("`id` verildiğinde `text` ve `platforms` kullanılmaz; taslağın kendi metni ve platformları korunur.");
        const { count } = await prisma.post.updateMany({ where: { id, userId, status: "DRAFT" }, data: { status: "SCHEDULED", scheduledAt: when } });
        if (count !== 1) return fail("Zamanlanabilecek bir taslak bulunamadı.");
        return text({ id, status: "SCHEDULED", scheduledAt: when.toISOString(), note: "Zamanlandı. Yayın saati gelene kadar uygulamadan iptal edilebilir." });
      }

      if (!platforms?.length) return fail("Yeni gönderi için `platforms` gerekli.");
      const r = await createPostForUser(userId, { text: body, platforms, overrides: overrides ?? {}, mediaUrls: [], mode: "schedule", scheduledAt });
      return r.ok
        ? text({ id: r.id, status: "SCHEDULED", scheduledAt: when.toISOString(), note: "Zamanlandı. Yayın saati gelene kadar uygulamadan iptal edilebilir." })
        : fail(r.error);
    },
  );

  server.registerTool(
    "delete_draft",
    { description: "Delete a DRAFT post. Scheduled and published posts cannot be deleted here.", inputSchema: z.object({ id: z.string().min(1) }) },
    async ({ id }) => {
      const { count } = await prisma.post.deleteMany({ where: { id, userId, status: "DRAFT" } });
      return count === 1 ? text({ id, deleted: true }) : fail("Silinebilecek bir taslak bulunamadı.");
    },
  );

  return server;
}
