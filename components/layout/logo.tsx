import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Synapse wordmark: gradient bolt chip + white text (the gradient stays on the icon only). */
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-brand-gradient shadow-glow grid size-9 place-items-center rounded-xl">
        <Zap className="size-5 text-white" fill="currentColor" />
      </span>
      <span className="text-xl font-semibold tracking-tight">Synapse</span>
    </Link>
  );
}
