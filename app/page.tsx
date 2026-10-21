import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

/**
 * Temporary landing page for Step 1: it only proves that the dark theme, the brand
 * tokens and the shadcn components are wired up. The real landing page comes later.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-24 text-center">
      <div className="flex items-center gap-3">
        <LogoMark size={56} />
        <span className="text-4xl font-semibold tracking-tight">PostForge</span>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Tek içerik. Tüm platformlar.
        </h1>
        <p className="text-muted-foreground text-lg">
          Threads, LinkedIn ve X için planla, yönet, otomatik yayınla.
        </p>
      </div>

      <div className="card-surface flex w-full max-w-sm flex-col gap-3 p-5">
        <Link
          href="/login"
          className={cn(
            buttonVariants(),
            "bg-brand-gradient shadow-glow h-11 border-0 text-white hover:opacity-90",
          )}
        >
          <CalendarClock className="size-4" />
          Hesabını Başlat
        </Link>
        <p className="text-muted-foreground text-sm">Kurulum tamamlandı (Adım 1).</p>
      </div>
    </main>
  );
}
