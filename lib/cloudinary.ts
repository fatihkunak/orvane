import { createHash } from "node:crypto";
import { cloudinaryCloudName } from "@/lib/media";

/**
 * Cloudinary helpers shared by the upload path and media deletion.
 *
 * CLOUDINARY_URL looks like `cloudinary://<api_key>:<api_secret>@<cloud_name>`. The secret never leaves this process: it is
 * only used to sign a request, and nothing here logs it.
 */

export interface CloudinaryConfig {
  apiKey: string;
  apiSecret: string;
  cloud: string;
}

export function cloudinaryConfig(env: NodeJS.ProcessEnv = process.env): CloudinaryConfig | null {
  const raw = env.CLOUDINARY_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const apiKey = decodeURIComponent(u.username);
    const apiSecret = decodeURIComponent(u.password);
    if (!u.hostname || !apiKey || !apiSecret) return null;
    return { apiKey, apiSecret, cloud: u.hostname };
  } catch {
    return null;
  }
}

/**
 * The public_id of one of OUR assets, from its delivery URL. Only URLs on our own cloud name are accepted, so a stored URL
 * cannot be turned into a delete request against someone else's Cloudinary account.
 *
 *   https://res.cloudinary.com/<cloud>/image/upload/v1712/orvane/abc.png  ->  orvane/abc
 *   https://res.cloudinary.com/<cloud>/video/upload/v1712/orvane/abc.mp4  ->  orvane/abc
 */
export function cloudinaryPublicId(url: string, env: NodeJS.ProcessEnv = process.env): { publicId: string; resource: "image" | "video" } | null {
  const cloud = cloudinaryCloudName(env);
  if (!cloud) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com") return null;

  // path: /<cloud>/<resource>/upload/[transformation/]v<version>/<public_id>.<ext>
  const parts = u.pathname.split("/").filter(Boolean);
  const [pathCloud, resource, kind, ...rest] = parts as [string, "image" | "video", string, ...string[]];
  if (pathCloud !== cloud || (resource !== "image" && resource !== "video") || kind !== "upload" || rest.length === 0) return null;

  // Everything before a `v<digits>` segment is a transformation; the public id starts after it (or at the top when there is no
  // version segment at all, which Cloudinary allows).
  const versionAt = rest.findIndex((p) => /^v\d+$/.test(p));
  const idParts = versionAt >= 0 ? rest.slice(versionAt + 1) : rest;
  const publicId = idParts.join("/").replace(/\.[a-z0-9]+$/i, "");
  return publicId ? { publicId, resource } : null;
}

/**
 * Deletes one asset from our Cloudinary account (Admin API `destroy`, signed with the API secret). Returns true when the asset
 * is gone -- including "not found", which is the state we want. Never throws: a deletion failure must not block removing a post.
 */
export async function deleteCloudinaryAsset(
  url: string,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number } = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const cfg = cloudinaryConfig(env);
  if (!cfg) return false;
  const parsed = cloudinaryPublicId(url, env);
  if (!parsed) return false;

  const timestamp = String(Math.floor((opts.now ?? Date.now()) / 1000));
  // Sorted params (only public_id + timestamp) then the secret
  const signature = createHash("sha1").update(`public_id=${parsed.publicId}&timestamp=${timestamp}${cfg.apiSecret}`).digest("hex");

  const body = new URLSearchParams({ public_id: parsed.publicId, api_key: cfg.apiKey, timestamp, signature });
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/${parsed.resource}/destroy`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => ({}))) as { result?: string };
    // Cloudinary answers "ok" or "not found" (already gone)
    return json.result === "ok" || json.result === "not found";
  } catch {
    return false;
  }
}
