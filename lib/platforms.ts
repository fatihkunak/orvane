import { Platform } from "@/generated/prisma/enums";

export type PlatformMeta = {
  id: Platform;
  label: string;
  /** Max characters per post (used by the create-post form in Step 5) */
  charLimit: number;
  /** Tailwind classes for the small colored chip behind the icon */
  chip: string;
};

/** Display metadata for every supported platform, keyed by the Prisma enum. */
export const PLATFORMS: Record<Platform, PlatformMeta> = {
  THREADS: { id: "THREADS", label: "Threads", charLimit: 500, chip: "bg-white text-black" },
  LINKEDIN: { id: "LINKEDIN", label: "LinkedIn", charLimit: 3000, chip: "bg-linkedin text-white" },
  TWITTER: { id: "TWITTER", label: "X", charLimit: 280, chip: "bg-[#16181c] text-white ring-1 ring-white/15" },
};

export const PLATFORM_LIST: PlatformMeta[] = Object.values(PLATFORMS);
