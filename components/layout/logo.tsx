import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Orvane mark: the cream "O" with the teal arrow (public/logo-mark.png, transparent). */
export function LogoMark({ size = 36, className, alt = BRAND.name }: { size?: number; className?: string; alt?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt={alt}
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}

/** Orvane wordmark image (cream, transparent). The file is 480x72, so the width follows the height. */
export function Wordmark({ height = 20, className }: { height?: number; className?: string }) {
  return (
    <Image
      src="/logo-wordmark.png"
      alt={BRAND.name}
      width={Math.round((height * 480) / 72)}
      height={height}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}

/** Mark + wordmark lockup for the sidebar and top bar. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" aria-label={BRAND.name} className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={36} alt="" />
      <Wordmark height={18} />
    </Link>
  );
}
