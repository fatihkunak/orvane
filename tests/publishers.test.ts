import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublishError, type Deps } from "@/lib/social/publishers/shared";
import { publishToTwitter } from "@/lib/social/publishers/twitter";
import { publishToLinkedIn } from "@/lib/social/publishers/linkedin";
import {
  createThreadsContainer,
  publishThreadsContainer,
} from "@/lib/social/publishers/threads";

type Call = { url: URL; init: RequestInit };
type Handler = (url: URL, init: RequestInit, calls: Call[]) => Response | Promise<Response>;

/** Fake fetch + sleep that records every request so we can assert the exact API sequence. */
function mock(handler: Handler) {
  const calls: Call[] = [];
  const sleep = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init, calls);
  });
  return { deps: { fetch, sleep } as unknown as Deps, calls, sleep };
}

const MEDIA_HOST = "http://localhost:3000";
const mediaResponse = (type: string, size = 10) =>
  new Response(new Uint8Array(size).fill(1), { headers: { "content-type": type } });
const paths = (calls: Call[]) => calls.map((c) => `${c.init.method ?? "GET"} ${c.url.host}${c.url.pathname}`);
const ctx = { accessToken: "tok", platformUserId: "u1" };

beforeEach(() => {
  vi.stubEnv("APP_URL", MEDIA_HOST);
});

describe("X publisher", () => {
  it("posts text with a bearer token and returns the tweet id", async () => {
    const { deps, calls } = mock(() => Response.json({ data: { id: "t1" } }));
    const res = await publishToTwitter(ctx, { text: "hello", mediaUrls: [] }, deps);

    expect(res).toEqual({ publishedPostId: "t1" });
    expect(paths(calls)).toEqual(["POST api.x.com/2/tweets"]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ text: "hello" });
  });

  it("uploads an image in chunks, then attaches media_ids", async () => {
    const { deps, calls } = mock((url) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("image/png", 5 * 1024 * 1024); // forces 2 chunks
      if (url.pathname.endsWith("/initialize")) return Response.json({ data: { id: "m1" } });
      if (url.pathname.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.pathname.endsWith("/finalize")) return Response.json({ data: { id: "m1" } });
      return Response.json({ data: { id: "t2" } });
    });
    const res = await publishToTwitter(ctx, { text: "pic", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.png"] }, deps);

    expect(res.publishedPostId).toBe("t2");
    expect(paths(calls)).toEqual([
      "GET localhost:3000/api/media/00000000-0000-4000-8000-00000000000a.png",
      "POST api.x.com/2/media/upload/initialize",
      "POST api.x.com/2/media/upload/m1/append",
      "POST api.x.com/2/media/upload/m1/append",
      "POST api.x.com/2/media/upload/m1/finalize",
      "POST api.x.com/2/tweets",
    ]);
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({ media_type: "image/png", media_category: "tweet_image" });
    expect((calls[2].init.body as FormData).get("segment_index")).toBe("0");
    expect((calls[3].init.body as FormData).get("segment_index")).toBe("1");
    expect(JSON.parse(calls[5].init.body as string).media.media_ids).toEqual(["m1"]);
  });

  it("waits for video processing before tweeting", async () => {
    let polls = 0;
    const { deps, sleep } = mock((url) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("video/mp4");
      if (url.pathname.endsWith("/initialize")) return Response.json({ data: { id: "v1" } });
      if (url.pathname.endsWith("/append")) return new Response(null, { status: 204 });
      if (url.pathname.endsWith("/finalize")) {
        return Response.json({ data: { id: "v1", processing_info: { state: "pending", check_after_secs: 3 } } });
      }
      if (url.pathname === "/2/media/upload") {
        polls++;
        return Response.json({ data: { processing_info: { state: polls < 2 ? "in_progress" : "succeeded", check_after_secs: 1 } } });
      }
      return Response.json({ data: { id: "t3" } });
    });
    const res = await publishToTwitter(ctx, { text: "vid", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.mp4"] }, deps);
    expect(res.publishedPostId).toBe("t3");
    expect(polls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("fails permanently on failed media processing", async () => {
    const { deps } = mock((url) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("video/mp4");
      if (url.pathname.endsWith("/initialize")) return Response.json({ data: { id: "v1" } });
      if (url.pathname.endsWith("/append")) return new Response(null, { status: 204 });
      return Response.json({ data: { processing_info: { state: "failed", error: { message: "bad codec" } } } });
    });
    await expect(publishToTwitter(ctx, { text: "v", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.mp4"] }, deps)).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining("bad codec"),
    });
  });

  it("rejects mixing a video with images before calling the API", async () => {
    const { deps, calls } = mock(() => Response.json({}));
    await expect(publishToTwitter(ctx, { text: "x", mediaUrls: ["/a.mp4", "/b.png"] }, deps)).rejects.toBeInstanceOf(PublishError);
    expect(calls).toHaveLength(0);
  });

  it("classifies errors: 401 permanent, 429 and 5xx retryable", async () => {
    for (const [status, retryable] of [[401, false], [403, false], [429, true], [503, true]] as const) {
      const { deps } = mock(() => new Response("nope", { status }));
      await expect(publishToTwitter(ctx, { text: "x", mediaUrls: [] }, deps)).rejects.toMatchObject({ retryable, status });
    }
  });
});

describe("LinkedIn publisher", () => {
  const linkedinHeaders = (c: Call) => c.init.headers as Record<string, string>;

  it("posts text through /rest/posts with version headers and escaped commentary", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202610");
    const { deps, calls } = mock(() => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:99" } }));
    const res = await publishToLinkedIn(ctx, { text: "a_b #tag", mediaUrls: [] }, deps);

    expect(res.publishedPostId).toBe("urn:li:share:99");
    expect(paths(calls)).toEqual(["POST api.linkedin.com/rest/posts"]);
    expect(linkedinHeaders(calls[0])["Linkedin-Version"]).toBe("202610");
    expect(linkedinHeaders(calls[0])["X-Restli-Protocol-Version"]).toBe("2.0.0");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ author: "urn:li:person:u1", commentary: "a\\_b #tag", visibility: "PUBLIC", lifecycleState: "PUBLISHED" });
    expect(body.content).toBeUndefined();
  });

  it("uploads one image and references it as content.media", async () => {
    const { deps, calls } = mock((url) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("image/jpeg");
      if (url.pathname === "/rest/images") return Response.json({ value: { uploadUrl: "https://upload.li/1", image: "urn:li:image:1" } });
      if (url.host === "upload.li") return new Response(null, { status: 201 });
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } });
    });
    await publishToLinkedIn(ctx, { text: "pic", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.jpg"] }, deps);
    expect(paths(calls)).toEqual([
      "GET localhost:3000/api/media/00000000-0000-4000-8000-00000000000a.jpg",
      "POST api.linkedin.com/rest/images",
      "PUT upload.li/1",
      "POST api.linkedin.com/rest/posts",
    ]);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ initializeUploadRequest: { owner: "urn:li:person:u1" } });
    expect(JSON.parse(calls[3].init.body as string).content).toEqual({ media: { id: "urn:li:image:1" } });
  });

  it("uses multiImage for several images", async () => {
    let n = 0;
    const { deps, calls } = mock((url) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("image/jpeg");
      if (url.pathname === "/rest/images") {
        n++;
        return Response.json({ value: { uploadUrl: `https://upload.li/${n}`, image: `urn:li:image:${n}` } });
      }
      if (url.host === "upload.li") return new Response(null, { status: 201 });
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:2" } });
    });
    await publishToLinkedIn(ctx, { text: "two", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.jpg", "/api/media/00000000-0000-4000-8000-00000000000b.jpg"] }, deps);
    const post = JSON.parse(calls.at(-1)!.init.body as string);
    expect(post.content).toEqual({ multiImage: { images: [{ id: "urn:li:image:1" }, { id: "urn:li:image:2" }] } });
  });

  it("uploads a video in parts, finalizes with ETags and waits until AVAILABLE", async () => {
    let status = 0;
    const { deps, calls, sleep } = mock((url, init) => {
      if (url.pathname.startsWith("/api/media")) return mediaResponse("video/mp4", 10);
      if (url.pathname === "/rest/videos" && url.searchParams.get("action") === "initializeUpload") {
        return Response.json({
          value: {
            video: "urn:li:video:1",
            uploadToken: "utok",
            uploadInstructions: [
              { uploadUrl: "https://upload.li/p1", firstByte: 0, lastByte: 5 },
              { uploadUrl: "https://upload.li/p2", firstByte: 6, lastByte: 9 },
            ],
          },
        });
      }
      if (url.host === "upload.li") {
        const part = url.pathname.slice(1);
        return new Response(null, { status: 200, headers: { etag: `"etag-${part}"` } });
      }
      if (url.searchParams.get("action") === "finalizeUpload") return new Response(null, { status: 200 });
      if (url.pathname.startsWith("/rest/videos/")) {
        return Response.json({ status: ++status < 2 ? "PROCESSING" : "AVAILABLE" });
      }
      void init;
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:3" } });
    });
    const res = await publishToLinkedIn(ctx, { text: "video", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.mp4"] }, deps);

    expect(res.publishedPostId).toBe("urn:li:share:3");
    const put1 = calls.find((c) => c.url.pathname === "/p1")!;
    expect((put1.init.body as Uint8Array).length).toBe(6); // bytes 0..5 inclusive
    const fin = calls.find((c) => c.url.searchParams.get("action") === "finalizeUpload")!;
    expect(JSON.parse(fin.init.body as string).finalizeUploadRequest).toEqual({
      video: "urn:li:video:1",
      uploadToken: "utok",
      uploadedPartIds: ["etag-p1", "etag-p2"], // quotes stripped, order kept
    });
    expect(sleep).toHaveBeenCalled();
    expect(JSON.parse(calls.at(-1)!.init.body as string).content).toEqual({ media: { id: "urn:li:video:1" } });
  });

  it("surfaces API rejections as permanent errors", async () => {
    const { deps } = mock(() => new Response('{"message":"ACCESS_DENIED"}', { status: 403 }));
    await expect(publishToLinkedIn(ctx, { text: "x", mediaUrls: [] }, deps)).rejects.toMatchObject({ retryable: false, status: 403 });
  });
});

describe("Threads publisher", () => {
  const form = (c: Call) => Object.fromEntries((c.init.body as URLSearchParams).entries());

  it("creates a TEXT container then publishes it", async () => {
    const { deps, calls } = mock((url) => {
      if (url.pathname === "/v1.0/u1/threads") return Response.json({ id: "c1" });
      if (url.pathname === "/v1.0/c1") return Response.json({ status: "FINISHED" });
      return Response.json({ id: "p1" });
    });
    const container = await createThreadsContainer(ctx, { text: "hi", mediaUrls: [] }, deps);
    expect(container).toEqual({ creationId: "c1", hasMedia: false });
    expect(form(calls[0])).toMatchObject({ media_type: "TEXT", text: "hi", access_token: "tok" });

    const res = await publishThreadsContainer(ctx, "c1", deps);
    expect(res.publishedPostId).toBe("p1");
    expect(paths(calls)).toEqual([
      "POST graph.threads.com/v1.0/u1/threads",
      "GET graph.threads.com/v1.0/c1",
      "POST graph.threads.com/v1.0/u1/threads_publish",
    ]);
    expect(form(calls[2])).toMatchObject({ creation_id: "c1" });
  });

  it("refuses local media URLs because Threads must fetch them", async () => {
    const { deps, calls } = mock(() => Response.json({ id: "x" }));
    await expect(createThreadsContainer(ctx, { text: "x", mediaUrls: ["/api/media/00000000-0000-4000-8000-00000000000a.png"] }, deps)).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining("herkese açık"),
    });
    expect(calls).toHaveLength(0);
  });

  it("builds a carousel from item containers", async () => {
    let n = 0;
    const { deps, calls } = mock(() => Response.json({ id: `c${++n}` }));
    const container = await createThreadsContainer(
      ctx,
      { text: "album", mediaUrls: ["https://cdn.x/a.jpg", "https://cdn.x/video/upload/b.mp4"] },
      deps,
    );
    expect(container).toEqual({ creationId: "c3", hasMedia: true });
    expect(form(calls[0])).toMatchObject({ media_type: "IMAGE", image_url: "https://cdn.x/a.jpg", is_carousel_item: "true" });
    expect(form(calls[1])).toMatchObject({ media_type: "VIDEO", is_carousel_item: "true" });
    expect(form(calls[2])).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2", text: "album" });
  });

  it("polls until the container is ready and fails on ERROR", async () => {
    let n = 0;
    const ok = mock((url) =>
      url.pathname === "/v1.0/c1" ? Response.json({ status: ++n < 3 ? "IN_PROGRESS" : "FINISHED" }) : Response.json({ id: "p9" }),
    );
    await publishThreadsContainer(ctx, "c1", ok.deps);
    expect(ok.sleep).toHaveBeenCalledTimes(2);

    const bad = mock(() => Response.json({ status: "ERROR", error_message: "bad media" }));
    await expect(publishThreadsContainer(ctx, "c1", bad.deps)).rejects.toMatchObject({ retryable: false });
  });
});

describe("media download (SSRF)", () => {
  const url = "/api/media/00000000-0000-4000-8000-00000000000a.png";

  it("never follows redirects: an allowed URL must not bounce the server to an internal address", async () => {
    const { deps, calls } = mock(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }));
    await expect(publishToTwitter(ctx, { text: "x", mediaUrls: [url] }, deps)).rejects.toMatchObject({ retryable: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.redirect).toBe("manual");
  });
});
