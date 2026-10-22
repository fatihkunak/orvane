/** Upload rules shared by the upload route and the form. */
export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "video/mp4": "mp4",
};

export const MAX_MEDIA_FILES = 4; // X allows up to 4 photos or 1 video per post
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // X image limit
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export type MediaKind = "image" | "video";

/** Works for Cloudinary URLs (/video/upload/...) and plain file extensions. */
export function mediaKind(url: string): MediaKind {
  const path = url.split("?")[0].toLowerCase();
  if (path.includes("/video/upload/") || path.endsWith(".mp4")) return "video";
  return "image";
}

/** Local dev uploads are stored as relative URLs; publishers need an absolute one. */
export function absoluteMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return new URL(url, base).toString();
}

const LOCAL_MEDIA_PREFIX = "/api/media/";
const LOCAL_MEDIA_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|mp4)$/;

/**
 * File names of THIS app's local uploads in a set of media URLs. Anything else (Cloudinary, a foreign path) is ignored, so a
 * stored URL can never point at a file outside `.uploads`. Used by account deletion and the media sweeper.
 */
export function localMediaNames(urls: Iterable<string>): string[] {
  const names = new Set<string>();
  for (const u of urls) {
    if (!u.startsWith(LOCAL_MEDIA_PREFIX)) continue;
    const name = u.slice(LOCAL_MEDIA_PREFIX.length);
    if (LOCAL_MEDIA_NAME.test(name)) names.add(name);
  }
  return [...names];
}

/** Inverse of `localMediaNames`: the URL a local file is served from. */
export const localMediaUrl = (name: string) => `${LOCAL_MEDIA_PREFIX}${name}`;

const LOCAL_MEDIA = /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|mp4)$/;

/** Cloud name from CLOUDINARY_URL (cloudinary://key:secret@<cloud>), without ever touching the secret. */
export function cloudinaryCloudName(): string | null {
  const raw = process.env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Only media this app stored itself may be attached to a post: a local upload (random UUID name)
 * or a file on our own Cloudinary account. Anything else is rejected, because publishers download
 * these URLs server-side and an arbitrary URL would be an SSRF vector (e.g. cloud metadata endpoints).
 */
export function isAllowedMediaUrl(url: string): boolean {
  if (LOCAL_MEDIA.test(url)) return true;
  const cloud = cloudinaryCloudName();
  if (!cloud) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && u.pathname.startsWith(`/${cloud}/`);
  } catch {
    return false;
  }
}

/** Checks the file's magic bytes, so the client-declared MIME type alone cannot smuggle other content in. */
export function matchesSignature(mime: string, b: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  switch (mime) {
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47);
    case "image/gif":
      return at(0, 0x47, 0x49, 0x46, 0x38); // "GIF8"
    case "video/mp4":
      return at(4, 0x66, 0x74, 0x79, 0x70); // "ftyp" box
    default:
      return false;
  }
}
