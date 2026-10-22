import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { Creds } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { ChainError } from "@/lib/ai/failover";
import { generateImage, imageRequestBody, imagesUrl, parseImageResponse, sniffImageMime } from "@/lib/ai/image";
import { generateImageForUser, imageModelsFor, orderForImages } from "@/lib/ai/image-service";
import { getProvider } from "@/lib/ai/providers";
import { removeConfig, saveConfig } from "@/lib/ai/store";
import { MAX_IMAGE_BYTES } from "@/lib/media";
import { resetRateLimits } from "@/lib/ai/rate-limit";

/** 1x1 transparent PNG: real magic bytes, so the signature check passes */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AH/9tEAAAAASUVORK5CYII=";
const pngBytes = () => Buffer.from(PNG_B64, "base64");

const creds = (over: Partial<Creds> = {}): Creds => ({
  info: getProvider("gemini")!,
  apiKey: "test-key-1234",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.5-flash-image",
  ...over,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("image request/response", () => {
  it("speaks the OpenAI images dialect and asks for base64", () => {
    expect(imagesUrl(creds())).toBe("https://generativelanguage.googleapis.com/v1beta/openai/images/generations");
    expect(imageRequestBody("gemini-2.5-flash-image", "bir kedi", "1536x1024")).toMatchObject({
      model: "gemini-2.5-flash-image",
      prompt: "bir kedi",
      n: 1,
      size: "1536x1024",
      response_format: "b64_json",
    });
  });

  it("reads base64 and detects the real format from the bytes", () => {
    const img = parseImageResponse({ data: [{ b64_json: PNG_B64 }] }, "m");
    expect(img.mime).toBe("image/png");
    expect(img.bytes.equals(pngBytes())).toBe(true);
    expect(sniffImageMime(pngBytes())).toBe("image/png");
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("refuses a URL answer instead of downloading it (SSRF)", () => {
    expect(() => parseImageResponse({ data: [{ url: "https://evil.example/x.png" }] })).toThrow(/base64/);
    expect(() => parseImageResponse({ data: [] })).toThrow(/görsel döndürmedi/);
    expect(() => parseImageResponse({})).toThrow(/görsel döndürmedi/);
  });

  it("caps the size and rejects unknown formats", () => {
    expect(() => parseImageResponse({ data: [{ b64_json: PNG_B64 }] }, "m", 10)).toThrow(/çok büyük/);
    const junk = Buffer.alloc(64, 7).toString("base64");
    expect(() => parseImageResponse({ data: [{ b64_json: junk }] })).toThrow(/tanıdık bir görsel biçimi/);
  });

  it("classifies provider failures so the chain can fail over", async () => {
    const auth = await generateImage(creds(), "x", { fetchImpl: async () => jsonResponse({ error: { message: "bad key" } }, 401) }).catch((e) => e);
    expect(auth).toBeInstanceOf(AiError);
    expect(auth.code).toBe("AUTH");

    const quota = await generateImage(creds(), "x", { fetchImpl: async () => jsonResponse({ error: { message: "quota" } }, 429) }).catch((e) => e);
    expect(quota.code).toBe("RATE_LIMIT");

    const oversize = await generateImage(creds(), "x", {
      fetchImpl: async () => jsonResponse({ data: [{ b64_json: Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64") }] }),
    }).catch((e) => e);
    expect(oversize.code).toBe("BAD_OUTPUT");
  });

  it("validates the prompt and the model before calling anyone", async () => {
    const noModel = await generateImage(creds({ model: "" }), "x", { fetchImpl: async () => jsonResponse({}) }).catch((e) => e);
    expect(noModel.code).toBe("BAD_CONFIG");
    const blank = await generateImage(creds(), "   ", { fetchImpl: async () => jsonResponse({}) }).catch((e) => e);
    expect(blank.code).toBe("BAD_REQUEST");
    const tooLong = await generateImage(creds(), "a".repeat(1001), { fetchImpl: async () => jsonResponse({}) }).catch((e) => e);
    expect(tooLong.code).toBe("BAD_REQUEST");
  });
});

describe("provider choice for images", () => {
  it("prefers the user's own image model, then the registry list, and knows who cannot draw", () => {
    const gemini = { info: getProvider("gemini")!, imageModel: null as string | null };
    expect(imageModelsFor(gemini as never)).toEqual(["gemini-2.5-flash-image", "gemini-3-pro-image-preview"]);
    expect(imageModelsFor({ ...gemini, imageModel: "my-own-image" } as never)).toEqual(["my-own-image"]);
    // EVREN ships no image model yet: the chain must skip it rather than invent one
    expect(imageModelsFor({ info: getProvider("evren")!, imageModel: null } as never)).toEqual([]);
    expect(imageModelsFor({ info: getProvider("evren")!, imageModel: "evren-image-1" } as never)).toEqual(["evren-image-1"]);
  });

  it("puts the chosen provider first and keeps the chain order for the rest", () => {
    const chain = [getProvider("evren")!, getProvider("gemini")!, getProvider("openai")!].map((info) => ({ provider: info.id, info, imageModel: null }) as never);
    expect(orderForImages(chain, "gemini").map((e) => (e as { info: { id: string } }).info.id)).toEqual(["gemini", "evren", "openai"]);
    expect(orderForImages(chain).map((e) => (e as { info: { id: string } }).info.id)).toEqual(["evren", "gemini", "openai"]);
  });
});

describe("generateImageForUser (real database + local image server)", () => {
  let userId: string;
  let server: Server;
  let baseUrl: string;
  const saved: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url !== "/images/generations" || req.method !== "POST") {
        res.writeHead(404).end();
        return;
      }
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        // A prompt asking for failure lets the same stub play the "quota" role
        if (body.includes("QUOTA")) {
          res.writeHead(429, { "content-type": "application/json", "retry-after": "30" });
          res.end(JSON.stringify({ error: { message: "quota exceeded" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

    vi.stubEnv("ALLOW_PRIVATE_LLM_URLS", "1"); // the stub is a local server
    resetRateLimits();
    userId = (await prisma.user.create({ data: { email: `img-${Date.now()}@test.local` } })).id;
    await saveConfig(userId, { provider: "custom", apiKey: "test-key-1234", baseUrl, model: "chat-model", imageModel: "stub-image-1" });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { id: userId } });
    await new Promise<void>((r) => server.close(() => r()));
    await prisma.$disconnect();
    // The stored file is a real artefact under .uploads (no Cloudinary in tests)
    for (const url of saved) {
      const name = url.split("/").pop();
      if (name) await import("node:fs/promises").then((fs) => fs.unlink(path.join(process.cwd(), ".uploads", name)).catch(() => undefined));
    }
  });

  it("stores the generated bytes as post media and reports who drew it", async () => {
    const r = await generateImageForUser(userId, { prompt: "turkuaz bir takvim illüstrasyonu", size: "1024x1024" });
    expect(r.provider).toBe("custom");
    expect(r.model).toBe("stub-image-1");
    expect(r.tried).toEqual([{ provider: "custom", ok: true }]);

    if (process.env.CLOUDINARY_URL) {
      expect(r.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    } else {
      expect(r.url).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.png$/);
      saved.push(r.url);
      expect(existsSync(path.join(process.cwd(), ".uploads", r.url.split("/").pop()!))).toBe(true);
    }
  });

  it("fails over to the next provider when the first one hits its quota", async () => {
    // Same provider is the only one, so the quota error surfaces with the attempt trail
    const err = await generateImageForUser(userId, { prompt: "QUOTA" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.tried[0]).toMatchObject({ provider: "custom", ok: false, code: "RATE_LIMIT" });
  });

  it("says so plainly when the only provider cannot draw", async () => {
    await removeConfig(userId, "custom");
    await saveConfig(userId, { provider: "custom", apiKey: "test-key-1234", baseUrl, model: "chat-model" }); // no imageModel
    const err = await generateImageForUser(userId, { prompt: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChainError);
    expect(err.message).toContain("görsel üretmiyor");
  });
});
