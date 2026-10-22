import { readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Log rotation for the update flow. `deploy/update.cmd` / `update.sh` call this right after the app is stopped, so the files are
 * not held open (on Windows a running process keeps its log locked and a rename would fail).
 *
 * app.log and inngest.log grow forever otherwise: every request line is appended, and a busy instance eats disk. update.log is
 * left alone -- this run is writing to it.
 */

const DIR = path.join("deploy", "logs");
const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB
const KEEP = 2; // keep the two newest rotated copies per log

for (const name of ["app.log", "inngest.log"]) {
  const file = path.join(DIR, name);
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < MAX_BYTES) continue;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await rename(file, path.join(DIR, `${name}.${stamp}`));
    console.log(`rotate-logs: ${name} -> ${name}.${stamp}`);

    const rotations = (await readdir(DIR)).filter((f) => f.startsWith(`${name}.`)).sort();
    for (const old of rotations.slice(0, Math.max(0, rotations.length - KEEP))) {
      await unlink(path.join(DIR, old));
    }
  } catch (e) {
    // Missing log (nothing to do), or still locked because nothing stopped the app: the next update retries
    if (e && e.code !== "ENOENT") console.log(`rotate-logs: ${name} atlandı (${e.code ?? "hata"})`);
  }
}
