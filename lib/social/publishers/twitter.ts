import {
  PublishError,
  defaultDeps,
  downloadMedia,
  failFromResponse,
  splitMedia,
  type Deps,
  type MediaFile,
  type PublishContext,
  type PublishInput,
  type PublishResult,
} from "./shared";

const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024; // X accepts <= 5 MB per append call (docs); stay below it

/**
 * Publishes a post to X (API v2).
 * Media: chunked upload (initialize → append → finalize → poll) → POST /2/tweets with media_ids.
 * Docs: https://docs.x.com/x-api/media/quickstart/media-upload-chunked
 */
export async function publishToTwitter(
  ctx: PublishContext,
  input: PublishInput,
  deps: Deps = defaultDeps,
): Promise<PublishResult> {
  const { images, videos } = splitMedia(input.mediaUrls);
  if (videos.length > 1 || (videos.length === 1 && images.length > 0)) {
    throw new PublishError("X: bir gönderide en fazla 4 görsel veya 1 video olabilir", false);
  }
  if (images.length > 4) throw new PublishError("X: en fazla 4 görsel eklenebilir", false);

  const mediaIds: string[] = [];
  for (const url of input.mediaUrls) mediaIds.push(await uploadMedia(ctx, await downloadMedia(url, deps), deps));

  const res = await deps.fetch(`${API}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: input.text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
  });
  if (!res.ok) await failFromResponse(res, "X tweet");
  const json = (await res.json()) as { data?: { id?: string } };
  if (!json.data?.id) throw new PublishError("X: yanıtta gönderi kimliği yok", false);
  return { publishedPostId: json.data.id };
}

function category(file: MediaFile) {
  if (file.kind === "video") return "tweet_video";
  return file.contentType === "image/gif" ? "tweet_gif" : "tweet_image";
}

async function uploadMedia(ctx: PublishContext, file: MediaFile, deps: Deps): Promise<string> {
  const auth = { Authorization: `Bearer ${ctx.accessToken}` };

  const init = await deps.fetch(`${API}/media/upload/initialize`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: file.contentType, total_bytes: file.bytes.length, media_category: category(file) }),
  });
  if (!init.ok) await failFromResponse(init, "X media initialize");
  const id = ((await init.json()) as { data?: { id?: string } }).data?.id;
  if (!id) throw new PublishError("X: media initialize yanıtında kimlik yok", false);

  for (let i = 0, offset = 0; offset < file.bytes.length; i++, offset += CHUNK) {
    const form = new FormData();
    form.set("segment_index", String(i));
    form.set("media", new Blob([file.bytes.slice(offset, offset + CHUNK) as BlobPart], { type: file.contentType }));
    const append = await deps.fetch(`${API}/media/upload/${id}/append`, { method: "POST", headers: auth, body: form });
    if (!append.ok) await failFromResponse(append, `X media append #${i}`);
  }

  const fin = await deps.fetch(`${API}/media/upload/${id}/finalize`, { method: "POST", headers: auth });
  if (!fin.ok) await failFromResponse(fin, "X media finalize");
  let info = ((await fin.json()) as { data?: ProcessingData }).data?.processing_info;

  // Videos are transcoded asynchronously; wait until X says the media is usable
  for (let attempt = 0; info && attempt < 15; attempt++) {
    if (info.state === "succeeded") break;
    if (info.state === "failed") {
      throw new PublishError(`X medya işlenemedi: ${info.error?.message ?? "bilinmeyen hata"}`, false);
    }
    await deps.sleep(Math.min((info.check_after_secs ?? 2) * 1000, 10_000));
    const st = await deps.fetch(`${API}/media/upload?command=STATUS&media_id=${id}`, { headers: auth });
    if (!st.ok) await failFromResponse(st, "X media status");
    info = ((await st.json()) as { data?: ProcessingData }).data?.processing_info;
  }
  if (info && info.state !== "succeeded") throw new PublishError("X: medya işleme zaman aşımına uğradı", true);

  return id;
}

type ProcessingData = {
  processing_info?: { state: "pending" | "in_progress" | "succeeded" | "failed"; check_after_secs?: number; error?: { message?: string } };
};
