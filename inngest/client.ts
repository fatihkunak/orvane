import { Inngest } from "inngest";

/** Single Inngest client. Functions are registered in inngest/functions.ts. */
export const inngest = new Inngest({ id: "postforge" });

export const POST_PUBLISH_REQUESTED = "post/publish.requested";

/**
 * Event id used by Inngest to drop duplicates. Bucketed per 10 minutes, so the cron and a
 * "publish now" click for the same post collapse into one run, while a crashed run is retried
 * by a later bucket. (The DB claim in lib/publishing.ts is the real double-post guard.)
 */
export const publishEventId = (postId: string, now = Date.now()) =>
  `publish-${postId}-${Math.floor(now / (10 * 60_000))}`;
