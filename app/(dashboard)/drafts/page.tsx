import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { DraftRow } from "@/components/posts/draft-row";
import { buttonVariants } from "@/components/ui/button";
import { NEW_POST_HREF } from "@/components/layout/nav-items";
import { listDrafts } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

export const metadata = { title: "Taslaklar" };

export default async function DraftsPage() {
  const session = await auth();
  const drafts = await listDrafts(session!.user.id); // layout guarantees a session

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Taslaklar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Kaydettiğin ve bağlı bir model ya da yapay zekâyla hazırlanan taslaklar burada bekler. Birini açıp görsel ekleyebilir, tarih seçip zamanlayabilir ya da hemen yayınlayabilirsin.
          </p>
        </div>
        <Link href={NEW_POST_HREF} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
          <Plus />
          Yeni gönderi
        </Link>
      </div>

      {drafts.length === 0 ? (
        <p className="card-surface text-muted-foreground p-6 text-center text-sm">Henüz taslak yok. Gönderi formunda “Taslak olarak kaydet”e basınca ya da MCP ile bir taslak hazırlandığında burada görünür.</p>
      ) : (
        <ul className="space-y-3" aria-label="Taslaklar">
          {drafts.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ul>
      )}
    </div>
  );
}
