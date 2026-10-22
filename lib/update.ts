import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Self-update for a git checkout of Orvane (the way this app is deployed: `deploy/start-app.cmd` over a clone).
 *
 * Two separate things live here:
 *   - reading the LOCAL commit and asking GitHub what main has now (read-only, no privileges)
 *   - starting `deploy/update.cmd`, which actually pulls, installs, migrates, builds and restarts the app
 *
 * The second one runs arbitrary code from the repository on this machine, so it is off unless ORVANE_UPDATE_ENABLED=1 and the
 * signed-in person's e-mail matches ORVANE_OWNER_EMAIL. No other account can reach it, not even an admin token.
 */

const run = promisify(execFile);
const TIMEOUT_MS = 15_000;

export interface CommitInfo {
  sha: string;
  short: string;
  /** ISO date of the commit */
  date: string | null;
  subject: string;
}

export interface UpdateStatus {
  current: CommitInfo | null;
  latest: CommitInfo | null;
  /** Commits GitHub has that we do not (newest first) */
  behind: CommitInfo[];
  updateAvailable: boolean;
  /** Set when the comparison could not be made (no git, GitHub unreachable, rate limit) */
  note?: string;
  checkedAt: string;
}

export const updateEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ORVANE_UPDATE_ENABLED === "1";

/** Empty/missing ORVANE_OWNER_EMAIL denies everyone: fail closed. */
export function isUpdateOwner(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const owner = (env.ORVANE_OWNER_EMAIL ?? "").trim().toLowerCase();
  return owner.length > 0 && (email ?? "").trim().toLowerCase() === owner;
}

export const updateRepo = (env: NodeJS.ProcessEnv = process.env) => (env.ORVANE_REPO ?? "").trim() || "fatihkunak/orvane";
const updateBranch = (env: NodeJS.ProcessEnv = process.env) => (env.ORVANE_BRANCH ?? "").trim() || "main";

/** `[{sha, commit:{message, author:{date}}}]` from the GitHub commits API → CommitInfo[] */
export function parseGithubCommits(json: unknown): CommitInfo[] {
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((raw) => {
      const c = raw as { sha?: unknown; commit?: { message?: unknown; author?: { date?: unknown } } };
      const sha = typeof c?.sha === "string" ? c.sha : "";
      const message = typeof c?.commit?.message === "string" ? c.commit.message : "";
      const date = typeof c?.commit?.author?.date === "string" ? c.commit.author.date : null;
      if (!sha) return null;
      return { sha, short: sha.slice(0, 7), date, subject: message.split("\n")[0]!.slice(0, 140) };
    })
    .filter((x): x is CommitInfo => x !== null);
}

/**
 * Which commits we are missing. `remote` is newest first, as GitHub returns it. When the local sha is not in the list (a
 * shallow clone, a detached build, a branch behind by more than a page) everything newer than our date counts as missing and
 * the caller shows a note instead of pretending to know exactly.
 */
export function compareCommits(local: CommitInfo | null, remote: readonly CommitInfo[]): { behind: CommitInfo[]; updateAvailable: boolean; note?: string } {
  if (!local) return { behind: [], updateAvailable: false, note: "Yerel sürüm okunamadı (git deposu yok ya da git kurulu değil)." };
  if (remote.length === 0) return { behind: [], updateAvailable: false, note: "GitHub'dan commit listesi alınamadı." };
  const at = remote.findIndex((c) => c.sha === local.sha);
  if (at >= 0) return { behind: remote.slice(0, at), updateAvailable: at > 0 };
  // Not found: assume everything newer than our commit date is missing
  const newer = local.date ? remote.filter((c) => c.date && local.date && c.date > local.date) : [];
  return { behind: newer, updateAvailable: newer.length > 0, note: "Yerel commit GitHub listesinde yok; fark yaklaşık hesaplandı." };
}

async function git(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run("git", args, { cwd: process.cwd(), timeout: TIMEOUT_MS, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** The commit this running app was built from. Null when the deployment is not a git checkout. */
export async function readLocalCommit(): Promise<CommitInfo | null> {
  const sha = await git(["rev-parse", "HEAD"]);
  if (!sha) return null;
  const meta = await git(["show", "-s", "--format=%cI%n%s", "HEAD"]);
  const [date, subject] = (meta ?? "").split("\n");
  return { sha, short: sha.slice(0, 7), date: date || null, subject: (subject ?? "").slice(0, 140) };
}

async function readRemoteCommits(slug: string, branch: string): Promise<{ commits: CommitInfo[]; note?: string }> {
  const url = `https://api.github.com/repos/${slug}/commits?sha=${encodeURIComponent(branch)}&per_page=20`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/vnd.github+json", "user-agent": "orvane" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 403 || res.status === 429) return { commits: [], note: "GitHub istek sınırı; biraz sonra tekrar dene." };
    if (res.status === 404) return { commits: [], note: `Depo bulunamadı: ${slug}` };
    if (!res.ok) return { commits: [], note: `GitHub ${res.status}` };
    return { commits: parseGithubCommits(await res.json()) };
  } catch {
    return { commits: [], note: "GitHub'a ulaşılamadı." };
  }
}

export async function checkForUpdate(env: NodeJS.ProcessEnv = process.env): Promise<UpdateStatus> {
  const slug = updateRepo(env);
  const branch = updateBranch(env);
  const [local, remote] = await Promise.all([readLocalCommit(), readRemoteCommits(slug, branch)]);
  const cmp = compareCommits(local, remote.commits);
  const note = remote.note ?? cmp.note;
  return {
    current: local,
    latest: remote.commits[0] ?? null,
    behind: cmp.behind,
    updateAvailable: cmp.updateAvailable,
    ...(note ? { note } : {}),
    checkedAt: new Date().toISOString(),
  };
}

export const UPDATE_LOG = path.join("deploy", "logs", "update.log");

/**
 * Starts the update script in its own process, from a temporary copy: the script rewrites the repository (git pull) while it
 * runs, so it must not be the file being read from disk. Returns as soon as the process is spawned -- the HTTP request that
 * triggered it must not be killed together with the server.
 */
export async function startUpdate(env: NodeJS.ProcessEnv = process.env): Promise<{ logPath: string }> {
  if (process.platform !== "win32") {
    throw new Error("Otomatik güncelleme yalnızca Windows kurulumunda (deploy/update.cmd) destekleniyor. Elle: git pull && npm ci && npx prisma migrate deploy && npm run build");
  }
  const repo = process.cwd();
  const script = path.join(repo, "deploy", "update.cmd");
  const dir = await mkdtemp(path.join(tmpdir(), "orvane-update-"));
  const copy = path.join(dir, "update.cmd");
  await copyFile(script, copy);

  const child = spawn("cmd.exe", ["/c", copy, repo], { detached: true, stdio: "ignore", windowsHide: true, env });
  child.unref();
  return { logPath: path.join(repo, UPDATE_LOG) };
}
