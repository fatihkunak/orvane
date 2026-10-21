import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

/**
 * Full Auth.js instance (Node runtime): adds the Prisma adapter on top of the edge-safe config.
 * JWT sessions are used so the proxy can validate the cookie without database access.
 * The adapter still persists User/Account rows on first sign-in.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    // Expose the database user id on the session (token.sub holds it)
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
