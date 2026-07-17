 
// Dev utility: mint a session cookie for a seeded user (verification/testing).
// Usage: npx tsx scripts/make-cookie.ts manager@alfanar.com
import 'dotenv/config';
import { createHmac } from 'crypto';
import { createPrismaClient } from '../src/lib/prisma-client';

async function main(): Promise<void> {
  const email = process.argv[2] ?? 'manager@alfanar.com';
  const prisma = createPrismaClient();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const body = Buffer.from(
    JSON.stringify({ uid: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString('base64url');
  const sig = createHmac('sha256', process.env.SESSION_SECRET ?? 'dev-only-secret-change-me')
    .update(body)
    .digest('base64url');
  console.log(`${body}.${sig}`);
  await prisma.$disconnect();
}

void main();
