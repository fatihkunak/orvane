"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { hydratePost, type PostDTO } from "@/lib/post-types";
import { formatWhen } from "@/lib/format";
import { useToday } from "@/lib/use-today";
import { PostRow } from "@/components/posts/post-row";

/** Next scheduled posts. Client component because "now" is the browser's clock. */
export function UpcomingPosts({ posts, limit = 3 }: { posts: PostDTO[]; limit?: number }) {
  const today = useToday();

  const upcoming = useMemo(() => {
    if (!today) return [];
    return posts
      .map(hydratePost)
      .filter((p) => p.status === "SCHEDULED" && p.scheduledAt >= today)
      .slice(0, limit);
  }, [posts, today, limit]);

  return (
    <section aria-labelledby="upcoming-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="upcoming-title" className="text-base font-semibold">
          Yaklaşan Yayınlar
        </h2>
        <Link href="/calendar" className="text-brand-blue text-sm font-medium hover:underline">
          Tümünü Gör
        </Link>
      </div>

      {!today ? (
        // Skeleton while the browser date is not known yet
        <ul className="space-y-3" aria-hidden>
          {Array.from({ length: limit }).map((_, i) => (
            <li key={i} className="card-surface bg-surface-2 h-[88px] animate-pulse" />
          ))}
        </ul>
      ) : upcoming.length === 0 ? (
        <div className="card-surface text-muted-foreground flex flex-col items-center gap-3 px-4 py-10 text-sm">
          <CalendarClock className="size-6" />
          Planlanmış gönderi yok
          <Link href="/posts/new" className="text-brand-blue font-medium hover:underline">
            İlk gönderini oluştur
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((p) => (
            <PostRow key={p.id} post={p} whenLabel={formatWhen(p.scheduledAt, today)} />
          ))}
        </ul>
      )}
    </section>
  );
}
