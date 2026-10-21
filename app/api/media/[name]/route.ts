import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  mp4: "video/mp4",
};

// Serves files saved by /api/upload in local dev. Names are random UUIDs, so the URL is unguessable.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Strict whitelist also blocks path traversal (no slashes or dots beyond the extension)
  const match = /^[0-9a-f-]{36}\.(jpg|png|gif|mp4)$/.exec(name);
  if (!match) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(path.join(process.cwd(), ".uploads", name));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[match[1]],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff", // never let a browser reinterpret these as HTML
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
