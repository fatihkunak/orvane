import Link from "next/link";
import { ArrowUpRight, BarChart3, Plus } from "lucide-react";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { UpcomingPosts } from "@/components/dashboard/upcoming-posts";
import { NEW_POST_HREF } from "@/components/layout/nav-items";
import { listDatedPosts, postCounts } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ana Sayfa" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id; // layout guarantees a session
  const firstName = session?.user?.name?.split(" ")[0];

  const [posts, counts] = await Promise.all([listDatedPosts(userId), postCounts(userId)]);

  const stats = [
    { label: "Toplam Gönderi", value: counts.total },
    { label: "Planlanan", value: counts.scheduled },
    { label: "Yayınlanan", value: counts.published },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* The topbar shows the greeting on desktop; on mobile it lives here */}
      <div className="lg:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">
          Merhaba{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">Bugünün planı hazır. ☀️</p>
      </div>

      <section aria-label="Hızlı istatistikler" className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card-surface space-y-1 p-3 sm:p-4">
            <p className="text-muted-foreground truncate text-[11px] sm:text-xs">{s.label}</p>
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">{s.value}</p>
          </div>
        ))}
      </section>

      {counts.failed > 0 && (
        <Link href="/calendar" className="card-surface border-destructive/40 text-destructive block p-3 text-sm">
          {counts.failed} gönderi yayınlanamadı. Takvimden hata ayrıntısına bak.
        </Link>
      )}

      {counts.drafts > 0 && (
        <Link href="/drafts" className="card-surface border-brand-teal/40 block p-3 text-sm">
          {counts.drafts} taslak seni bekliyor. Aç, görsel ekle, zamanla →
        </Link>
      )}

      {/* Desktop has this button in the sidebar */}
      <Link
        href={NEW_POST_HREF}
        className={cn(
          buttonVariants(),
          "bg-brand-gradient shadow-glow h-12 w-full border-0 text-brand-ink hover:opacity-90 lg:hidden",
        )}
      >
        <Plus className="size-4" />
        Yeni İçerik Oluştur
      </Link>

      <UpcomingPosts posts={posts} />

      {/* Analytics is not in the mobile tab bar, so it is reachable from here */}
      <Link
        href="/analytics"
        className="card-surface hover:bg-surface-2 flex items-center gap-3 p-4 transition-colors lg:hidden"
      >
        <span className="bg-accent grid size-10 place-items-center rounded-xl">
          <BarChart3 className="text-brand-mist size-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Analitik</span>
          <span className="text-muted-foreground block text-xs">Gönderi ve platform dağılımı</span>
        </span>
        <ArrowUpRight className="text-muted-foreground size-4" />
      </Link>
    </div>
  );
}
