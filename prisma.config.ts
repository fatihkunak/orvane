import "dotenv/config";
import { defineConfig } from "prisma/config";

// A connection string that only exists so `prisma generate` can load this file on a fresh clone. `npm install` runs
// `prisma generate` (postinstall) BEFORE the person has created .env, and generating the client needs no database. Anything
// that really connects (migrate, studio) then fails with a plain "can't reach database" error until DIRECT_URL is set.
const PLACEHOLDER_URL = "postgresql://user:password@localhost:5432/orvane?schema=public";

// Prisma 7 reads the connection URL here instead of schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations should bypass pooled connections (e.g. Supabase pgbouncer, Neon pooler).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || PLACEHOLDER_URL,
  },
});
