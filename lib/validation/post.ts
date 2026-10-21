import { z } from "zod";
import { Platform } from "@/generated/prisma/enums";
import { overLimit } from "@/lib/char-count";
import { MAX_MEDIA_FILES, isAllowedMediaUrl } from "@/lib/media";
import { PLATFORMS } from "@/lib/platforms";

export const POST_MODES = ["draft", "schedule", "now"] as const;

export const createPostSchema = z
  .object({
    text: z.string().trim().min(1, "Gönderi metni boş olamaz"),
    platforms: z.array(z.enum(Platform)).min(1, "En az bir platform seç"),
    mediaUrls: z
      .array(z.string().refine(isAllowedMediaUrl, "Geçersiz medya adresi"))
      .max(MAX_MEDIA_FILES, `En fazla ${MAX_MEDIA_FILES} medya`),
    mode: z.enum(POST_MODES),
    /** ISO string with timezone offset (built in the browser from the local date/time inputs) */
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    const over = overLimit(v.platforms, v.text);
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
