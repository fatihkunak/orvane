import { auth } from "@/auth";
import { CreatePostForm } from "@/components/posts/create-post-form";
import type { ConnectedMap } from "@/components/platform/platform-selector";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Yeni Gönderi" };

export default async function NewPostPage() {
  const session = await auth();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session!.user.id }, // layout guarantees a session
    orderBy: { createdAt: "asc" },
    select: { provider: true, username: true },
  });

  const connected: ConnectedMap = {};
  for (const a of accounts) connected[a.provider] ??= { username: a.username };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <CreatePostForm connected={connected} />
    </div>
  );
}
