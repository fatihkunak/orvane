"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/lib/format";
import type { PostItem } from "@/lib/post-types";
import { PlatformChip } from "@/components/platform/platform-icon";
import { deletePostAction, reschedulePostAction } from "@/server/actions/posts";

/** `2026-10-23T09:30` in the browser's own timezone, the format a datetime-local input wants. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One post in a list: thumbnail, time label, platform chips, text and status. */
export function PostRow({ post, whenLabel, quickReschedule = false }: { post: PostItem; whenLabel: string; quickReschedule?: boolean }) {
  const status = STATUS_META[post.status];
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [whenDraft, setWhenDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  async function saveWhen() {
    if (!whenDraft) return;
    setSaving(true);
    // The input is local wall time; toISOString converts it with the browser's offset
    const r = await reschedulePostAction(post.id, new Date(whenDraft).toISOString());
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Yeni saate taşındı");
    setWhenDraft(null);
    router.refresh();
  }

  return (
    <li className={cn("card-surface flex items-start gap-3 p-3", pending && "opacity-50")}>
      {/* Real thumbnail when the post has an image; videos and media-less posts keep the icon */}
      <div className={cn("grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg", post.hasMedia ? "bg-brand-gradient" : "bg-accent")}>
        {post.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- stored media URL, fixed by the upload pipeline
          <img src={post.thumb} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className={cn("size-5", post.hasMedia ? "text-brand-ink" : "text-muted-foreground")} />
        )}
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

        {/* Quick reschedule: only for a scheduled post that has not gone out (the calendar asks for this) */}
        {quickReschedule && post.status === "SCHEDULED" && (
          whenDraft === null ? (
            <button
              type="button"
              onClick={() => setWhenDraft(toLocalInput(post.scheduledAt))}
              className="text-brand-mist text-xs font-medium hover:underline"
            >
              Saati değiştir
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="datetime-local"
                value={whenDraft}
                onChange={(e) => setWhenDraft(e.target.value)}
                aria-label="Yeni tarih ve saat"
                className="border-border bg-surface-2 h-8 rounded-md border px-2 text-xs"
              />
              <Button type="button" size="sm" disabled={saving || !whenDraft} onClick={() => void saveWhen()}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setWhenDraft(null)}>
                Vazgeç
              </Button>
            </div>
          )
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
