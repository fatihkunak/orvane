import {
  PublishError,
  defaultDeps,
  failFromResponse,
  type Deps,
  type PublishContext,
  type PublishInput,
  type PublishResult,
} from "./shared";
import { absoluteMediaUrl, mediaKind } from "@/lib/media";

const API = "https://graph.threads.com/v1.0";

/** Docs recommend waiting ~30 seconds between creating a media container and publishing it. */
export const THREADS_MEDIA_WAIT_SECONDS = 30;

type Container = { creationId: string; hasMedia: boolean };

async function post(path: string, ctx: PublishContext, params: Record<string, string>, deps: Deps, label: string) {
  const res = await deps.fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: ctx.accessToken }),
  });
  if (!res.ok) await failFromResponse(res, label);
  const id = ((await res.json()) as { id?: string }).id;
  if (!id) throw new PublishError(`${label}: yanıtta kimlik yok`, false);
  return id;
}

/** Threads downloads the media itself, so every URL has to be reachable from the public internet. */
function publicUrl(url: string): string {
  const abs = absoluteMediaUrl(url);
  const host = new URL(abs).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    throw new PublishError("Threads medya URL'si herkese açık olmalı (yerel dosya olamaz); Cloudinary'yi yapılandır", false);
  }
  return abs;
}

/**
 * Step 1 of 2: create the media container (nothing is public yet).
 * TEXT, one IMAGE/VIDEO, or a CAROUSEL (2+ items, each created as a carousel item first).
 */
export async function createThreadsContainer(
  ctx: PublishContext,
  input: PublishInput,
  deps: Deps = defaultDeps,
): Promise<Container> {
  const base = `/${ctx.platformUserId}/threads`;
  const urls = input.mediaUrls;

  if (urls.length === 0) {
    const creationId = await post(base, ctx, { media_type: "TEXT", text: input.text }, deps, "Threads container");
    return { creationId, hasMedia: false };
  }

  const itemParams = (url: string, extra: Record<string, string>) =>
    mediaKind(url) === "video"
      ? { media_type: "VIDEO", video_url: publicUrl(url), ...extra }
      : { media_type: "IMAGE", image_url: publicUrl(url), ...extra };

  if (urls.length === 1) {
    const creationId = await post(base, ctx, { ...itemParams(urls[0], {}), text: input.text }, deps, "Threads container");
    return { creationId, hasMedia: true };
  }

  const children: string[] = [];
  for (const url of urls) {
    children.push(await post(base, ctx, itemParams(url, { is_carousel_item: "true" }), deps, "Threads carousel item"));
  }
  const creationId = await post(
    base,
    ctx,
    { media_type: "CAROUSEL", children: children.join(","), text: input.text },
    deps,
    "Threads carousel",
  );
  return { creationId, hasMedia: true };
}

/**
 * Step 2 of 2: publish the container. For media containers, wait for processing first
 * (best effort: if the status endpoint is unavailable we go ahead, the publish call itself is authoritative).
 */
export async function publishThreadsContainer(
  ctx: PublishContext,
  creationId: string,
  deps: Deps = defaultDeps,
): Promise<PublishResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const st = await deps.fetch(
      `${API}/${creationId}?fields=status,error_message&access_token=${encodeURIComponent(ctx.accessToken)}`,
    );
    if (!st.ok) break;
    const { status, error_message } = (await st.json()) as { status?: string; error_message?: string };
    if (status === "ERROR" || status === "EXPIRED") {
      throw new PublishError(`Threads medyayı işleyemedi: ${error_message ?? status}`, false);
    }
    if (status !== "IN_PROGRESS") break; // FINISHED (or an unknown value): ready to publish
    await deps.sleep(3000);
  }

  const publishedPostId = await post(`/${ctx.platformUserId}/threads_publish`, ctx, { creation_id: creationId }, deps, "Threads publish");
  return { publishedPostId };
}

/** Convenience for callers that cannot split the work across job steps. */
export async function publishToThreads(ctx: PublishContext, input: PublishInput, deps: Deps = defaultDeps): Promise<PublishResult> {
  const container = await createThreadsContainer(ctx, input, deps);
  if (container.hasMedia) await deps.sleep(THREADS_MEDIA_WAIT_SECONDS * 1000);
  return publishThreadsContainer(ctx, container.creationId, deps);
}
