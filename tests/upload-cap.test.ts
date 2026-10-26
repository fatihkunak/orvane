import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u-cap" } })) }));
vi.mock("@/lib/media-store", () => ({ storeMediaBytes: vi.fn(async () => ({ url: "/api/media/x.png", kind: "image" })) }));
// A tiny limit so the test streams kilobytes, not hundreds of megabytes (the route allows 1 MB of multipart overhead on top)
vi.mock("@/lib/media", async (orig) => ({ ...(await orig<typeof import("@/lib/media")>()), MAX_VIDEO_BYTES: 1024 }));
import { POST as uploadPost } from "@/app/api/upload/route";

const CHUNK = 64 * 1024;
const TOTAL = 8 * 1024 * 1024; // far above the ~1 MB the route accepts

/** A request whose body arrives in chunks with no Content-Length, like a chunked upload. Counts how much was pulled. */
function chunkedUpload() {
  const state = { pulled: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= TOTAL) return controller.close();
      state.pulled += CHUNK;
      controller.enqueue(new Uint8Array(CHUNK));
    },
  });
  const req = new Request("http://x/api/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body,
    duplex: "half",
  } as RequestInit);
  return { req, state };
}

describe("upload body cap without Content-Length", () => {
  it("answers 413 and stops reading long before the whole body has been buffered", async () => {
    const { req, state } = chunkedUpload();
    expect(req.headers.get("content-length")).toBeNull();
    const res = await uploadPost(req);
    expect(res.status).toBe(413);
    expect(state.pulled).toBeLessThan(TOTAL / 2);
  });

  it("still accepts a normal small upload", async () => {
    const form = new FormData();
    form.set("file", new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "a.png", { type: "image/png" }));
    const res = await uploadPost(new Request("http://x/api/upload", { method: "POST", body: form }));
    expect(res.status).toBe(200);
  });
});
