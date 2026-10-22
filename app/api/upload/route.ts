import { auth } from "@/auth";
import { ALLOWED_MEDIA_TYPES } from "@/lib/media";
import { storeMediaBytes } from "@/lib/media-store";
import { takeToken } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";

/** Uploads are cheap to start and expensive on disk: keep one account from filling the server in a loop. */
const UPLOAD_LIMIT = { count: 40, windowMs: 10 * 60_000 };

/**
 * Upload endpoint for the post form. Validation and storage live in `lib/media-store.ts`, shared with AI image generation so
 * both paths accept exactly the same formats and produce URLs `isAllowedMediaUrl` accepts.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Giriş gerekli" }, { status: 401 });

  const limit = takeToken(`upload:${session.user.id}`, UPLOAD_LIMIT.count, UPLOAD_LIMIT.windowMs);
  if (!limit.ok) {
    return Response.json(
      { error: `Çok fazla yükleme. ${limit.retryAfterSec} sn sonra tekrar dene.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Dosya bulunamadı" }, { status: 400 });

  if (!ALLOWED_MEDIA_TYPES[file.type]) return Response.json({ error: "Desteklenmeyen dosya türü (JPG, PNG, GIF, MP4)" }, { status: 415 });

  try {
    const stored = await storeMediaBytes(new Uint8Array(await file.arrayBuffer()), file.type);
    return Response.json(stored);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Yükleme başarısız";
    // Size and signature problems are the caller's fault (413/415); anything else is ours
    const status = /çok büyük/.test(message) ? 413 : /uyuşmuyor|Desteklenmeyen/.test(message) ? 415 : 502;
    if (status === 502) console.error("upload failed", e);
    return Response.json({ error: message }, { status });
  }
}
