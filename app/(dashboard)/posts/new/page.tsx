import { auth } from "@/auth";
import { CreatePostForm } from "@/components/posts/create-post-form";
import type { ConnectedMap } from "@/components/platform/platform-selector";
import type { AiProviderOption } from "@/components/ai/ai-assistant";
import { getProvider } from "@/lib/ai/providers";
import { listConfigs } from "@/lib/ai/store";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Yeni Gönderi" };

export default async function NewPostPage() {
  const session = await auth();
  const userId = session!.user.id; // layout guarantees a session
  const [accounts, aiConfigs] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { provider: true, username: true },
    }),
    listConfigs(userId),
  ]);

  const connected: ConnectedMap = {};
  for (const a of accounts) connected[a.provider] ??= { username: a.username };

  // Only what the form needs: never the key
  const aiProviders: AiProviderOption[] = aiConfigs.map((c) => {
    const info = getProvider(c.provider)!;
    return { id: c.provider, label: info.label, model: c.model ?? info.defaultModel ?? null };
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <CreatePostForm connected={connected} aiProviders={aiProviders} />
    </div>
  );
}
