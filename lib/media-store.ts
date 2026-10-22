import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_MEDIA_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, matchesSignature, type MediaKind } from "@/lib/media";

/**
 * Where post media is written. One entry point for BOTH the upload route (the person picks a file) and AI image generation
 * (the server produced the bytes), so generated images obey exactly the same rules: allowed types only, magic bytes checked,
 * size capped, and a URL that `isAllowedMediaUrl` accepts later.
 */

const UPLOAD_DIR = path.join(process.cwd(), ".uploads");
const FOLDER = "orvane";

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

async function uploadToCloudinary(bytes: Uint8Array, mime: string, name: string, cfg: NonNullable<ReturnType<typeof cloudinaryConfig>>) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Signature = sha1 of the sorted "key=value" params (excluding file/api_key) + api secret
  const signature = createHash("sha1").update(`folder=${FOLDER}&timestamp=${timestamp}${cfg.apiSecret}`).digest("hex");

  const body = new FormData();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  body.set("file", new File([buf], name, { type: mime }));
  body.set("api_key", cfg.apiKey);
  body.set("timestamp", timestamp);
  body.set("folder", FOLDER);
  body.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/auto/upload`, { method: "POST", body });
  const json = (await res.json()) as { secure_url?: string; error?: { message: string } };
  if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? `Cloudinary ${res.status}`);
  return json.secure_url;
}

/**
 * Validates and stores one file. Throws an Error whose message is safe to show the user ("Desteklenmeyen dosya türü").
 * Local storage is the development fallback: Threads cannot fetch localhost URLs, so production needs CLOUDINARY_URL.
 */
export async function storeMediaBytes(bytes: Uint8Array, mime: string): Promise<{ url: string; kind: MediaKind }> {
  const ext = ALLOWED_MEDIA_TYPES[mime];
  if (!ext) throw new Error("Desteklenmeyen dosya türü (JPG, PNG, GIF, MP4)");

  const kind: MediaKind = mime.startsWith("video/") ? "video" : "image";
  const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (bytes.length > max) throw new Error(`Dosya çok büyük (en fazla ${Math.round(max / 1024 / 1024)} MB)`);

  // The declared type is not trusted: the bytes themselves must be that format
  if (!matchesSignature(mime, bytes.subarray(0, 12))) throw new Error("Dosya içeriği türüyle uyuşmuyor");

  const name = `${randomUUID()}.${ext}`;
  const cfg = cloudinaryConfig();
  if (cfg) return { url: await uploadToCloudinary(bytes, mime, name, cfg), kind };

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), bytes);
  return { url: `/api/media/${name}`, kind };
}
