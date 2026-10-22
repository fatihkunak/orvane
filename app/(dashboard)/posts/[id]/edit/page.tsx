import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { CreatePostForm } from "@/components/posts/create-post-form";
import type { ConnectedMap } from "@/components/platform/platform-selector";
import type { AiProviderOption } from "@/components/ai/ai-assistant";
import { getProvider } from "@/lib/ai/providers";
import { listConfigs } from "@/lib/ai/store";
import { prisma } from "@/lib/prisma";
import { getDraftForForm } from "@/lib/queries/posts";

export const metadata = { title: "Taslağı Düzenle" };

/** Continue a draft: same form as a new post, filled in. Only the owner's DRAFT opens; anything else is a 404. */
export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session!.user.id; // layout guarantees a session
  const { id } = await params;

  const [draft, accounts, aiConfigs] = await Promise.all([
    getDraftForForm(userId, id),
    prisma.socialAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { provider: true, username: true } }),
    listConfigs(userId),
  ]);
  if (!draft) notFound();

  const connected: ConnectedMap = {};
  for (const a of accounts) connected[a.provider] ??= { username: a.username };
  const aiProviders: AiProviderOption[] = aiConfigs.map((c) => {
    const info = getProvider(c.provider)!;
    return { id: c.provider, label: info.label, model: c.model ?? info.defaultModel ?? null };
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Link href="/drafts" className="text-muted-foreground hover:text-foreground text-sm">
        ← Taslaklar
      </Link>
      <CreatePostForm connected={connected} aiProviders={aiProviders} initial={draft} />
    </div>
  );
}
