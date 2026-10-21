import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { ALLOWED_MEDIA_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, matchesSignature } from "@/lib/media";

export const runtime = "nodejs";

// Route files may only export HTTP handlers/config, so this stays module-private
const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

/** CLOUDINARY_URL looks like cloudinary://<api_key>:<api_secret>@<cloud_name> */
function cloudinaryConfig() {
  const raw = process.env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { apiKey: decodeURIComponent(u.username), apiSecret: decodeURIComponent(u.password), cloud: u.hostname };
  } catch {
    return null;
  }
}

async function uploadToCloudinary(file: File, cfg: NonNullable<ReturnType<typeof cloudinaryConfig>>) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = "synapse";
  // Signature = sha1 of the sorted "key=value" params (excluding file/api_key) + api secret
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${cfg.apiSecret}`).digest("hex");

  const body = new FormData();
  body.set("file", file);
  body.set("api_key", cfg.apiKey);
  body.set("timestamp", timestamp);
  body.set("folder", folder);
  body.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/auto/upload`, { method: "POST", body });
  const json = (await res.json()) as { secure_url?: string; error?: { message: string } };
  if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? `Cloudinary ${res.status}`);
  return json.secure_url;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Giriş gerekli" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Dosya bulunamadı" }, { status: 400 });

  const ext = ALLOWED_MEDIA_TYPES[file.type];
  if (!ext) return Response.json({ error: "Desteklenmeyen dosya türü (JPG, PNG, GIF, MP4)" }, { status: 415 });

  const isVideo = file.type.startsWith("video/");
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    return Response.json({ error: `Dosya çok büyük (en fazla ${Math.round(max / 1024 / 1024)} MB)` }, { status: 413 });
  }

  // The declared MIME type is client-controlled; make sure the bytes really are that format
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!matchesSignature(file.type, head)) {
    return Response.json({ error: "Dosya içeriği türüyle uyuşmuyor" }, { status: 415 });
  }

  try {
    const cfg = cloudinaryConfig();
    if (cfg) return Response.json({ url: await uploadToCloudinary(file, cfg), kind: isVideo ? "video" : "image" });

    // Dev fallback: keep the file on disk and serve it from /api/media/<name>.
    // Not suitable for production (and Threads cannot fetch localhost URLs), so configure Cloudinary there.
    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
    return Response.json({ url: `/api/media/${name}`, kind: isVideo ? "video" : "image" });
  } catch (e) {
    console.error("upload failed", e);
    return Response.json({ error: "Yükleme başarısız" }, { status: 502 });
  }
}
