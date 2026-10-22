import "server-only";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { isAllowedMediaUrl, localMediaNames, localMediaUrl } from "@/lib/media";
import { deleteCloudinaryAsset } from "@/lib/cloudinary";

/**
 * Media housekeeping. An asset is only deleted when NO post or platform row points at it any more: two posts can legitimately
 * share one upload (a draft copied from a form), and deleting one must not break the other.
 *
 * Two kinds of media, two mechanisms:
 *   - local files under `.uploads` are unlinked (and the daily sweep finds leftovers nobody references)
 *   - Cloudinary assets are removed through the Admin API, one URL at a time -- we cannot enumerate someone's account, so only
 *     the assets a deleted post/account actually used are touched.
 */

export const uploadsDir = () => path.join(process.cwd(), ".uploads");

/** Is this media URL still used by any post or platform row (any user)? */
async function isReferencedUrl(url: string): Promise<boolean> {
  const count = await prisma.post.count({
    where: { OR: [{ mediaUrls: { has: url } }, { platforms: { some: { mediaUrls: { has: url } } } }] },
  });
  return count > 0;
}

/** Deletes the media in `urls` that nothing references any more (local files and Cloudinary assets). */
export async function removeUnreferencedMedia(urls: Iterable<string>): Promise<number> {
  const all = [...urls];
  let removed = 0;

  for (const name of localMediaNames(all)) {
    const url = localMediaUrl(name);
    if (await isReferencedUrl(url)) continue;
    try {
      await unlink(path.join(uploadsDir(), name));
      removed++;
    } catch {
      // already gone, or never written on this machine
    }
  }

  for (const url of new Set(all)) {
    if (url.startsWith("/api/media/")) continue; // local, handled above
    if (!isAllowedMediaUrl(url)) continue; // not our asset: never touch it
    if (await isReferencedUrl(url)) continue;
    if (await deleteCloudinaryAsset(url)) removed++;
  }

  return removed;
}

/**
 * Removes leftover LOCAL uploads: files nobody references and that are older than `minAgeMs`. The age guard is what makes this
 * safe -- a file uploaded into a form that is still open (or a request that is still finishing) must not be swept away.
 * Cloudinary is not swept: there is no way to list "unused" assets without walking the account, so those are only deleted with
 * the post that used them (see `removeUnreferencedMedia`).
 */
export async function sweepOrphanMedia(
  { minAgeMs = 24 * 60 * 60_000, now = Date.now() }: { minAgeMs?: number; now?: number } = {},
): Promise<{ checked: number; removed: number }> {
  let entries: string[];
  try {
    entries = await readdir(uploadsDir());
  } catch {
    return { checked: 0, removed: 0 }; // no local storage on this deployment
  }

  let checked = 0;
  let removed = 0;
  for (const name of entries) {
    if (localMediaNames([localMediaUrl(name)]).length === 0) continue; // foreign file, not ours to delete
    checked++;
    const full = path.join(uploadsDir(), name);
    try {
      const info = await stat(full);
      if (!info.isFile() || now - info.mtimeMs < minAgeMs) continue;
      if (await isReferencedUrl(localMediaUrl(name))) continue;
      await unlink(full);
      removed++;
    } catch {
      // vanished between readdir and stat, or not deletable: skip it, the next sweep retries
    }
  }
  return { checked, removed };
}
