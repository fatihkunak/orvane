import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareCommits, isUpdateOwner, parseGithubCommits, updateEnabled, updateInvocation, updateRepo } from "@/lib/update";

/** Pure parts of the self-update layer. Nothing here runs git, hits GitHub or starts the update script. */

const c = (short: string, date = "2026-10-01T10:00:00Z") => ({ sha: `${short}0000000000000000000000000000000000000`, short, date, subject: `commit ${short}` });

describe("GitHub commit parsing", () => {
  it("takes sha, first line and date; ignores junk", () => {
    const parsed = parseGithubCommits([
      { sha: "abcdef1234567", commit: { message: "subject here\n\nbody", author: { date: "2026-10-02T09:00:00Z" } } },
      { commit: { message: "no sha" } },
      { sha: "", commit: { message: "empty sha" } },
      null,
    ]);
    expect(parsed).toEqual([{ sha: "abcdef1234567", short: "abcdef1", date: "2026-10-02T09:00:00Z", subject: "subject here" }]);
    expect(parseGithubCommits({ not: "an array" })).toEqual([]);
  });
});

describe("comparing local with GitHub", () => {
  const remote = [c("ccc", "2026-10-03T10:00:00Z"), c("bbb", "2026-10-02T10:00:00Z"), c("aaa", "2026-10-01T10:00:00Z")]; // newest first

  it("counts only the commits above the local one", () => {
    expect(compareCommits(remote[1]!, remote)).toMatchObject({ updateAvailable: true });
    expect(compareCommits(remote[1]!, remote).behind.map((x) => x.short)).toEqual(["ccc"]);
  });

  it("is up to date when the local commit is the newest", () => {
    expect(compareCommits(remote[0]!, remote)).toMatchObject({ updateAvailable: false, behind: [] });
  });

  it("falls back to dates when the local commit is not in the list, and says so", () => {
    const local = { ...c("zzz", "2026-10-02T12:00:00Z") };
    const r = compareCommits(local, remote);
    expect(r.behind.map((x) => x.short)).toEqual(["ccc"]); // only strictly newer than 02T12:00Z
    expect(r.updateAvailable).toBe(true);
    expect(r.note).toMatch(/yaklaşık/);
  });

  it("reports why it could not compare instead of pretending", () => {
    expect(compareCommits(null, remote)).toMatchObject({ updateAvailable: false });
    expect(compareCommits(null, remote).note).toMatch(/Yerel sürüm okunamadı/);
    expect(compareCommits(remote[0]!, []).note).toMatch(/GitHub'dan commit listesi alınamadı/);
  });
});

describe("who may update", () => {
  it("is off unless the flag is exactly 1", () => {
    expect(updateEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(updateEnabled({ ORVANE_UPDATE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(updateEnabled({ ORVANE_UPDATE_ENABLED: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("fails closed when no owner is configured, and matches the e-mail case-insensitively", () => {
    expect(isUpdateOwner("a@b.c", {} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isUpdateOwner("a@b.c", { ORVANE_OWNER_EMAIL: "  " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isUpdateOwner("a@b.c", { ORVANE_OWNER_EMAIL: "A@B.C" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isUpdateOwner("x@b.c", { ORVANE_OWNER_EMAIL: "a@b.c" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isUpdateOwner(null, { ORVANE_OWNER_EMAIL: "a@b.c" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("tracks the public repo by default and allows an override", () => {
    expect(updateRepo({} as unknown as NodeJS.ProcessEnv)).toBe("fatihkunak/orvane");
    expect(updateRepo({ ORVANE_REPO: "me/fork" } as unknown as NodeJS.ProcessEnv)).toBe("me/fork");
  });

  it("starts the right script for the platform", () => {
    expect(updateInvocation("win32", "C:\\tmp\\update.cmd", "C:\\repo")).toEqual({
      command: "cmd.exe",
      args: ["/c", "C:\\tmp\\update.cmd", "C:\\repo"],
    });
    expect(updateInvocation("linux", "/tmp/update.sh", "/srv/orvane")).toEqual({
      command: "bash",
      args: ["/tmp/update.sh", "/srv/orvane"],
    });
    expect(updateInvocation("darwin", "/tmp/update.sh", "/Users/x/orvane").command).toBe("bash");
  });

  /**
   * cmd closes a `|| ( ... )` block at the FIRST ")", so `echo UPDATE FAILED (backup) ...` inside one breaks the script with
   * "- was unexpected at this time". That is exactly what happened when the Windows updater was finally executed; CI runs on
   * Linux and can never catch it, so the shape is checked statically here.
   */
  it("keeps parenthesised error blocks free of stray parentheses", () => {
    const script = readFileSync(path.join(process.cwd(), "deploy", "update.cmd"), "utf8");
    const offenders = script
      .split(/\r?\n/)
      .filter((line) => line.includes("|| ("))
      .filter((line) => (line.match(/\(/g) ?? []).length > 1);
    expect(offenders).toEqual([]);
  });
});
