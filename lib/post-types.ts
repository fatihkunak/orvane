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

/**
 * The edit form (`getPostForForm`) only opens a DRAFT or a SCHEDULED post; a FAILED, PUBLISHING or PUBLISHED one is a 404,
 * so no list or notification may link to it.
 */
export const isEditableStatus = (status: PostStatus): boolean => status === "DRAFT" || status === "SCHEDULED";

export const hydratePost =(d: PostDTO): PostItem => ({ ...d, scheduledAt: new Date(d.scheduledAt) });
