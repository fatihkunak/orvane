import { describe, expect, it, vi } from "vitest";
import { cloudinaryConfig, cloudinaryPublicId, deleteCloudinaryAsset } from "@/lib/cloudinary";

/** Signing and URL parsing only: no test talks to Cloudinary. */

const ENV = { CLOUDINARY_URL: "cloudinary://123456789:super-secret@demo-cloud" } as unknown as NodeJS.ProcessEnv;

describe("cloudinary config", () => {
  it("reads key/secret/cloud and ignores a broken value", () => {
    expect(cloudinaryConfig(ENV)).toEqual({ apiKey: "123456789", apiSecret: "super-secret", cloud: "demo-cloud" });
    expect(cloudinaryConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("public_id from a delivery URL", () => {
  it("strips the cloud, resource, version and extension", () => {
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo-cloud/image/upload/v1712345/orvane/abc123.png", ENV)).toEqual({
      publicId: "orvane/abc123",
      resource: "image",
    });
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo-cloud/video/upload/orvane/clip.mp4", ENV)).toEqual({
      publicId: "orvane/clip",
      resource: "video",
    });
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo-cloud/image/upload/c_fill,w_500/v1/orvane/x.jpg", ENV)).toEqual({
      publicId: "orvane/x",
      resource: "image",
    });
  });

  it("refuses another cloud, another host, and non-Cloudinary URLs", () => {
    expect(cloudinaryPublicId("https://res.cloudinary.com/someone-else/image/upload/v1/orvane/abc.png", ENV)).toBeNull();
    expect(cloudinaryPublicId("https://evil.example/demo-cloud/image/upload/v1/orvane/abc.png", ENV)).toBeNull();
    expect(cloudinaryPublicId("/api/media/abc.png", ENV)).toBeNull();
    expect(cloudinaryPublicId("https://res.cloudinary.com/demo-cloud/image/upload/v1/orvane/abc.png", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("deleting an asset", () => {
  it("signs public_id+timestamp and calls the Admin API destroy endpoint", async () => {
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: init.body as URLSearchParams });
      return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
    }) as unknown as typeof fetch;

    const ok = await deleteCloudinaryAsset("https://res.cloudinary.com/demo-cloud/image/upload/v1/orvane/abc.png", {
      env: ENV,
      fetchImpl,
      now: 1_700_000_000_000,
    });

    expect(ok).toBe(true);
    expect(calls[0]!.url).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/destroy");
    expect(calls[0]!.body.get("public_id")).toBe("orvane/abc");
    expect(calls[0]!.body.get("api_key")).toBe("123456789");
    expect(calls[0]!.body.get("signature")).toMatch(/^[0-9a-f]{40}$/);
    // The secret itself never travels in the body
    expect([...calls[0]!.body.keys()]).not.toContain("api_secret");
  });

  it("treats 'not found' as success and failures as false", async () => {
    const notFound = (async () => new Response(JSON.stringify({ result: "not found" }), { status: 200 })) as unknown as typeof fetch;
    expect(await deleteCloudinaryAsset("https://res.cloudinary.com/demo-cloud/image/upload/v1/orvane/abc.png", { env: ENV, fetchImpl: notFound })).toBe(true);

    const denied = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    expect(await deleteCloudinaryAsset("https://res.cloudinary.com/demo-cloud/image/upload/v1/orvane/abc.png", { env: ENV, fetchImpl: denied })).toBe(false);

    const boom = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await deleteCloudinaryAsset("https://res.cloudinary.com/demo-cloud/image/upload/v1/orvane/abc.png", { env: ENV, fetchImpl: boom })).toBe(false);

    // Foreign asset: no request is made at all
    const never = vi.fn() as unknown as typeof fetch;
    expect(await deleteCloudinaryAsset("https://res.cloudinary.com/other/image/upload/v1/x.png", { env: ENV, fetchImpl: never })).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});
