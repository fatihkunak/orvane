import { z } from "zod";
import { Platform } from "@/generated/prisma/enums";
import { overLimit } from "@/lib/char-count";
import { MAX_MEDIA_FILES, isAllowedMediaUrl } from "@/lib/media";
import { PLATFORMS } from "@/lib/platforms";

export const POST_MODES = ["draft", "schedule", "now"] as const;

export const createPostSchema = z
  .object({
    /** The text for every platform without its own text in `overrides` (may be empty when all have one) */
    text: z.string().trim().default(""),
    platforms: z.array(z.enum(Platform)).min(1, "En az bir platform seç"),
    /** Text written for one platform only; it replaces `text` there */
    overrides: z.partialRecord(z.enum(Platform), z.string().trim().min(1, "Platform metni boş olamaz")).default({}),
    mediaUrls: z
      .array(z.string().refine(isAllowedMediaUrl, "Geçersiz medya adresi"))
      .max(MAX_MEDIA_FILES, `En fazla ${MAX_MEDIA_FILES} medya`),
    mode: z.enum(POST_MODES),
    /** ISO string with timezone offset (built in the browser from the local date/time inputs) */
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    for (const p of Object.keys(v.overrides) as Platform[]) {
      if (!v.platforms.includes(p)) ctx.addIssue({ code: "custom", path: ["overrides", p], message: `${PLATFORMS[p].label} seçili değil` });
    }
    const sharedFor = v.platforms.filter((p) => !v.overrides[p]);
    if (sharedFor.length && !v.text) ctx.addIssue({ code: "custom", path: ["text"], message: "Gönderi metni boş olamaz" });
    const over = [...overLimit(sharedFor, v.text), ...v.platforms.filter((p) => v.overrides[p] && overLimit([p], v.overrides[p]).length)];
    if (over.length) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `Karakter sınırı aşıldı: ${over.map((p) => PLATFORMS[p].label).join(", ")}`,
      });
    }
    if (v.mode === "schedule") {
      if (!v.scheduledAt) {
        ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Tarih ve saat seç" });
      } else if (new Date(v.scheduledAt).getTime() < Date.now() - 60_000) {
        ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Zamanlama geçmişte olamaz" });
      }
    }
  });

export type CreatePostInput = z.input<typeof createPostSchema>;
