import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Pre-migration database dump for the self-update flow (deploy/update.cmd runs it before `prisma migrate deploy`).
 *
 * Deliberately best-effort: a machine without the Postgres client tools still gets its updates (the script says the backup was
 * skipped and exits 0). A dump that STARTS and fails exits 1, and update.cmd then aborts before touching the schema.
 */

const run = promisify(execFile);
const LOG_DIR = path.join("deploy", "logs");
const KEEP = 5;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("backup: DATABASE_URL/DIRECT_URL tanımlı değil, yedek atlandı");
  process.exit(0);
}

try {
  await run("pg_dump", ["--version"], { windowsHide: true });
} catch {
  console.log("backup: pg_dump bulunamadı (Postgres client tools kurulu değil), yedek ATLANDI - migration devam edecek");
  process.exit(0);
}

await mkdir(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(LOG_DIR, `backup-${stamp}.sql`);

try {
  await run("pg_dump", ["--no-owner", "--no-privileges", "--file", file, url], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
} catch (e) {
  // Never print the URL: it carries the password
  console.error("backup: pg_dump başarısız -", String(e?.message ?? e).split("\n")[0].replace(url, "***").slice(0, 200));
  process.exit(1);
}

// Keep the newest KEEP dumps, delete the rest
try {
  const dumps = (await readdir(LOG_DIR)).filter((f) => f.startsWith("backup-") && f.endsWith(".sql")).sort();
  for (const old of dumps.slice(0, Math.max(0, dumps.length - KEEP))) await unlink(path.join(LOG_DIR, old));
} catch {
  // rotation is a convenience, not a requirement
}

console.log("backup:", file);
