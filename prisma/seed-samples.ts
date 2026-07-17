/* eslint-disable no-console */
// Synthetic sample NCRs for the PUBLIC demo deployment (Railway).
// Deliberately fabricated — NO real alfanar projects, people, or NCR data — so a
// public URL guarded only by the shared demo password exposes nothing real.
// Idempotent: skips entirely if the register already has records.
import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma-client';
import { transition, updateNcrFields, type Actor } from '../src/lib/workflow';

const prisma = createPrismaClient();

// Fabricated, generic values only.
const PROJECTS = ['PROJECT ATLAS', 'NORTH SUBSTATION', 'COASTAL GRID', 'DESERT LINE', 'METRO EXPANSION', 'HARBOR POWER', 'RIDGE INTERTIE'];
const PANEL_TYPES = ['ALFA12', 'SMRMU', 'ALFA-DT', 'LBS', 'ALFA-G', 'NES-H', 'MCC'];
const MAKES = ['ABB', 'SIEMENS', 'SCHNEIDER', 'EATON', 'GE', 'LSIS', 'LOVATO', 'ISKRA'];
const ITEMS = ['Current transformer', 'Voltage transformer', 'Earth switch', 'VCB', 'Protection relay', 'Busbar', 'Selector switch', 'Multifunction meter'];
const DEFECT_TYPES = ['Manufacturing defect', 'Damaged', 'Missing'];
const CAUSES = ['Manufacturing defect', 'Mishandling', 'Not received'];
const DISPOSITIONS = ['Take replacement from stock', 'Repaired by supplier', 'Repaired internally', 'Return to supplier', 'Scrap', 'Use as is / Accept as is', 'Rework'];
const PEOPLE = [
  { person: 'A. Rahman', dept: 'QC' }, { person: 'M. Khan', dept: 'Testing' },
  { person: 'S. Patel', dept: 'Production' }, { person: 'K. Nair', dept: 'QC' },
  { person: 'R. Das', dept: 'Testing' }, { person: 'F. Ali', dept: 'Production' },
];
const DEFECTS = [
  'Cracked secondary terminal block observed during routine inspection.',
  'Insulation resistance below acceptance limit on phase B.',
  'Mechanical interlock not engaging on the earth switch.',
  'Nameplate rating does not match the purchase order.',
  'Surface corrosion on the busbar joint after transit.',
  'Relay firmware version does not match the approved list.',
  'Missing mounting hardware in the delivered accessory kit.',
  'Contact resistance out of tolerance on the main contacts.',
];

// Small seeded PRNG so redeploys of an empty DB produce the same demo set.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const rand = makeRng(20260717);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const rint = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

function dateIn(year: number): Date {
  const month = rint(0, year === 2026 ? 6 : 11); // 2026 only through mid-year
  return new Date(Date.UTC(year, month, rint(1, 28)));
}

// Target status distribution for a lively dashboard/register/approvals.
const PLAN: { status: string; count: number }[] = [
  { status: 'DRAFT', count: 3 },
  { status: 'UNDER_REVIEW', count: 4 },
  { status: 'PENDING_APPROVAL', count: 5 },        // Gate 1 queue
  { status: 'ACTION_IN_PROGRESS', count: 4 },
  { status: 'PENDING_CLOSURE_APPROVAL', count: 4 }, // Gate 2 queue
  { status: 'CLOSED', count: 16 },
];

async function main(): Promise<void> {
  const existing = await prisma.ncr.count();
  if (existing > 0 && process.env.FORCE_SAMPLES !== '1') {
    console.log(`sample seed skipped — register already has ${existing} NCRs`);
    await prisma.$disconnect();
    return;
  }

  const users = await prisma.user.findMany();
  const actor = (role: string): Actor => {
    const u = users.find((x) => x.role === role);
    if (!u) throw new Error(`missing seed user for role ${role} — run prisma/seed.ts first`);
    return { id: u.id, name: u.name, role: u.role as Actor['role'] };
  };
  const engineer = actor('QC_ENGINEER');
  const manager = actor('QC_MANAGER');
  const originator = actor('ORIGINATOR');

  let slNo2025 = 0;
  let slNo2026 = 0;
  let ncrNo = 200700000;
  let made = 0;

  for (const { status: target, count } of PLAN) {
    for (let i = 0; i < count; i++) {
      const year = rand() < 0.55 ? 2025 : 2026;
      const date = dateIn(year);
      const totalQty = rint(1, 8);
      const person = pick(PEOPLE);
      const ncr = await prisma.ncr.create({
        data: {
          slNo: year === 2025 ? ++slNo2025 : ++slNo2026,
          year,
          date,
          ncrNo: ++ncrNo,
          projectName: pick(PROJECTS),
          panelRef: `${pick(['AH', 'K', 'GH', 'BH'])}${rint(1, 40)}`,
          panelType: pick(PANEL_TYPES),
          itemCode: String(rint(1000000, 1999999)),
          itemName: pick(ITEMS),
          make: pick(MAKES),
          totalQty,
          defectQty: rint(1, totalQty),
          serialsJson: JSON.stringify([`SN-${rint(100000, 999999)}`]),
          defectDetails: pick(DEFECTS),
          defectType: pick(DEFECT_TYPES),
          ncType: 'Material defect',
          cause: pick(CAUSES),
          responsiblePerson: person.person,
          responsibleDept: person.dept,
          status: 'DRAFT',
          statusChangedAt: date,
          createdById: originator.id,
        },
      });

      // Drive it forward through the real workflow so timelines, approvals and
      // audit rows are genuine — up to the planned status.
      const disposition = pick(DISPOSITIONS);
      try {
        if (target === 'DRAFT') { /* leave as draft */ }
        else {
          await transition(ncr.id, 'submit', originator);
          await transition(ncr.id, 'start_review', engineer);
          if (target !== 'UNDER_REVIEW') {
            await updateNcrFields(ncr.id, { disposition }, engineer);
            await transition(ncr.id, 'propose_disposition', engineer);
            await transition(ncr.id, 'send_for_approval', engineer);
            if (target !== 'PENDING_APPROVAL') {
              await transition(ncr.id, 'approve_disposition', manager, 'Disposition reviewed and approved.');
              await transition(ncr.id, 'start_action', engineer);
              if (target !== 'ACTION_IN_PROGRESS') {
                await transition(ncr.id, 'complete_action', engineer);
                await transition(ncr.id, 'request_closure', engineer);
                if (target !== 'PENDING_CLOSURE_APPROVAL') {
                  await transition(ncr.id, 'approve_closure', manager, 'Corrective action verified. Closed.');
                }
              }
            }
          }
        }
        made++;
      } catch (err) {
        console.error(`sample ${ncr.ncrNo} stalled at ${target}:`, (err as Error).message);
      }
    }
  }

  console.log(`seeded ${made} synthetic demo NCRs (fabricated data — no real records)`);
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
