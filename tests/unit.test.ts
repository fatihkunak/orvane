import { describe, expect, it, vi, afterEach } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { countChars, overLimit } from "@/lib/char-count";
import { createPostSchema } from "@/lib/validation/post";
import { derivePostStatus } from "@/lib/publishing";
import { needsRefresh } from "@/lib/social/tokens";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchProfile,
  pkceChallenge,
  refreshTokenSet,
} from "@/lib/social/providers";
import { escapeLittleText } from "@/lib/social/publishers/linkedin";
import { isAllowedMediaUrl, matchesSignature } from "@/lib/media";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crypto", () => {
  it("round-trips and never stores plain text", () => {
    const enc = encrypt("secret-token");
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain("secret-token");
    expect(decrypt(enc)).toBe("secret-token");
  });

  it("uses a fresh nonce each time", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("rejects a key of the wrong size", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});

describe("character limits", () => {
  it("counts Threads emoji by UTF-8 bytes (docs) but X by code points", () => {
    expect(countChars("THREADS", "a🚀")).toBe(1 + 4);
    expect(countChars("TWITTER", "a🚀")).toBe(2);
  });

  it("reports which platforms are over", () => {
    const text = "x".repeat(300);
    expect(overLimit(["THREADS", "TWITTER", "LINKEDIN"], text)).toEqual(["TWITTER"]);
  });
});

describe("createPostSchema", () => {
  const base = { text: "hi", platforms: ["THREADS"], mediaUrls: [], mode: "draft" } as const;

  it("accepts a draft", () => expect(createPostSchema.safeParse(base).success).toBe(true));

  it("needs a date when scheduling and rejects the past", () => {
    expect(createPostSchema.safeParse({ ...base, mode: "schedule" }).success).toBe(false);
    const past = new Date(Date.now() - 3600_000).toISOString();
    expect(createPostSchema.safeParse({ ...base, mode: "schedule", scheduledAt: past }).success).toBe(false);
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(createPostSchema.safeParse({ ...base, mode: "schedule", scheduledAt: future }).success).toBe(true);
  });

  it("enforces the per-platform limit and at most 4 media", () => {
    expect(createPostSchema.safeParse({ ...base, platforms: ["TWITTER"], text: "x".repeat(281) }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, platforms: ["LINKEDIN"], text: "x".repeat(281) }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...base, mediaUrls: ["a", "b", "c", "d", "e"] }).success).toBe(false);
  });

  it("rejects empty text and no platforms", () => {
    expect(createPostSchema.safeParse({ ...base, text: "   " }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...base, platforms: [] }).success).toBe(false);
  });
});

describe("derivePostStatus", () => {
  it("stays in flight while anything is pending", () => {
    expect(derivePostStatus(["PUBLISHED", "PENDING"])).toBeNull();
    expect(derivePostStatus(["PUBLISHING"])).toBeNull();
  });
  it("is PUBLISHED only when every platform succeeded, otherwise FAILED", () => {
    expect(derivePostStatus(["PUBLISHED", "PUBLISHED"])).toBe("PUBLISHED");
    expect(derivePostStatus(["PUBLISHED", "FAILED"])).toBe("FAILED");
  });
});

describe("token refresh policy", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const at = (ms: number) => new Date(now + ms);
  const d = (days: number) => days * 24 * 3600_000;

  it("X refreshes within 5 minutes of expiry", () => {
    expect(needsRefresh("twitter", { expiresAt: at(4 * 60_000), updatedAt: at(-1), hasRefreshToken: true }, now)).toBe(true);
    expect(needsRefresh("twitter", { expiresAt: at(30 * 60_000), updatedAt: at(-1), hasRefreshToken: true }, now)).toBe(false);
  });
  it("LinkedIn refreshes only if a refresh token exists", () => {
    expect(needsRefresh("linkedin", { expiresAt: at(d(2)), updatedAt: at(-d(30)), hasRefreshToken: false }, now)).toBe(false);
    expect(needsRefresh("linkedin", { expiresAt: at(d(2)), updatedAt: at(-d(30)), hasRefreshToken: true }, now)).toBe(true);
  });
  it("Threads refreshes in the last week but never a token younger than 24h", () => {
    expect(needsRefresh("threads", { expiresAt: at(d(3)), updatedAt: at(-d(40)), hasRefreshToken: false }, now)).toBe(true);
    expect(needsRefresh("threads", { expiresAt: at(d(3)), updatedAt: at(-3600_000), hasRefreshToken: false }, now)).toBe(false);
    expect(needsRefresh("threads", { expiresAt: at(d(30)), updatedAt: at(-d(40)), hasRefreshToken: false }, now)).toBe(false);
  });
  it("never refreshes tokens without an expiry", () => {
    expect(needsRefresh("twitter", { expiresAt: null, updatedAt: at(-d(9)), hasRefreshToken: true }, now)).toBe(false);
  });
});

describe("LinkedIn little text escaping", () => {
  it("escapes reserved characters", () => {
    expect(escapeLittleText("a_b *c* (d) [e] {f} <g> @h | ~ \\")).toBe(
      "a\\_b \\*c\\* \\(d\\) \\[e\\] \\{f\\} \\<g\\> \\@h \\| \\~ \\\\",
    );
  });
  it("keeps real hashtags but escapes a lone #", () => {
    expect(escapeLittleText("#sosyalmedya ve # tek")).toBe("#sosyalmedya ve \\# tek");
  });
});

describe("OAuth", () => {
  const env = () => {
    vi.stubEnv("TWITTER_CLIENT_ID", "xid");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "xsecret");
    vi.stubEnv("LINKEDIN_CLIENT_ID", "lid");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "lsecret");
    vi.stubEnv("THREADS_APP_ID", "tid");
    vi.stubEnv("THREADS_APP_SECRET", "tsecret");
  };

  it("PKCE challenge matches the RFC 7636 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("builds X, LinkedIn and Threads authorize URLs", () => {
    env();
    const x = new URL(buildAuthorizeUrl("twitter", { state: "s", redirectUri: "https://app/cb", codeChallenge: "ch" }));
    expect(x.origin + x.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(x.searchParams.get("scope")).toBe("tweet.read tweet.write users.read media.write offline.access");
    expect(x.searchParams.get("code_challenge_method")).toBe("S256");
    expect(x.searchParams.get("client_id")).toBe("xid");

    const li = new URL(buildAuthorizeUrl("linkedin", { state: "s", redirectUri: "https://app/cb", codeChallenge: "ignored" }));
    expect(li.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(li.searchParams.has("code_challenge")).toBe(false); // LinkedIn flow has no PKCE here

    const th = new URL(buildAuthorizeUrl("threads", { state: "s", redirectUri: "https://app/cb" }));
    expect(th.searchParams.get("scope")).toBe("threads_basic,threads_content_publish");
  });

  it("refuses to build a URL when credentials are missing", () => {
    // Don't depend on the developer's real .env having no X keys
    vi.stubEnv("TWITTER_CLIENT_ID", "");
    vi.stubEnv("TWITTER_CLIENT_SECRET", "");
    expect(() => buildAuthorizeUrl("twitter", { state: "s", redirectUri: "x" })).toThrow(/not configured/);
  });

  it("exchanges an X code with Basic auth and PKCE verifier", async () => {
    env();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ access_token: "at", refresh_token: "rt", expires_in: 7200, scope: "tweet.read tweet.write" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = await exchangeCode("twitter", { code: "c", redirectUri: "https://app/cb", codeVerifier: "ver" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.x.com/2/oauth2/token");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("xid:xsecret").toString("base64")}`);
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("ver");
    expect(t.accessToken).toBe("at");
    expect(t.refreshToken).toBe("rt");
    expect(t.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 7000_000);
  });

  it("swaps the Threads short-lived token for a long-lived one", async () => {
    env();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "short", user_id: 123 }))
      .mockResolvedValueOnce(Response.json({ access_token: "long", token_type: "bearer", expires_in: 5183944 }));
    vi.stubGlobal("fetch", fetchMock);

    const t = await exchangeCode("threads", { code: "c", redirectUri: "https://app/cb" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.threads.com/oauth/access_token");
    const exchange = new URL(fetchMock.mock.calls[1][0] as string);
    expect(exchange.searchParams.get("grant_type")).toBe("th_exchange_token");
    expect(exchange.searchParams.get("access_token")).toBe("short");
    expect(t).toMatchObject({ accessToken: "long", userId: "123" });
  });

  it("surfaces provider errors with the status code", async () => {
    env();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(exchangeCode("linkedin", { code: "c", redirectUri: "r" })).rejects.toMatchObject({ status: 400 });
  });

  it("refreshes X with the stored refresh token and returns the rotated one", async () => {
    env();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "new", refresh_token: "rotated", expires_in: 7200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = await refreshTokenSet("twitter", { accessToken: "old", refreshToken: "rt" });
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("refresh_token")).toBe("rt");
    expect(t).toMatchObject({ accessToken: "new", refreshToken: "rotated" });
  });

  it("refreshes Threads with th_refresh_token", async () => {
    env();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: "renewed", expires_in: 5183944 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = await refreshTokenSet("threads", { accessToken: "cur", refreshToken: null });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/refresh_access_token");
    expect(url.searchParams.get("grant_type")).toBe("th_refresh_token");
    expect(t.accessToken).toBe("renewed");
  });

  it("maps provider profiles", async () => {
    env();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: { id: "9", username: "fatih", name: "Fatih", profile_image_url: "http://i" } })),
    );
    expect(await fetchProfile("twitter", { accessToken: "t" })).toEqual({
      platformUserId: "9",
      username: "fatih",
      displayName: "Fatih",
      avatarUrl: "http://i",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ sub: "abc", name: "Fatih K", picture: "http://p" })));
    expect((await fetchProfile("linkedin", { accessToken: "t" })).platformUserId).toBe("abc");
  });
});

describe("media allow-list (SSRF guard)", () => {
  const local = "/api/media/123e4567-e89b-42d3-a456-426614174000.png";

  it("accepts this app's own uploads", () => {
    expect(isAllowedMediaUrl(local)).toBe(true);
    expect(isAllowedMediaUrl("/api/media/123e4567-e89b-42d3-a456-426614174000.mp4")).toBe(true);
  });

  it("rejects internal, foreign and malformed addresses", () => {
    for (const bad of [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:5432/",
      "https://evil.example/a.png",
      "file:///etc/passwd",
      "/api/media/../../.env",
      "/api/media/not-a-uuid.png",
      "/api/media/123e4567-e89b-42d3-a456-426614174000.svg",
      "//evil.example/a.png",
    ]) {
      expect(isAllowedMediaUrl(bad), bad).toBe(false);
    }
  });

  it("accepts only OUR Cloudinary account over https", () => {
    vi.stubEnv("CLOUDINARY_URL", "cloudinary://key:secret@mycloud");
    expect(isAllowedMediaUrl("https://res.cloudinary.com/mycloud/image/upload/v1/postforge/a.jpg")).toBe(true);
    expect(isAllowedMediaUrl("https://res.cloudinary.com/othercloud/image/upload/a.jpg")).toBe(false);
    expect(isAllowedMediaUrl("http://res.cloudinary.com/mycloud/image/upload/a.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://res.cloudinary.com.evil.example/mycloud/a.jpg")).toBe(false);
  });

  it("is enforced by the post schema", () => {
    const base = { text: "hi", platforms: ["THREADS"], mode: "draft" } as const;
    expect(createPostSchema.safeParse({ ...base, mediaUrls: [local] }).success).toBe(true);
    expect(createPostSchema.safeParse({ ...base, mediaUrls: ["http://169.254.169.254/"] }).success).toBe(false);
  });
});

describe("file signatures", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  const mp4 = Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
  const html = new TextEncoder().encode("<html><script>");

  it("matches real files", () => {
    expect(matchesSignature("image/png", png)).toBe(true);
    expect(matchesSignature("video/mp4", mp4)).toBe(true);
    expect(matchesSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(matchesSignature("image/gif", new TextEncoder().encode("GIF89a"))).toBe(true);
  });
  it("rejects content that lies about its type", () => {
    expect(matchesSignature("image/png", html)).toBe(false);
    expect(matchesSignature("image/jpeg", png)).toBe(false);
    expect(matchesSignature("text/html", html)).toBe(false);
  });
});
