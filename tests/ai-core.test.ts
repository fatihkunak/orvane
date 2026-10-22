import { describe, expect, it, vi } from "vitest";
import {
  PROVIDERS,
  GROUP_ORDER,
  authHeaders,
  baseUrlEditable,
  getProvider,
  resolveBaseUrl,
  API_KEY_RE,
} from "@/lib/ai/providers";
import { assertSafeBaseUrl, isPrivateIp, redact } from "@/lib/ai/security";
import {
  chatUrl,
  checkCreds,
  classifyHttpError,
  complete,
  listModels,
  parseModelList,
  parseResponse,
  requestBody,
  type Creds,
  type FetchLike,
} from "@/lib/ai/client";
import { AiError, canFailover } from "@/lib/ai/errors";
import { ChainError, runChain, withModelFallback } from "@/lib/ai/failover";
import {
  buildPrompts,
  buildShortenPrompt,
  evaluate,
  generateInputSchema,
  parseVariants,
  safeLimit,
  targetLimit,
} from "@/lib/ai/prompt";

const creds = (id: string, over: Partial<Creds> = {}): Creds => {
  const info = getProvider(id)!;
  return { info, apiKey: "sk-test-1234567890", baseUrl: resolveBaseUrl(info, "https://llm.example.com/v1"), model: info.defaultModel ?? "some-model", ...over };
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const openaiAnswer = (content: string) => ({ choices: [{ message: { content }, finish_reason: "stop" }] });

describe("provider registry", () => {
  it("has unique ids and a sane shape", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(19);
    for (const p of PROVIDERS) {
      expect(GROUP_ORDER).toContain(p.group);
      if (p.baseUrl) expect(p.baseUrl).toMatch(p.group === "local" ? /^http:\/\/localhost:\d+\/v1$/ : /^https:\/\//);
      expect(p.baseUrl ?? "").not.toMatch(/\/$/);
      expect(p.needsKey).toBe(p.group !== "local" && p.id !== "custom");
    }
  });

  it("keeps the ids carried over from Gramiq and Nichevo", () => {
    for (const id of ["gemini", "groq", "openrouter", "nvidia", "mistral", "anthropic", "openai", "kimi", "xai", "ollama", "lmstudio", "evren", "alibaba", "custom"]) {
      expect(getProvider(id), id).toBeTruthy();
    }
    // Antigravity takes no API key and its login must not be used by third parties
    expect(getProvider("antigravity")).toBeUndefined();
  });

  it("encodes the provider quirks that were found in production", () => {
    expect(getProvider("evren")!.auth).toBe("x-api-key");
    expect(getProvider("openai")!.maxTokensParam).toBe("max_completion_tokens");
    expect(getProvider("anthropic")!.kind).toBe("anthropic");
    expect(getProvider("gemini")!.fallbackModels!.length).toBeGreaterThan(0);
    // Quota backups only where quota is per model
    for (const id of ["groq", "openrouter", "mistral", "nvidia"]) expect(getProvider(id)!.fallbackModels).toBeUndefined();
  });

  it("builds auth headers per provider", () => {
    expect(authHeaders(getProvider("groq")!, "k")).toEqual({ authorization: "Bearer k" });
    expect(authHeaders(getProvider("evren")!, "k")).toEqual({ "x-api-key": "k" });
    expect(authHeaders(getProvider("anthropic")!, "k")).toEqual({ "x-api-key": "k", "anthropic-version": "2023-06-01" });
    expect(authHeaders(getProvider("ollama")!, "")).toEqual({}); // keyless local server
  });

  it("resolves the address: fixed, local override, typed", () => {
    expect(resolveBaseUrl(getProvider("groq")!, "https://evil.example")).toBe("https://api.groq.com/openai/v1");
    expect(resolveBaseUrl(getProvider("ollama")!, "http://192.168.1.5:11434/v1/")).toBe("http://192.168.1.5:11434/v1");
    expect(resolveBaseUrl(getProvider("ollama")!, "")).toBe("http://localhost:11434/v1");
    expect(resolveBaseUrl(getProvider("custom")!, "https://x.example/v1///")).toBe("https://x.example/v1");
    expect(resolveBaseUrl(getProvider("custom")!)).toBe("");
    expect(baseUrlEditable(getProvider("custom")!)).toBe(true);
    expect(baseUrlEditable(getProvider("ollama")!)).toBe(true);
    expect(baseUrlEditable(getProvider("groq")!)).toBe(false);
  });

  it("accepts only printable ASCII keys of a sane length", () => {
    expect(API_KEY_RE.test("sk-abcdef123456")).toBe(true);
    expect(API_KEY_RE.test("short")).toBe(false);
    expect(API_KEY_RE.test("has space in it 12345")).toBe(false);
    expect(API_KEY_RE.test("tab\tinside-key-12345")).toBe(false);
    expect(API_KEY_RE.test("x".repeat(513))).toBe(false);
  });
});

describe("SSRF guard", () => {
  it("rejects http, local, private and link-local addresses", async () => {
    for (const url of [
      "http://api.example.com/v1",
      "https://localhost/v1",
      "https://foo.localhost/v1",
      "https://printer.local/v1",
      "https://127.0.0.1/v1",
      "https://10.0.0.5/v1",
      "https://192.168.1.10/v1",
      "https://172.20.0.1/v1",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/v1",
      "https://user:pass@8.8.8.8/v1",
      "not a url",
      "ftp://8.8.8.8/v1",
    ]) {
      await expect(assertSafeBaseUrl(url, false), url).rejects.toMatchObject({ code: "BAD_CONFIG" });
    }
  });

  it("accepts a public https address", async () => {
    await expect(assertSafeBaseUrl("https://8.8.8.8/v1", false)).resolves.toBeUndefined();
  });

  it("lets local development reach local servers, but never credentials in the URL", async () => {
    await expect(assertSafeBaseUrl("http://localhost:11434/v1", true)).resolves.toBeUndefined();
    await expect(assertSafeBaseUrl("http://u:p@localhost:11434/v1", true)).rejects.toMatchObject({ code: "BAD_CONFIG" });
    await expect(assertSafeBaseUrl("nonsense", true)).rejects.toMatchObject({ code: "BAD_CONFIG" });
  });

  it("recognises private ranges", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("removes the key from provider messages", () => {
    expect(redact("invalid key sk-test-1234567890 given", "sk-test-1234567890")).toBe("invalid key *** given");
    expect(redact("a".repeat(500), "k").length).toBe(300);
  });
});

describe("request and response shapes", () => {
  it("builds OpenAI-style and Anthropic bodies", () => {
    const o = requestBody(creds("groq"), "SYS", "USER", 100) as Record<string, unknown>;
    expect(o.max_tokens).toBe(100);
    expect(o.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    expect(requestBody(creds("openai"), "S", "U", 7)).toMatchObject({ max_completion_tokens: 7 });
    expect("max_tokens" in requestBody(creds("openai"), "S", "U", 7)).toBe(false);
    expect(requestBody(creds("anthropic"), "SYS", "USER", 9)).toEqual({ model: "claude-haiku-5-5", max_tokens: 9, system: "SYS", messages: [{ role: "user", content: "USER" }] });
    expect(chatUrl(creds("anthropic"))).toMatch(/\/messages$/);
    expect(chatUrl(creds("groq"))).toMatch(/\/chat\/completions$/);
  });

  it("parses answers, strips thinking, and reports empty or truncated ones", () => {
    expect(parseResponse("openai", openaiAnswer("  hello  "))).toBe("hello");
    expect(parseResponse("openai", openaiAnswer("<think>hmm</think>answer"))).toBe("answer");
    expect(parseResponse("openai", { choices: [{ message: { content: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
    expect(parseResponse("anthropic", { content: [{ type: "text", text: "hi" }] })).toBe("hi");
    expect(() => parseResponse("openai", openaiAnswer("   "))).toThrow(/boş/);
    expect(() => parseResponse("openai", { choices: [{ message: { content: "" }, finish_reason: "length" }] })).toThrow(/token sınırı/);
    expect(() => parseResponse("openai", openaiAnswer("<think>unfinished reasoning"))).toThrow(AiError);
  });

  it("reads model lists in every shape", () => {
    expect(parseModelList({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] })).toEqual(["a", "b"]);
    expect(parseModelList({ models: [{ name: "models/gemini-x" }] })).toEqual(["gemini-x"]);
    expect(parseModelList({ models: [{ id: "m1" }] })).toEqual(["m1"]);
    expect(parseModelList({})).toEqual([]);
    expect(parseModelList({ data: [{ id: "x".repeat(201) }] })).toEqual([]);
  });

  it("classifies HTTP errors", () => {
    const h = (o: Record<string, string> = {}) => new Headers(o);
    expect(classifyHttpError(401, "{}", h(), "k").code).toBe("AUTH");
    expect(classifyHttpError(403, "{}", h(), "k").code).toBe("AUTH");
    expect(classifyHttpError(402, '{"detail":"credits depleted"}', h(), "k").code).toBe("PAYMENT");
    expect(classifyHttpError(400, '{"error":{"message":"API key not valid"}}', h(), "k").code).toBe("AUTH"); // Gemini
    expect(classifyHttpError(404, '{"error":{"message":"The model `x` does not exist"}}', h(), "k").code).toBe("BAD_CONFIG");
    expect(classifyHttpError(404, "nope", h(), "k").code).toBe("BAD_CONFIG");
    expect(classifyHttpError(400, '{"error":{"message":"bad prompt"}}', h(), "k").code).toBe("BAD_REQUEST");
    expect(classifyHttpError(503, "down", h(), "k").code).toBe("PROVIDER");
    const rl = classifyHttpError(429, "{}", h({ "retry-after": "5" }), "k");
    expect(rl).toMatchObject({ code: "RATE_LIMIT", retryAfterSec: 5 });
    expect(classifyHttpError(429, '{"error":{"details":[{"retryDelay":"12s"}]}}', h(), "k").retryAfterSec).toBe(12);
  });

  it("never leaks the key in an error message", () => {
    const e = classifyHttpError(401, '{"error":{"message":"bad key sk-test-1234567890"}}', new Headers(), "sk-test-1234567890");
    expect(e.message).not.toContain("sk-test-1234567890");
  });
});

describe("provider calls (fetch is faked)", () => {
  it("sends the right URL and auth header per provider", async () => {
    for (const [id, header, value] of [
      ["groq", "authorization", "Bearer sk-test-1234567890"],
      ["evren", "x-api-key", "sk-test-1234567890"],
      ["anthropic", "x-api-key", "sk-test-1234567890"],
    ] as const) {
      const f = vi.fn<FetchLike>(async () => json(200, id === "anthropic" ? { content: [{ type: "text", text: "OK" }] } : openaiAnswer("OK")));
      expect(await complete(creds(id), "s", "u", { fetchImpl: f })).toBe("OK");
      const [url, init] = f.mock.calls[0]!;
      expect(url).toBe(chatUrl(creds(id)));
      expect((init!.headers as Record<string, string>)[header]).toBe(value);
    }
  });

  it("sends no auth header for a keyless local server", async () => {
    const f = vi.fn<FetchLike>(async () => json(200, openaiAnswer("OK")));
    await complete({ ...creds("ollama"), apiKey: "", model: "llama3" }, "s", "u", { fetchImpl: f });
    expect(Object.keys(f.mock.calls[0]![1]!.headers as object).sort()).toEqual(["content-type"]);
  });

  it("turns failures into classified errors", async () => {
    await expect(complete(creds("groq"), "s", "u", { fetchImpl: async () => json(401, "{}") })).rejects.toMatchObject({ code: "AUTH" });
    await expect(complete(creds("groq"), "s", "u", { fetchImpl: async () => json(200, "<html>") })).rejects.toMatchObject({ code: "BAD_OUTPUT" });
    await expect(
      complete(creds("groq"), "s", "u", {
        fetchImpl: async () => {
          throw new Error("getaddrinfo ENOTFOUND sk-test-1234567890.host");
        },
      }),
    ).rejects.toMatchObject({ code: "PROVIDER", message: expect.not.stringContaining("sk-test-1234567890") });
    await expect(complete({ ...creds("nvidia"), model: "" }, "s", "u", { fetchImpl: async () => json(200, {}) })).rejects.toMatchObject({ code: "BAD_CONFIG" });
  });

  it("lists models and checks credentials", async () => {
    const f = vi.fn<FetchLike>(async (url) => (url.endsWith("/models") ? json(200, { data: [{ id: "m2" }, { id: "m1" }] }) : json(200, openaiAnswer("OK"))));
    expect(await listModels(creds("openrouter"), f)).toEqual(["m1", "m2"]);
    expect(await checkCreds(creds("openrouter"), f)).toBeGreaterThanOrEqual(0);
    const anth = vi.fn<FetchLike>(async () => json(200, { data: [{ id: "claude-x" }] }));
    await listModels(creds("anthropic"), anth);
    expect(anth.mock.calls[0]![0]).toMatch(/\/models\?limit=100$/);
    await expect(checkCreds(creds("groq"), async () => json(401, "{}"))).rejects.toMatchObject({ code: "AUTH" });
  });
});

describe("provider chain", () => {
  const ids = ["a", "b", "c"];
  const run = (attempt: (id: string) => Promise<string>) => runChain(ids, (x) => x, attempt);

  it("uses the first provider when it works", async () => {
    const r = await run(async (id) => id);
    expect(r).toMatchObject({ value: "a", entry: "a", tried: [{ provider: "a", ok: true }] });
  });

  it("falls over on provider-specific errors, in order", async () => {
    const r = await run(async (id) => {
      if (id === "a") throw new AiError("AUTH", "bad key");
      if (id === "b") throw new AiError("RATE_LIMIT", "quota");
      return id;
    });
    expect(r.value).toBe("c");
    expect(r.tried.map((t) => [t.provider, t.ok])).toEqual([["a", false], ["b", false], ["c", true]]);
  });

  it("does not fail over on a problem with the request itself", async () => {
    const attempt = vi.fn(async () => {
      throw new AiError("BAD_REQUEST", "prompt rejected");
    });
    await expect(runChain(ids, (x) => x, attempt)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("reports the FIRST error and the trail when every provider fails", async () => {
    const err = await run(async (id) => {
      throw new AiError(id === "a" ? "PAYMENT" : "AUTH", `fail ${id}`);
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err.code).toBe("PAYMENT");
    expect(err.message).toContain("fail a");
    expect(err.message).toContain("3 sağlayıcı denendi");
    expect(err.tried).toHaveLength(3);
  });

  it("rejects an empty chain", async () => {
    await expect(runChain([], (x: string) => x, async () => "x")).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  it("knows which errors may fail over", () => {
    for (const c of ["BAD_CONFIG", "NO_KEY", "AUTH", "PAYMENT", "RATE_LIMIT", "PROVIDER", "BAD_OUTPUT"] as const) expect(canFailover(new AiError(c, "x"))).toBe(true);
    expect(canFailover(new AiError("BAD_REQUEST", "x"))).toBe(false);
    expect(canFailover(new Error("boom"))).toBe(false);
  });
});

describe("model fallback within one provider", () => {
  const quota = (sec?: number) => new AiError("RATE_LIMIT", "quota", sec);

  it("waits out a short rate limit and retries the same model", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const r = await withModelFallback(["m1", "m2"], async (m) => {
      if (m === "m1" && n++ === 0) throw quota(3);
      return m;
    }, sleep);
    expect(r).toEqual({ value: "m1", model: "m1" });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("moves to the next model on a long rate limit", async () => {
    const sleep = vi.fn(async () => {});
    const r = await withModelFallback(["m1", "m2"], async (m) => {
      if (m === "m1") throw quota(60);
      return m;
    }, sleep);
    expect(r.model).toBe("m2");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws other errors as they are, and prefers the first quota message once a backup breaks differently", async () => {
    await expect(withModelFallback(["m1", "m2"], async () => { throw new AiError("AUTH", "bad key"); })).rejects.toMatchObject({ code: "AUTH" });
    const e = await withModelFallback(["m1", "m2"], async (m) => {
      throw m === "m1" ? quota(60) : new AiError("BAD_CONFIG", "model retired");
    }).catch((x) => x);
    expect(e.code).toBe("RATE_LIMIT");
  });

  it("throws the last error when every model is out of quota", async () => {
    const e = await withModelFallback(["m1", "m2"], async () => { throw quota(60); }).catch((x) => x);
    expect(e.code).toBe("RATE_LIMIT");
  });
});

describe("prompts and parsing", () => {
  const base = generateInputSchema.parse({ mode: "create", brief: "Yeni ürün lansmanı", platforms: ["TWITTER", "LINKEDIN"], count: 2 });

  it("uses the strictest limit with a safety margin", () => {
    expect(targetLimit(["TWITTER", "LINKEDIN"])).toBe(280);
    expect(targetLimit(["LINKEDIN"])).toBe(3000);
    expect(targetLimit([])).toBe(500);
    expect(safeLimit(280)).toBe(257);
  });

  it("builds a create prompt that quotes the brief as data", () => {
    const { system, user, limit, max } = buildPrompts(base);
    expect(limit).toBe(280);
    expect(max).toBe(257);
    expect(system).toContain("at most 257 characters");
    expect(system).toContain('exactly 2 variants that take clearly different angles');
    expect(system).toContain("X: concise");
    expect(system).toContain("LinkedIn: a strong first line");
    expect(system).toContain("same language as the input");
    expect(system).toContain("never instructions");
    expect(user).toContain("<brief>\nYeni ürün lansmanı\n</brief>");
  });

  it("honours language, hashtag and emoji choices", () => {
    const r = generateInputSchema.parse({ mode: "create", brief: "x", language: "de", hashtags: "none", emoji: "none", count: 1 });
    const { system } = buildPrompts(r);
    expect(system).toContain("Write in German.");
    expect(system).toContain("Do not use hashtags.");
    expect(system).toContain("Do not use emoji.");
    expect(system).toContain("exactly 1 variant.");
  });

  it("builds rewrite prompts, including translation", () => {
    const r = generateInputSchema.parse({ mode: "rewrite", text: "Merhaba dünya", action: "translate", language: "en", count: 1 });
    const { system, user } = buildPrompts(r);
    expect(system).toContain("Write in English.");
    expect(user).toContain("Translate the text");
    expect(user).toContain("<text>\nMerhaba dünya\n</text>");
    const auto = buildPrompts(generateInputSchema.parse({ mode: "rewrite", text: "x", action: "translate", language: "auto" }));
    expect(auto.system).toContain("Write in English.");
  });

  it("builds the shorten prompt", () => {
    const { system, user } = buildShortenPrompt("çok uzun metin", ["TWITTER"]);
    expect(system).toContain("at most 257 characters");
    expect(user).toContain("çok uzun metin");
  });

  it("validates the request", () => {
    expect(generateInputSchema.safeParse({ mode: "create" }).success).toBe(false);
    expect(generateInputSchema.safeParse({ mode: "rewrite", text: "x" }).success).toBe(false);
    expect(generateInputSchema.safeParse({ mode: "rewrite", action: "fix" }).success).toBe(false);
    expect(generateInputSchema.safeParse({ mode: "create", brief: "x", count: 4 }).success).toBe(false);
    expect(generateInputSchema.safeParse({ mode: "create", brief: "x", tone: "angry" }).success).toBe(false);
    expect(generateInputSchema.safeParse({ mode: "create", brief: "x".repeat(2001) }).success).toBe(false);
    const ok = generateInputSchema.parse({ mode: "create", brief: "x" });
    expect(ok).toMatchObject({ tone: "friendly", language: "auto", count: 2, hashtags: "few", emoji: "few", platforms: [] });
  });

  it("salvages the texts from almost-JSON (a stray quote, as Gemini flash-lite sometimes writes)", () => {
    const broken = '{"variants":[{"text":"Birinci \\"alıntılı\\" metin #a","},{"text":"İkinci metin\\nsatır #b"}]}';
    expect(() => JSON.parse(broken)).toThrow();
    expect(parseVariants(broken, 3)).toEqual(['Birinci "alıntılı" metin #a', "İkinci metin\nsatır #b"]);
    expect(parseVariants(broken, 1)).toEqual(['Birinci "alıntılı" metin #a']);
    expect(parseVariants('{"variants":[{"text":', 2)).toEqual([]); // nothing usable stays empty
  });

  it("parses the usual answer shapes", () => {
    const a = { variants: [{ text: "one" }, { text: "two" }] };
    expect(parseVariants(JSON.stringify(a), 3)).toEqual(["one", "two"]);
    expect(parseVariants("```json\n" + JSON.stringify(a) + "\n```", 3)).toEqual(["one", "two"]);
    expect(parseVariants("<think>plan</think>Here you go:\n" + JSON.stringify(a) + "\nEnjoy!", 3)).toEqual(["one", "two"]);
    expect(parseVariants('["x","y"]', 3)).toEqual(["x", "y"]);
    expect(parseVariants('{"posts":[{"content":"p"}]}', 3)).toEqual(["p"]);
    expect(parseVariants('{"text":"solo"}', 1)).toEqual(["solo"]);
    expect(parseVariants(JSON.stringify({ variants: ["s1", "s2", "s3"] }), 2)).toEqual(["s1", "s2"]); // capped
    expect(parseVariants(JSON.stringify({ variants: [{ text: "same" }, { text: " same " }, { text: "" }] }), 3)).toEqual(["same"]); // deduped, empty dropped
  });

  it("falls back to plain text only for a single variant", () => {
    expect(parseVariants("Just a post 🚀", 1)).toEqual(["Just a post 🚀"]);
    expect(parseVariants('"quoted post"', 1)).toEqual(["quoted post"]);
    expect(parseVariants("Just a post", 2)).toEqual([]);
    expect(parseVariants("{ broken json", 1)).toEqual([]);
    expect(parseVariants("", 1)).toEqual([]);
  });

  it("counts characters like each platform does", () => {
    const [v] = evaluate(["a".repeat(281)], ["TWITTER", "LINKEDIN"]);
    expect(v!.counts).toEqual({ TWITTER: 281, LINKEDIN: 281 });
    expect(v!.over).toEqual(["TWITTER"]);
    // Threads counts an emoji by its UTF-8 bytes
    const [t] = evaluate(["🚀".repeat(126)], ["THREADS"]);
    expect(t!.counts.THREADS).toBe(504);
    expect(t!.over).toEqual(["THREADS"]);
  });
});
