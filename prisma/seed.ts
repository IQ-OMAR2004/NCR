 
// Seed: demo users (one per role) + controlled vocabularies.
// Idempotent — upserts everything.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPrismaClient } from '../src/lib/prisma-client';
import {
  CAUSES, DEFECT_TYPES, DEPARTMENTS, DISPOSITIONS, NC_TYPES, PANEL_TYPES,
} from '../src/lib/domain';

const prisma = createPrismaClient();

const DEMO_PASSWORD = 'alfanar123';

const USERS = [
  { email: 'originator@alfanar.com', name: 'Sachin (QC Inspector)', role: 'ORIGINATOR', department: 'Testing' },
  { email: 'engineer@alfanar.com', name: 'Ajaykrishnan (QC Engineer)', role: 'QC_ENGINEER', department: 'QC' },
  { email: 'manager@alfanar.com', name: 'Faisal (QC Manager)', role: 'QC_MANAGER', department: 'QC' },
  { email: 'admin@alfanar.com', name: 'Omar (Admin)', role: 'ADMIN', department: 'QC' },
  { email: 'viewer@alfanar.com', name: 'Guest (Viewer)', role: 'VIEWER', department: null },
] as const;

// Seed Make list: top observed suppliers (full list grows from import + admin adds).
const MAKES = [
  'NARAYAN', 'SEL', 'SUNKID', 'ALCE', 'LSIS', 'ZIV', 'KRAUS & NAIMER',
  'ARABIAN INDUSTRIAL METAL COATING CO', 'ABB', 'GWP', 'EA SRL', 'ITL', 'LUMEL',
  'MULTITEK', 'RB', 'SIEMENS', 'SHAANXI', 'PLASTIM', 'AGATEL', 'ELECTROSWITCH',
  'SFA', 'GE', 'ZHEJIANG GREENPOWER', 'LOVATO', 'DANOTHERM', 'ARTECHE', 'SEGA',
  'SCHNEIDER', 'EATON', 'FSL', 'CROMPTON', 'TEKNIC', 'NINGBO', 'SUPARULE',
  'SHUBHADA', 'RMS', 'SOJO', 'BAOGUANG', 'EXERTHERM', 'ISKRA', 'KRIES', 'ALFANAR',
];

async function seedVocab(category: string, values: readonly string[]): Promise<void> {
  let i = 0;
  for (const value of values) {
    await prisma.vocabItem.upsert({
      where: { category_value: { category, value } },
      update: {},
      create: { category, value, sortOrder: i++ },
    });
  }
}

async function main(): Promise<void> {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name },
      create: { ...u, passwordHash: hash },
    });
  }
  console.log(`seeded ${USERS.length} demo users (password: ${DEMO_PASSWORD})`);

  await seedVocab('PANEL_TYPE', PANEL_TYPES);
  await seedVocab('DEFECT_TYPE', DEFECT_TYPES);
  await seedVocab('NC_TYPE', NC_TYPES);
  await seedVocab('CAUSE', CAUSES);
  await seedVocab('DISPOSITION', DISPOSITIONS);
  await seedVocab('DEPARTMENT', DEPARTMENTS);
  await seedVocab('MAKE', MAKES);
  console.log('seeded controlled vocabularies');

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
