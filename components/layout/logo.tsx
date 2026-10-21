import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** PostForge mark: the transparent "P" from the brand logo (public/logo-mark.png). */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt="PostForge"
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}

/** PostForge wordmark: logo mark + white text (the colour stays in the mark, never in the text). */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={36} />
      <span className="text-xl font-semibold tracking-tight">PostForge</span>
    </Link>
  );
}
