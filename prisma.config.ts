// Prisma 7 config — connection URL lives here (not in schema.prisma).
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Use process.env directly (NOT prisma's env() helper): env() throws
// PrismaConfigEnvError the moment this file loads if DATABASE_URL is unset, which
// breaks `prisma generate` during the build (the DB URL is only needed at
// runtime, not for client generation). Falling back to a local SQLite file keeps
// build + migrate working with zero configuration; set DATABASE_URL (e.g. to a
// persistent volume path) to override.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
});
