import NextAuth, { type Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

/**
 * Full Auth.js instance (Node runtime): adds the Prisma adapter on top of the edge-safe config.
 * JWT sessions are used so the proxy can validate the cookie without database access.
 * The adapter still persists User/Account rows on first sign-in.
 */
const instance = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    // A suspended user (admin panel) cannot start a new session
    async signIn({ user }) {
      if (!user.id) return true;
      const row = await prisma.user.findUnique({ where: { id: user.id }, select: { suspendedAt: true } });
      return !row?.suspendedAt;
    },
    // Expose the database user id on the session (token.sub holds it)
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = instance;

export async function isSuspended(userId: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
  return !!row?.suspendedAt;
}

/**
 * The signed-in session, or null. The JWT cannot know about a suspension made after it was issued and the proxy cannot read
 * the database, so every server-side `auth()` re-checks the user row; a suspended user is treated as signed out everywhere
 * (pages, server actions, API routes).
 */
export async function auth(): Promise<Session | null> {
  const session = await instance.auth();
  const id = session?.user?.id;
  if (id && (await isSuspended(id))) return null;
  return session;
}

/** For the dashboard shell: tells a suspended user apart from an anonymous one so it can show why instead of looping to /login. */
export async function authState(): Promise<{ session: Session | null; suspended: boolean }> {
  const session = await instance.auth();
  const id = session?.user?.id;
  if (id && (await isSuspended(id))) return { session: null, suspended: true };
  return { session, suspended: false };
}
