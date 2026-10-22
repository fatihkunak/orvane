import { NonRetriableError } from "inngest";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  claimPlatform,
  findDuePostIds,
  finalizePost,
  loadPublishJob,
  markFailed,
  mediaFor,
  markPublished,
  publishContext,
  publishDirect,
  type PublishTarget,
} from "@/lib/publishing";
import { PublishError } from "@/lib/social/publishers/shared";
import {
  THREADS_MEDIA_WAIT_SECONDS,
  createThreadsContainer,
  publishThreadsContainer,
} from "@/lib/social/publishers/threads";
import { getAccessToken } from "@/lib/social/tokens";
import { POST_PUBLISH_REQUESTED, inngest, publishEventId } from "./client";

const payload = z.object({ postId: z.string().min(1) });

/** Inngest retries any thrown error; errors that cannot succeed on retry must say so. */
function asStepError(e: unknown): never {
  if (e instanceof PublishError && !e.retryable) throw new NonRetriableError(e.message, { cause: e });
  throw e;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Every minute: find SCHEDULED posts whose time has come and fan out one event per post.
 * Fan-out (instead of publishing here) gives each post its own retries and concurrency control.
 */
export const schedulePosts = inngest.createFunction(
  { id: "schedule-due-posts", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const now = Date.now();
    const ids = await step.run("find-due-posts", () => findDuePostIds());
    if (ids.length > 0) {
      await step.sendEvent(
        "fan-out",
        ids.map((postId) => ({ id: publishEventId(postId, now), name: POST_PUBLISH_REQUESTED, data: { postId } })),
      );
    }
    return { queued: ids.length };
  },
);

/** Publishes one post to each of its platforms. A failure on one platform never blocks the others. */
export async function publishPostHandler({ event, step }: { event: { data: unknown }; step: Step }) {
  const { postId } = payload.parse(event.data);
  const job = await step.run("load-post", () => loadPublishJob(postId));
  if (!job) return { skipped: true };

  for (const target of job.targets) {
    // The claim is its own step so its result is memoized: a retry of the publish step
    // must not try to claim again (the row is already PUBLISHING).
    const claimed = await step.run(`claim-${target.platform}`, () => claimPlatform(target.id));
    if (!claimed) continue;

    try {
      const result = await publishTo(step, target, { text: target.text ?? job.text, mediaUrls: mediaFor(target, job.mediaUrls) });
      await step.run(`done-${target.platform}`, () => markPublished(target.id, result.publishedPostId));
    } catch (e) {
      await step.run(`fail-${target.platform}`, () => markFailed(target.id, messageOf(e)));
    }
  }

  const status = await step.run("finalize-post", () => finalizePost(postId));
  return { postId, status };
}

export const publishPost = inngest.createFunction(
  {
    id: "publish-post",
    triggers: [{ event: POST_PUBLISH_REQUESTED }],
    retries: 3,
    concurrency: { limit: 5 }, // be gentle with platform rate limits
  },
  ({ event, step }) => publishPostHandler({ event, step }),
);

type Step = Parameters<Parameters<typeof inngest.createFunction>[1]>[0]["step"];

async function publishTo(step: Step, target: PublishTarget, input: { text: string; mediaUrls: string[] }) {
  if (target.platform !== "THREADS") {
    return step.run(`publish-${target.platform}`, () => publishDirect(target, input).catch(asStepError));
  }

  // Threads needs a pause between creating the container and publishing it, so it is three steps
  const container = await step.run("threads-container", async () =>
    createThreadsContainer(await publishContext(target.socialAccountId), input).catch(asStepError),
  );
  if (container.hasMedia) await step.sleep("threads-wait", `${THREADS_MEDIA_WAIT_SECONDS}s`);
  return step.run("threads-publish", async () =>
    publishThreadsContainer(await publishContext(target.socialAccountId), container.creationId).catch(asStepError),
  );
}

/**
 * Daily: renew tokens that expire within a week (Threads long-lived tokens, LinkedIn refresh tokens).
 * X tokens last 2 hours and are renewed on demand right before publishing.
 */
export const refreshTokens = inngest.createFunction(
  { id: "refresh-expiring-tokens", triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const ids = await step.run("find-expiring", async () => {
      const rows = await prisma.socialAccount.findMany({
        where: { expiresAt: { lt: new Date(Date.now() + 7 * 24 * 60 * 60_000), gt: new Date() } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    });

    let failed = 0;
    for (const id of ids) {
      try {
        await step.run(`refresh-${id}`, () => getAccessToken(id)); // refreshes when due
      } catch (e) {
        failed++;
        console.warn(`token refresh failed for ${id}`, e);
      }
    }
    return { checked: ids.length, failed };
  },
);

export const functions = [schedulePosts, publishPost, refreshTokens];
