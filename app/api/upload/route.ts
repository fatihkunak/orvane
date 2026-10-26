import { auth } from "@/auth";
import { ALLOWED_MEDIA_TYPES, MAX_VIDEO_BYTES } from "@/lib/media";
import { storeMediaBytes } from "@/lib/media-store";
import { takeToken } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";

/** Uploads are cheap to start and expensive on disk: keep one account from filling the server in a loop. */
const UPLOAD_LIMIT = { count: 40, windowMs: 10 * 60_000 };

/**
 * Parses the multipart body like `req.formData()`, but counts the bytes as they stream in and cuts the request off once
 * they pass `max`, so an oversized body is never held in memory in full. `exceeded()` tells the caller why parsing failed.
 */
function readFormCapped(req: Request, max: number) {
  let seen = 0;
  let over = false;
  const contentType = req.headers.get("content-type");
  if (!req.body || !contentType) return { form: Promise.reject(new Error("no body")) as Promise<FormData>, exceeded: () => false };

  const limited = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          over = true;
          controller.error(new Error("body too large"));
        } else controller.enqueue(chunk);
      },
    }),
  );
  return { form: new Response(limited, { headers: { "content-type": contentType } }).formData(), exceeded: () => over };
}

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

  // Refuse an oversized body before it is buffered into memory (multipart overhead gets a small allowance)
  const maxBody = MAX_VIDEO_BYTES + 1024 * 1024;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBody) {
    return Response.json({ error: "Dosya çok büyük" }, { status: 413 });
  }

  // The header can be missing (chunked upload) or wrong, so the limit is enforced on the bytes themselves as they arrive
  const capped = readFormCapped(req, maxBody);
  const form = await capped.form.catch(() => null);
  if (capped.exceeded()) return Response.json({ error: "Dosya çok büyük" }, { status: 413 });
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
