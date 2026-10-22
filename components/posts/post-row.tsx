"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/format";
import type { PostItem } from "@/lib/post-types";
import { PlatformChip } from "@/components/platform/platform-icon";
import { deletePostAction } from "@/server/actions/posts";

/** One post in a list: thumbnail, time label, platform chips, text and status. */
export function PostRow({ post, whenLabel }: { post: PostItem; whenLabel: string }) {
  const status = STATUS_META[post.status];
  const [pending, startTransition] = useTransition();
  const deletable = post.status !== "PUBLISHED";
  // Anything not sent yet can be opened in the form (a scheduled post can be rewritten or unscheduled there)
  const editable = post.status !== "PUBLISHED";

  function remove() {
    startTransition(async () => {
      const res = await deletePostAction(post.id);
      if (!res.ok) toast.error(res.error);
      else toast.success("Gönderi silindi");
    });
  }

  return (
    <li className={cn("card-surface flex items-start gap-3 p-3", pending && "opacity-50")}>
      {/* Placeholder thumbnail; media URLs are not loaded into lists yet */}
      <div
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-lg",
          post.hasMedia ? "bg-brand-gradient opacity-80" : "bg-accent",
        )}
      >
        <ImageIcon className={cn("size-5", post.hasMedia ? "text-brand-ink" : "text-muted-foreground")} />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">{whenLabel}</span>
          <span className="flex gap-1">
            {post.platforms.map((p) => (
              <PlatformChip key={p} platform={p} className="size-5 rounded" />
            ))}
          </span>
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>
            {status.label}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-snug">{post.text}</p>
        {post.status === "FAILED" && post.error && (
          <p className="text-destructive line-clamp-2 text-xs">{post.error}</p>
        )}
      </div>

      {editable && (
        <Link
          href={`/posts/${post.id}/edit`}
          aria-label="Gönderiyi düzenle"
          title="Düzenle"
          className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
        >
          <Pencil className="size-4" />
        </Link>
      )}

      {deletable && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Gönderiyi sil"
          className="text-muted-foreground hover:text-destructive -mr-1 grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
