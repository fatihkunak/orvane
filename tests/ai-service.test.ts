import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import type { FetchLike } from "@/lib/ai/client";
import type { GenerateInput } from "@/lib/ai/prompt";
import { resetRateLimits, takeToken } from "@/lib/ai/rate-limit";
import { checkProviderForUser, fetchModelsForUser, generateForUser } from "@/lib/ai/service";
import { listConfigs, loadChain, makePrimary, moveConfig, removeConfig, saveConfig } from "@/lib/ai/store";

let userId: string;
const KEY = "sk-secret-key-1234567890";

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `ai-${Date.now()}@test.local` } })).id;
});
afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } }); // cascades to the provider rows
  await prisma.$disconnect();
});
beforeEach(() => {
  vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", ""); // do not depend on the developer's real .env
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetRateLimits();
  await prisma.aiProviderConfig.deleteMany({ where: { userId } });
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const answer = (...texts: string[]) => json(200, { choices: [{ message: { content: JSON.stringify({ variants: texts.map((text) => ({ text })) }) }, finish_reason: "stop" }] });
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}")) as { model?: string; messages?: Array<{ role: string; content: string }> };
const calls = (f: ReturnType<typeof vi.fn<FetchLike>>) => f.mock.calls.map(([url, init]) => ({ url, ...bodyOf(init), headers: init?.headers as Record<string, string> }));

describe("provider settings store", () => {
  it("stores the key encrypted and never returns it", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const row = await prisma.aiProviderConfig.findFirstOrThrow({ where: { userId } });
    expect(row.apiKey).toMatch(/^v1\./);
    expect(row.apiKey).not.toContain(KEY);
    expect(decrypt(row.apiKey!)).toBe(KEY);

    const view = await listConfigs(userId);
    expect(view).toEqual([{ provider: "groq", hasKey: true, baseUrl: null, model: null, imageModel: null, position: 0 }]);
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect((await loadChain(userId))[0]!.apiKey).toBe(KEY);
  });

  it("keeps the stored key when updating without one, and replaces it when given", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY, model: "m1" });
    await saveConfig(userId, { provider: "groq", model: "m2" });
    expect(await loadChain(userId)).toMatchObject([{ apiKey: KEY, model: "m2" }]);
    await saveConfig(userId, { provider: "groq", apiKey: "another-key-123456", model: "" });
    expect(await loadChain(userId)).toMatchObject([{ apiKey: "another-key-123456", model: null }]);
  });

  it("orders providers and keeps positions contiguous", async () => {
    for (const provider of ["groq", "gemini", "openai"]) await saveConfig(userId, { provider, apiKey: KEY });
    const order = async () => (await listConfigs(userId)).map((p) => p.provider);
    expect(await order()).toEqual(["groq", "gemini", "openai"]);
    await moveConfig(userId, "openai", "up");
    expect(await order()).toEqual(["groq", "openai", "gemini"]);
    expect(await moveConfig(userId, "groq", "up")).toBe(false); // already first
    await makePrimary(userId, "gemini");
    expect(await order()).toEqual(["gemini", "groq", "openai"]);
    await removeConfig(userId, "groq");
    expect((await listConfigs(userId)).map((p) => [p.provider, p.position])).toEqual([["gemini", 0], ["openai", 1]]);
    expect(await removeConfig(userId, "groq")).toBe(false);
  });

  it("validates the input", async () => {
    await expect(saveConfig(userId, { provider: "groq" })).rejects.toMatchObject({ code: "NO_KEY" });
    await expect(saveConfig(userId, { provider: "groq", apiKey: "short" })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(saveConfig(userId, { provider: "nope", apiKey: KEY })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(saveConfig(userId, { provider: "groq", apiKey: KEY, model: "has space" })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(saveConfig(userId, { provider: "custom", apiKey: KEY })).rejects.toMatchObject({ code: "BAD_CONFIG" }); // needs an address
    expect(await listConfigs(userId)).toEqual([]);
    await saveConfig(userId, { provider: "ollama", model: "llama3" }); // local servers need no key
    expect((await listConfigs(userId))[0]).toMatchObject({ provider: "ollama", hasKey: false });
  });

  it("applies the SSRF guard to typed addresses, and ignores addresses for fixed providers", async () => {
    await expect(saveConfig(userId, { provider: "custom", baseUrl: "http://localhost:8080/v1" })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(saveConfig(userId, { provider: "custom", baseUrl: "https://10.0.0.1/v1" })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(saveConfig(userId, { provider: "ollama", baseUrl: "http://192.168.1.5:11434/v1" })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await saveConfig(userId, { provider: "custom", baseUrl: "https://8.8.8.8/v1/" });
    await saveConfig(userId, { provider: "groq", apiKey: KEY, baseUrl: "https://evil.example/v1" });
    const byId = Object.fromEntries((await listConfigs(userId)).map((p) => [p.provider, p]));
    expect(byId.custom!.baseUrl).toBe("https://8.8.8.8/v1");
    expect(byId.groq!.baseUrl).toBeNull();

    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1"); // explicit opt-in for local development
    await saveConfig(userId, { provider: "ollama", baseUrl: "http://192.168.1.5:11434/v1" });
    expect((await listConfigs(userId)).find((p) => p.provider === "ollama")!.baseUrl).toBe("http://192.168.1.5:11434/v1");
  });
});

describe("generation", () => {
  const input: GenerateInput = { mode: "create", brief: "Yeni sürüm yayında", platforms: ["TWITTER"], count: 2 };

  it("asks for a provider first", async () => {
    await expect(generateForUser(userId, input, { fetchImpl: vi.fn() })).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  it("writes drafts with the primary provider and reports counts", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const f = vi.fn<FetchLike>(async () => answer("Birinci taslak #orvane", "İkinci taslak 🚀"));
    const r = await generateForUser(userId, input, { fetchImpl: f });
    expect(r).toMatchObject({ provider: "groq", providerLabel: "Groq", model: "qwen/qwen3.8-27b" });
    expect(r.variants.map((v) => v.text)).toEqual(["Birinci taslak #orvane", "İkinci taslak 🚀"]);
    expect(r.variants[0]!.counts.TWITTER).toBe("Birinci taslak #orvane".length);
    expect(r.tried).toEqual([{ provider: "groq", ok: true }]);
    const [c] = calls(f);
    expect(c!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(c!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(c!.messages![0]!.content).toContain("at most 257 characters");
    expect(c!.messages![1]!.content).toContain("Yeni sürüm yayında");
  });

  it("writes a separate text per platform against each platform's own limit", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const f = vi.fn<FetchLike>(async () => answer("kısa metin"));
    const r = await generateForUser(userId, { ...input, count: 1, platforms: ["TWITTER", "LINKEDIN"], perPlatform: true }, { fetchImpl: f });
    const [x, li] = calls(f);
    expect(calls(f)).toHaveLength(2);
    expect(x!.messages![0]!.content).toContain("at most 257 characters");
    expect(x!.messages![0]!.content).toContain("X: concise");
    expect(x!.messages![0]!.content).not.toContain("LinkedIn:");
    expect(li!.messages![0]!.content).toContain("at most 2760 characters");
    expect(li!.messages![0]!.content).toContain("LinkedIn:");
    expect(Object.keys(r.byPlatform ?? {})).toEqual(["TWITTER", "LINKEDIN"]);
    expect(r.byPlatform!.TWITTER![0]!.counts).toEqual({ TWITTER: "kısa metin".length });
    expect(r.variants).toHaveLength(2);
  });

  it("skips a dead main provider for the remaining platforms in per-platform mode", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async (url) => (url.includes("groq.com") ? json(401, { error: { message: "bad key" } }) : answer("yedek")));
    const r = await generateForUser(userId, { ...input, count: 1, platforms: ["TWITTER", "THREADS", "LINKEDIN"], perPlatform: true }, { fetchImpl: f });
    expect(r.provider).toBe("mistral");
    expect(r.writers!.TWITTER!.providerLabel).toBe("Mistral");
    expect(calls(f).filter((c) => c.url.includes("groq.com"))).toHaveLength(1); // only the first platform tried groq
  });

  it("ignores perPlatform with a single platform", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const f = vi.fn<FetchLike>(async () => answer("x"));
    const r = await generateForUser(userId, { ...input, count: 1, perPlatform: true }, { fetchImpl: f });
    expect(r.byPlatform).toBeUndefined();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("fails over to the backup when the primary rejects the key", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async (url) => (url.includes("groq.com") ? json(401, { error: { message: "bad key" } }) : answer("yedek taslak")));
    const r = await generateForUser(userId, { ...input, count: 1 }, { fetchImpl: f });
    expect(r.provider).toBe("mistral");
    expect(r.tried.map((t) => [t.provider, t.ok, t.code])).toEqual([["groq", false, "AUTH"], ["mistral", true, undefined]]);
  });

  it("tries the preferred provider first", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async () => answer("x"));
    const r = await generateForUser(userId, { ...input, count: 1, providerId: "mistral" }, { fetchImpl: f });
    expect(r.provider).toBe("mistral");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports the first error when every provider fails", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async (url) => (url.includes("groq.com") ? json(402, { error: "credits depleted" }) : json(401, "{}")));
    await expect(generateForUser(userId, input, { fetchImpl: f })).rejects.toMatchObject({ code: "PAYMENT", message: expect.stringContaining("2 sağlayıcı denendi") });
  });

  it("does not fail over when the request itself is rejected", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async () => json(400, { error: { message: "prompt rejected" } }));
    await expect(generateForUser(userId, input, { fetchImpl: f })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("fails over on unparsable output", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    await saveConfig(userId, { provider: "mistral", apiKey: "mistral-key-123456" });
    const f = vi.fn<FetchLike>(async (url) => (url.includes("groq.com") ? json(200, { choices: [{ message: { content: "no json here" } }] }) : answer("a", "b")));
    const r = await generateForUser(userId, input, { fetchImpl: f });
    expect(r.provider).toBe("mistral");
    expect(r.tried[0]).toMatchObject({ provider: "groq", ok: false, code: "BAD_OUTPUT" });
  });

  it("switches to another Gemini model on a per-model quota limit", async () => {
    await saveConfig(userId, { provider: "gemini", apiKey: "gemini-key-123456" });
    const f = vi.fn<FetchLike>(async (_url, init) => (bodyOf(init).model === "gemini-3.8-flash" ? json(429, "{}", { "retry-after": "60" }) : answer("ok")));
    const sleep = vi.fn(async () => {});
    const r = await generateForUser(userId, { ...input, count: 1 }, { fetchImpl: f, sleep });
    expect(r).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash-lite" });
    expect(sleep).not.toHaveBeenCalled(); // 60 s is too long to wait
  });

  it("shortens a draft that is over the limit, once", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const long = "a".repeat(300);
    const f = vi.fn<FetchLike>(async (_url, init) => (bodyOf(init).messages![0]!.content.includes("You shorten") ? answer("kısaltılmış") : answer(long)));
    const r = await generateForUser(userId, { ...input, count: 1 }, { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.variants[0]).toMatchObject({ text: "kısaltılmış", over: [] });
  });

  it("keeps an over-limit draft, flagged, when shortening fails", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const long = "a".repeat(300);
    const f = vi.fn<FetchLike>(async (_url, init) => (bodyOf(init).messages![0]!.content.includes("You shorten") ? json(500, "boom") : answer(long)));
    const r = await generateForUser(userId, { ...input, count: 1 }, { fetchImpl: f });
    expect(r.variants[0]).toMatchObject({ text: long, over: ["TWITTER"] });
  });

  it("rejects bad input before calling any provider", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const f = vi.fn<FetchLike>();
    await expect(generateForUser(userId, { mode: "create", platforms: [] }, { fetchImpl: f })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f).not.toHaveBeenCalled();
  });

  it("never leaks the key through an error", async () => {
    await saveConfig(userId, { provider: "groq", apiKey: KEY });
    const f = vi.fn<FetchLike>(async () => json(401, { error: { message: `Invalid key ${KEY}` } }));
    const err = await generateForUser(userId, input, { fetchImpl: f }).catch((e) => e);
    expect(err.code).toBe("AUTH");
    expect(err.message).not.toContain(KEY);
  });

  it("flags a missing model for providers without a default", async () => {
    await saveConfig(userId, { provider: "nvidia", apiKey: KEY });
    const f = vi.fn<FetchLike>();
    await expect(generateForUser(userId, input, { fetchImpl: f })).rejects.toMatchObject({ code: "BAD_CONFIG", message: expect.stringContaining("model") });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a stored address that no longer passes the SSRF guard", async () => {
    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1");
    await saveConfig(userId, { provider: "ollama", model: "llama3" });
    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", ""); // opt-in switched off again
    const f = vi.fn<FetchLike>();
    await expect(generateForUser(userId, input, { fetchImpl: f })).rejects.toMatchObject({ code: "BAD_CONFIG" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("probing a provider from the settings page", () => {
  it("uses the stored key unless a new one is typed", async () => {
    await saveConfig(userId, { provider: "openrouter", apiKey: KEY });
    const f = vi.fn<FetchLike>(async () => json(200, { data: [{ id: "b" }, { id: "a" }] }));
    expect(await fetchModelsForUser(userId, { provider: "openrouter" }, { fetchImpl: f })).toEqual(["a", "b"]);
    expect(calls(f)[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    await fetchModelsForUser(userId, { provider: "openrouter", apiKey: "typed-key-1234567" }, { fetchImpl: f });
    expect(calls(f)[1]!.headers.authorization).toBe("Bearer typed-key-1234567");
  });

  it("works before anything is saved, but needs a key", async () => {
    const f = vi.fn<FetchLike>(async () => json(200, { choices: [{ message: { content: "OK" }, finish_reason: "stop" }] }));
    await expect(checkProviderForUser(userId, { provider: "groq" }, { fetchImpl: f })).rejects.toMatchObject({ code: "NO_KEY" });
    expect(await checkProviderForUser(userId, { provider: "groq", apiKey: KEY }, { fetchImpl: f })).toBeGreaterThanOrEqual(0);
    expect(calls(f)[0]!.model).toBe("qwen/qwen3.8-27b");
  });

  it("surfaces the classified provider error", async () => {
    const f = vi.fn<FetchLike>(async () => json(401, "{}"));
    await expect(checkProviderForUser(userId, { provider: "groq", apiKey: KEY }, { fetchImpl: f })).rejects.toMatchObject({ code: "AUTH" });
    await expect(fetchModelsForUser(userId, { provider: "custom", baseUrl: "http://localhost:1/v1" }, { fetchImpl: f })).rejects.toMatchObject({ code: "BAD_CONFIG" });
  });

  it("explains a timeout in plain words", async () => {
    const f = vi.fn<FetchLike>(async () => Promise.reject(new DOMException("timed out", "TimeoutError")));
    await expect(checkProviderForUser(userId, { provider: "gemini", apiKey: KEY }, { fetchImpl: f })).rejects.toMatchObject({
      code: "PROVIDER",
      message: expect.stringContaining("yanıt vermedi"),
    });
  });
});

describe("rate limit", () => {
  it("allows a burst, then asks to wait, then recovers", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(takeToken("u", 3, 60_000, t0 + i)).toEqual({ ok: true });
    const blocked = takeToken("u", 3, 60_000, t0 + 10);
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(55);
    expect(takeToken("other", 3, 60_000, t0 + 10)).toEqual({ ok: true }); // per user
    expect(takeToken("u", 3, 60_000, t0 + 61_000)).toEqual({ ok: true });
  });
});

describe("real HTTP loopback (no fetch fake)", () => {
  type Seen = { url: string; auth: string | undefined; body: { model?: string; messages?: Array<{ role: string; content: string }> } };
  let server: import("node:http").Server;
  let base: string;
  const seen: Seen[] = [];
  let mode: "ok" | "unauthorized" = "ok";

  beforeAll(async () => {
    const { createServer } = await import("node:http");
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        seen.push({ url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : {} });
        res.setHeader("content-type", "application/json");
        if (mode === "unauthorized") return void res.writeHead(401).end(JSON.stringify({ error: { message: "nope" } }));
        if (req.url === "/v1/models") return void res.end(JSON.stringify({ data: [{ id: "local-b" }, { id: "local-a" }] }));
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ variants: [{ text: "Yerel model taslağı" }] }) }, finish_reason: "stop" }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    seen.length = 0;
    mode = "ok";
  });

  it("writes a draft through a local OpenAI-compatible server over real HTTP", async () => {
    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1");
    await saveConfig(userId, { provider: "custom", apiKey: KEY, baseUrl: base, model: "local-a" });
    const r = await generateForUser(userId, { mode: "create", brief: "Merhaba dünya", platforms: ["THREADS"], count: 1 });
    expect(r).toMatchObject({ provider: "custom", model: "local-a" });
    expect(r.variants[0]!.text).toBe("Yerel model taslağı");
    expect(seen[0]).toMatchObject({ url: "/v1/chat/completions", auth: `Bearer ${KEY}` });
    expect(seen[0]!.body.model).toBe("local-a");
    expect(seen[0]!.body.messages![1]!.content).toContain("Merhaba dünya");
  });

  it("lists models and maps a 401 over real HTTP", async () => {
    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1");
    await saveConfig(userId, { provider: "custom", apiKey: KEY, baseUrl: base, model: "local-a" });
    expect(await fetchModelsForUser(userId, { provider: "custom" })).toEqual(["local-a", "local-b"]);
    mode = "unauthorized";
    await expect(checkProviderForUser(userId, { provider: "custom" })).rejects.toMatchObject({ code: "AUTH" });
  });
});
