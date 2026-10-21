import type { DefaultSession } from "next-auth";

// Add the database user id to the session type (set in auth.ts)
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
