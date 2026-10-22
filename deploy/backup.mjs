import "dotenv/config";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Pre-migration database dump for the self-update flow (deploy/update.cmd runs it before `prisma migrate deploy`).
 *
 * Two ways to find pg_dump, because a dev machine often has Postgres only inside Docker:
 *   1. `pg_dump` on PATH (normal server install)
 *   2. a running Docker container that publishes the same host port as DATABASE_URL (docker-compose.yml setup)
 * If neither is available the backup is skipped with a log line and the update CONTINUES -- an update must not be blocked by
 * missing client tools. A dump that starts and fails exits 1, and update.cmd then aborts before touching the schema.
 *
 * The database URL is never printed (it carries the password).
 */

const run = promisify(execFile);
const LOG_DIR = path.join("deploy", "logs");
const KEEP = 5;

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.log("backup: DATABASE_URL/DIRECT_URL tanımlı değil, yedek atlandı");
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.log("backup: veritabanı adresi okunamadı, yedek atlandı");
  process.exit(0);
}
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "orvane";
const dbUser = decodeURIComponent(parsed.username) || "postgres";
const hostPort = parsed.port || "5432";

async function hasLocalPgDump() {
  try {
    await run("pg_dump", ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** A container publishing the same host port as the database URL, if Docker is around. */
async function findDockerContainer() {
  try {
    const { stdout } = await run("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"], { windowsHide: true, timeout: 15_000 });
    for (const line of stdout.split("\n")) {
      const [name, ports = ""] = line.split("\t");
      if (name && ports.includes(`:${hostPort}->`)) return name.trim();
    }
  } catch {
    // no docker, or the daemon is not running
  }
  return null;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(LOG_DIR, `backup-${stamp}.sql`);
await mkdir(LOG_DIR, { recursive: true });

/** Pipe a child's stdout into the dump file; resolves with the exit code. */
function dumpToFile(cmd, args) {
  return new Promise((resolve) => {
    const out = createWriteStream(file);
    const child = spawn(cmd, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (d) => {
      stderr += String(d).slice(0, 400);
    });
    child.on("error", () => {
      out.end();
      resolve({ code: -1, stderr: "komut çalıştırılamadı" });
    });
    child.on("close", (code) => {
      out.end();
      resolve({ code: code ?? -1, stderr: stderr.replace(url, "***") });
    });
  });
}

let result;
if (await hasLocalPgDump()) {
  result = await dumpToFile("pg_dump", ["--no-owner", "--no-privileges", "--file", file, url]);
} else {
  const container = await findDockerContainer();
  if (!container) {
    console.log("backup: pg_dump yok ve eşleşen Docker konteyneri bulunamadı, yedek ATLANDI - migration devam edecek");
    process.exit(0);
  }
  console.log(`backup: pg_dump yerine Docker konteyneri kullanılıyor (${container} @ :${hostPort})`);
  result = await dumpToFile("docker", ["exec", container, "pg_dump", "-U", dbUser, "-d", dbName, "--no-owner", "--no-privileges"]);
}

if (result.code !== 0) {
  console.error("backup: pg_dump başarısız -", (result.stderr || "").split("\n")[0].slice(0, 200));
  await unlink(file).catch(() => undefined); // do not leave a half-written dump behind
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
