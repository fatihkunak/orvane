"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { PlatformChip } from "@/components/platform/platform-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DraftDTO } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";
import { deletePostAction } from "@/server/actions/posts";

const created = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });

/** One draft in the "Taslaklar" list: open it to add media and schedule, or delete it. */
export function DraftRow({ draft }: { draft: DraftDTO }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const own = draft.platforms.filter((p) => p.ownText).length;

  function remove() {
    startTransition(async () => {
      const res = await deletePostAction(draft.id);
      setConfirming(false);
      if (!res.ok) toast.error(res.error);
      else toast.success("Taslak silindi");
    });
  }

  return (
    <li className={cn("card-surface space-y-3 p-4", pending && "opacity-50")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex gap-1">
          {draft.platforms.map((p) => (
            <PlatformChip key={p.platform} platform={p.platform} className="size-5 rounded" />
          ))}
        </span>
        <span className="text-muted-foreground text-xs">{created(draft.createdAt)}</span>
        {own > 0 && <span className="bg-accent text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">{own === draft.platforms.length ? "Her platform için ayrı metin" : `${own} platformda ayrı metin`}</span>}
        {draft.hasMedia && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <ImageIcon className="size-3.5" aria-hidden /> Medya var
          </span>
        )}
      </div>
      <p className="line-clamp-3 text-sm leading-snug whitespace-pre-wrap">{draft.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/posts/${draft.id}/edit`} className={cn(buttonVariants({ size: "sm" }), "bg-brand-gradient border-0 text-brand-ink hover:opacity-90")}>
          <Pencil />
          Aç, görsel ekle, zamanla
        </Link>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            Silinsin mi?
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>
              Sil
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Vazgeç
            </Button>
          </span>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <Trash2 />
            Sil
          </Button>
        )}
      </div>
    </li>
  );
}
