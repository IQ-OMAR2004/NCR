 
// End-to-end lifecycle verification on the live dev.db:
// create → submit → review → disposition → GATE 1 → action → GATE 2 → closed.
// Exercises the same workflow service the server actions call.
import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma-client';
import type { Actor } from '../src/lib/workflow';

process.env.DATABASE_URL ??= 'file:./dev.db';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  // workflow.ts uses the db.ts singleton — make sure it targets the same file
  const { transition, updateNcrFields } = await import('../src/lib/workflow');

  const users = await prisma.user.findMany();
  const actor = (email: string): Actor => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`missing seed user ${email}`);
    return { id: u.id, name: u.name, role: u.role as Actor['role'] };
  };
  const originator = actor('originator@alfanar.com');
  const engineer = actor('engineer@alfanar.com');
  const manager = actor('manager@alfanar.com');

  const year = new Date().getFullYear();
  const last = await prisma.ncr.aggregate({ where: { year }, _max: { slNo: true } });
  const ncrNo = 209999901;
  await prisma.ncr.deleteMany({ where: { ncrNo, importedLegacy: false } }); // idempotent re-run

  const ncr = await prisma.ncr.create({
    data: {
      slNo: (last._max.slNo ?? 0) + 1,
      year,
      date: new Date(),
      ncrNo,
      projectName: 'VERIFICATION RUN',
      panelRef: 'VF-01',
      panelType: 'ALFA12',
      itemName: 'Current transformer',
      make: 'SEL',
      totalQty: 4,
      defectQty: 1,
      serialsJson: JSON.stringify(['VRF-0001']),
      defectDetails: 'End-to-end verification: cracked secondary terminal block.',
      defectType: 'Damaged',
      ncType: 'Material defect',
      cause: 'Mishandling',
      responsibleDept: 'Production',
      status: 'DRAFT',
      createdById: originator.id,
    },
  });
  console.log(`created NCR ${ncr.ncrNo} (id ${ncr.id}) in DRAFT`);

  await transition(ncr.id, 'submit', originator);
  await transition(ncr.id, 'start_review', engineer);
  await updateNcrFields(ncr.id, {
    disposition: 'Take replacement from stock',
    dispositionNote: 'Stock has replacements; damaged unit to substore.',
  }, engineer);
  await transition(ncr.id, 'propose_disposition', engineer);
  await transition(ncr.id, 'send_for_approval', engineer);
  console.log('reached GATE 1 (PENDING_APPROVAL)');

  await transition(ncr.id, 'approve_disposition', manager, 'Replacement justified — approved.');
  await transition(ncr.id, 'start_action', engineer);
  await transition(ncr.id, 'complete_action', engineer);
  await transition(ncr.id, 'request_closure', engineer);
  console.log('reached GATE 2 (PENDING_CLOSURE_APPROVAL)');

  const closed = await transition(ncr.id, 'approve_closure', manager, 'Replacement fitted and tested OK.');
  console.log(`closed: status=${closed.status} closingDate=${closed.closingDate?.toISOString()}`);

  // SAP checklist unlocks only now
  await updateNcrFields(ncr.id, { sapClosed: true, sapClosingDate: new Date() }, engineer);

  const approvals = await prisma.approval.findMany({ where: { ncrId: ncr.id } });
  const transitions = await prisma.transition.count({ where: { ncrId: ncr.id } });
  const audits = await prisma.auditLog.count({ where: { ncrId: ncr.id } });
  console.log(`approvals recorded: ${approvals.length} (${approvals.map((a) => `${a.gate}:${a.decision} by ${a.approverId.slice(0, 6)}…`).join(', ')})`);
  console.log(`transitions: ${transitions} · audit rows: ${audits}`);

  if (approvals.length !== 2) throw new Error('expected exactly 2 approvals');
  if (closed.status !== 'CLOSED' || !closed.closingDate) throw new Error('closure failed');
  console.log('✔ full lifecycle verified with both human gates');
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
