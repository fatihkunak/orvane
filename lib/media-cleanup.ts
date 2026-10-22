import "server-only";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { localMediaNames, localMediaUrl } from "@/lib/media";

/**
 * Local media housekeeping. A file under `.uploads` is only deleted when NO post or platform row points at it any more: two
 * posts can legitimately share one upload (a draft copied from a form), and deleting one must not break the other.
 *
 * Cloudinary objects are out of scope here: the app never calls the destroy endpoint (see PRIVACY.md).
 */

export const uploadsDir = () => path.join(process.cwd(), ".uploads");

async function isReferenced(name: string): Promise<boolean> {
  const url = localMediaUrl(name);
  const count = await prisma.post.count({
    where: { OR: [{ mediaUrls: { has: url } }, { platforms: { some: { mediaUrls: { has: url } } } }] },
  });
  return count > 0;
}

/** Deletes the local files in `urls` that nothing references any more. Returns how many files went away. */
export async function removeUnreferencedMedia(urls: Iterable<string>): Promise<number> {
  let removed = 0;
  for (const name of localMediaNames(urls)) {
    if (await isReferenced(name)) continue;
    try {
      await unlink(path.join(uploadsDir(), name));
      removed++;
    } catch {
      // already gone, or never written on this machine
    }
  }
  return removed;
}

/**
 * Removes leftover uploads: files nobody references and that are older than `minAgeMs`. The age guard is what makes this safe
 * -- a file uploaded into a form that is still open (or a request that is still finishing) must not be swept away.
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
      if (await isReferenced(name)) continue;
      await unlink(full);
      removed++;
    } catch {
      // vanished between readdir and stat, or not deletable: skip it, the next sweep retries
    }
  }
  return { checked, removed };
}
