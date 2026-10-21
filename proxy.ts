import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge-safe Auth.js instance (no adapter). Its `authorized` callback guards the dashboard routes.
const { auth } = NextAuth(authConfig);

// Next.js requires a statically visible `proxy` export, so destructuring directly won't work
export const proxy = auth;

export const config = {
  // Skip Next internals, static files and the auth API itself
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
