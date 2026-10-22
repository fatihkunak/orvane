import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { CreatePostForm } from "@/components/posts/create-post-form";
import type { ConnectedMap } from "@/components/platform/platform-selector";
import type { AiProviderOption } from "@/components/ai/ai-assistant";
import { getProvider } from "@/lib/ai/providers";
import { listConfigs } from "@/lib/ai/store";
import { prisma } from "@/lib/prisma";
import { getPostForForm } from "@/lib/queries/posts";

export const metadata = { title: "Gönderiyi Düzenle" };

/**
 * Same form as a new post, filled in. Opens a DRAFT (from "Taslaklar") and a SCHEDULED post that has not gone out yet (from
 * the calendar), so a scheduled post can be rewritten, rescheduled or turned back into a draft. Anything already sent is 404.
 */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session!.user.id; // layout guarantees a session
  const { id } = await params;

  const [post, accounts, aiConfigs] = await Promise.all([
    getPostForForm(userId, id),
    prisma.socialAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { provider: true, username: true } }),
    listConfigs(userId),
  ]);
  if (!post) notFound();

  const connected: ConnectedMap = {};
  for (const a of accounts) connected[a.provider] ??= { username: a.username };
  const aiProviders: AiProviderOption[] = aiConfigs.map((c) => {
    const info = getProvider(c.provider)!;
    return { id: c.provider, label: info.label, model: c.model ?? info.defaultModel ?? null, canDraw: !!(c.imageModel || info.imageModels?.length) };
  });

  const back = post.status === "DRAFT" ? { href: "/drafts", label: "Taslaklar" } : { href: "/calendar", label: "Takvim" };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <Link href={back.href} className="text-muted-foreground hover:text-foreground text-sm">
        ← {back.label}
      </Link>
      <CreatePostForm connected={connected} aiProviders={aiProviders} initial={post} />
    </div>
  );
}
