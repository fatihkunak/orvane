import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe part of the Auth.js config. It must NOT import Prisma or the adapter,
 * because proxy.ts runs this file in the edge runtime. The full instance is in auth.ts.
 */

// Routes that need a signed-in user
const PROTECTED_PREFIXES = ["/dashboard", "/calendar", "/analytics", "/accounts", "/settings", "/posts", "/drafts"];

export default {
  // Reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the environment
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    // Runs in proxy.ts for every matched request
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = PROTECTED_PREFIXES.some((p) => nextUrl.pathname.startsWith(p));

      if (isProtected) return isLoggedIn; // false → redirected to /login
      // Signed-in users have no reason to see the login page
      if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
