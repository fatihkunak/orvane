import { FaLinkedin, FaThreads, FaXTwitter } from "react-icons/fa6";
import type { Platform } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { PLATFORMS } from "@/lib/platforms";

const ICONS = {
  THREADS: FaThreads,
  LINKEDIN: FaLinkedin,
  TWITTER: FaXTwitter,
} as const;

/** Bare brand glyph, inherits the current text color. */
export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = ICONS[platform];
  return <Icon aria-hidden className={className} />;
}

/** Small rounded chip with the platform's brand colors. */
export function PlatformChip({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      title={PLATFORMS[platform].label}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md",
        PLATFORMS[platform].chip,
        className,
      )}
    >
      <PlatformGlyph platform={platform} className="size-3.5" />
      <span className="sr-only">{PLATFORMS[platform].label}</span>
    </span>
  );
}
