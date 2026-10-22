import type { Platform, PostStatus } from "@/generated/prisma/enums";

/** Post as the UI renders it. Dates are real Date objects (client side). */
export type PostItem = {
  id: string;
  text: string;
  platforms: Platform[];
  scheduledAt: Date;
  status: PostStatus;
  hasMedia: boolean;
  /** First image URL (shared or one platform's own), used as the list thumbnail */
  thumb: string | null;
  /** First platform error, shown on failed posts */
  error: string | null;
};

/** Serializable form passed from server components to client components. */
export type PostDTO = Omit<PostItem, "scheduledAt"> & { scheduledAt: string };

export const hydratePost = (d: PostDTO): PostItem => ({ ...d, scheduledAt: new Date(d.scheduledAt) });
