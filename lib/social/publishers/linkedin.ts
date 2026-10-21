import {
  PublishError,
  defaultDeps,
  downloadMedia,
  failFromResponse,
  splitMedia,
  type Deps,
  type PublishContext,
  type PublishInput,
  type PublishResult,
} from "./shared";

const API = "https://api.linkedin.com/rest";

/** Posts API requires a version in YYYYMM format; override with LINKEDIN_API_VERSION when upgrading. */
const version = () => process.env.LINKEDIN_API_VERSION ?? "202610";

/**
 * LinkedIn "little text format": these characters are reserved and must be escaped with a backslash,
 * otherwise the API treats them as markup (mentions, templates) and may reject or garble the post.
 * A `#` directly before a word is kept as a real hashtag.
 * Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
 */
export function escapeLittleText(text: string): string {
  return text.replace(/[|{}@[\]()<>\\*_~]|#(?![\p{L}\p{N}_])/gu, (m) => `\\${m}`);
}

/**
 * Publishes to a member's LinkedIn feed with the Posts API (/rest/posts), which replaces ugcPosts.
 * Text only, one image, several images (multiImage), or one video.
 */
export async function publishToLinkedIn(
  ctx: PublishContext,
  input: PublishInput,
  deps: Deps = defaultDeps,
): Promise<PublishResult> {
  const owner = `urn:li:person:${ctx.platformUserId}`;
  const { images, videos } = splitMedia(input.mediaUrls);
  if (videos.length > 1 || (videos.length === 1 && images.length > 0)) {
    throw new PublishError("LinkedIn: bir gönderide görsel ve video birlikte ya da birden fazla video olamaz", false);
  }

  const headers = {
    Authorization: `Bearer ${ctx.accessToken}`,
    "Linkedin-Version": version(),
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const json = { ...headers, "Content-Type": "application/json" };

  let content: Record<string, unknown> | undefined;
  if (videos.length === 1) {
    content = { media: { id: await uploadVideo(owner, videos[0], headers, deps) } };
  } else if (images.length > 0) {
    const ids: string[] = [];
    for (const url of images) ids.push(await uploadImage(owner, url, headers, deps));
    content = ids.length === 1 ? { media: { id: ids[0] } } : { multiImage: { images: ids.map((id) => ({ id })) } };
  }

  const res = await deps.fetch(`${API}/posts`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      author: owner,
      commentary: escapeLittleText(input.text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    }),
  });
  if (!res.ok) await failFromResponse(res, "LinkedIn post");

  // 201 with no body; the new post URN is in the x-restli-id header
  const id = res.headers.get("x-restli-id");
  if (!id) throw new PublishError("LinkedIn: yanıtta gönderi kimliği (x-restli-id) yok", false);
  return { publishedPostId: id };
}

type AuthHeaders = Record<string, string>;

async function uploadImage(owner: string, url: string, headers: AuthHeaders, deps: Deps): Promise<string> {
  const file = await downloadMedia(url, deps);
  const init = await deps.fetch(`${API}/images?action=initializeUpload`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!init.ok) await failFromResponse(init, "LinkedIn image initialize");
  const { value } = (await init.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!value?.uploadUrl || !value.image) throw new PublishError("LinkedIn: görsel yükleme adresi alınamadı", false);

  const put = await deps.fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: headers.Authorization, "Content-Type": "application/octet-stream" },
    body: file.bytes as BodyInit,
  });
  if (!put.ok) await failFromResponse(put, "LinkedIn image upload");
  return value.image;
}

async function uploadVideo(owner: string, url: string, headers: AuthHeaders, deps: Deps): Promise<string> {
  const file = await downloadMedia(url, deps);
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const init = await deps.fetch(`${API}/videos?action=initializeUpload`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      initializeUploadRequest: { owner, fileSizeBytes: file.bytes.length, uploadCaptions: false, uploadThumbnail: false },
    }),
  });
  if (!init.ok) await failFromResponse(init, "LinkedIn video initialize");
  const { value } = (await init.json()) as {
    value?: { video?: string; uploadToken?: string; uploadInstructions?: { uploadUrl: string; firstByte: number; lastByte: number }[] };
  };
  if (!value?.video || !value.uploadInstructions?.length) throw new PublishError("LinkedIn: video yükleme bilgisi alınamadı", false);

  // Each part's ETag response header is its id; finalize needs them in order
  const partIds: string[] = [];
  for (const part of value.uploadInstructions) {
    const put = await deps.fetch(part.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.bytes.slice(part.firstByte, part.lastByte + 1) as BodyInit,
    });
    if (!put.ok) await failFromResponse(put, "LinkedIn video part upload");
    const etag = put.headers.get("etag");
    if (!etag) throw new PublishError("LinkedIn: video parçası için ETag dönmedi", true);
    partIds.push(etag.replace(/^"|"$/g, ""));
  }

  const fin = await deps.fetch(`${API}/videos?action=finalizeUpload`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ finalizeUploadRequest: { video: value.video, uploadToken: value.uploadToken ?? "", uploadedPartIds: partIds } }),
  });
  if (!fin.ok) await failFromResponse(fin, "LinkedIn video finalize");

  // Wait until LinkedIn finished processing the video
  for (let attempt = 0; attempt < 20; attempt++) {
    const st = await deps.fetch(`${API}/videos/${encodeURIComponent(value.video)}`, { headers });
    if (!st.ok) await failFromResponse(st, "LinkedIn video status");
    const status = ((await st.json()) as { status?: string }).status;
    if (status === "AVAILABLE") return value.video;
    if (status === "PROCESSING_FAILED") throw new PublishError("LinkedIn videoyu işleyemedi", false);
    await deps.sleep(3000);
  }
  throw new PublishError("LinkedIn: video işleme zaman aşımına uğradı", true);
}
