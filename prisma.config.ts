import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 reads the connection URL here instead of schema.prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations should bypass pooled connections (e.g. Supabase pgbouncer, Neon pooler).
    url: env("DIRECT_URL"),
  },
});
