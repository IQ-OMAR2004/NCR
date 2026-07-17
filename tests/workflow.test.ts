// Workflow gate enforcement — the tests that matter most:
// illegal transitions rejected, closure impossible without BOTH human approvals,
// role checks server-side, mandatory rejection comments, closure-field locking.
import { beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { transition, updateNcrFields, WorkflowError, type Actor } from '../src/lib/workflow';
import { prisma } from '../src/lib/db';

const db: PrismaClient = prisma;

let originator: Actor;
let engineer: Actor;
let manager: Actor;
let viewer: Actor;

async function mkUser(email: string, role: string): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split('@')[0], role, passwordHash: 'x' },
  });
  return { id: u.id, name: u.name, role: role as Actor['role'] };
}

let seq = 9000000;
async function mkNcr(status = 'DRAFT', extra: Record<string, unknown> = {}): Promise<number> {
  const n = await db.ncr.create({
    data: {
      slNo: ++seq,
      year: 2026,
      date: new Date(),
      ncrNo: seq,
      status,
      ...extra,
    },
  });
  return n.id;
}

beforeAll(async () => {
  originator = await mkUser('o@test', 'ORIGINATOR');
  engineer = await mkUser('e@test', 'QC_ENGINEER');
  manager = await mkUser('m@test', 'QC_MANAGER');
  viewer = await mkUser('v@test', 'VIEWER');
});

describe('happy path: full lifecycle with two human gates', () => {
  it('walks DRAFT → CLOSED with explicit approvals recorded', async () => {
    const id = await mkNcr('DRAFT', { disposition: null });

    await transition(id, 'submit', originator);
    await transition(id, 'start_review', engineer);

    // disposition must exist before proposing
    await expect(transition(id, 'propose_disposition', engineer)).rejects.toThrow(WorkflowError);
    await updateNcrFields(id, { disposition: 'Take replacement from stock' }, engineer);
    await transition(id, 'propose_disposition', engineer);
    await transition(id, 'send_for_approval', engineer);

    // GATE 1 — QC Manager approves disposition
    await transition(id, 'approve_disposition', manager, 'disposition is appropriate');
    await transition(id, 'start_action', engineer);
    await transition(id, 'complete_action', engineer);
    await transition(id, 'request_closure', engineer);

    // GATE 2 — QC Manager approves closure
    const closed = await transition(id, 'approve_closure', manager, 'replacement verified');
    expect(closed.status).toBe('CLOSED');
    expect(closed.closingDate).not.toBeNull();

    const approvals = await db.approval.findMany({ where: { ncrId: id }, orderBy: { id: 'asc' } });
    expect(approvals).toHaveLength(2);
    expect(approvals[0]).toMatchObject({ gate: 'DISPOSITION', decision: 'APPROVED', approverId: manager.id });
    expect(approvals[1]).toMatchObject({ gate: 'CLOSURE', decision: 'APPROVED', approverId: manager.id });
    expect(approvals.every((a) => a.createdAt instanceof Date)).toBe(true);

    const transitions = await db.transition.findMany({ where: { ncrId: id } });
    expect(transitions).toHaveLength(9);
  });
});

describe('illegal transitions are rejected', () => {
  it('cannot jump DRAFT → CLOSED (or any unknown action)', async () => {
    const id = await mkNcr('DRAFT');
    await expect(transition(id, 'approve_closure', manager, 'x')).rejects.toThrow(/not allowed/);
    await expect(transition(id, 'nonsense', manager)).rejects.toThrow(WorkflowError);
  });
  it('cannot approve closure while only at PENDING_APPROVAL', async () => {
    const id = await mkNcr('PENDING_APPROVAL', { disposition: 'Scrap' });
    await expect(transition(id, 'approve_closure', manager, 'x')).rejects.toThrow(/not allowed/);
  });
  it('closure is impossible without passing Gate 1 first: no path skips states', async () => {
    // From every pre-approval state, approve_closure must fail.
    for (const status of ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DISPOSITION_PROPOSED', 'APPROVED', 'ACTION_IN_PROGRESS']) {
      const id = await mkNcr(status, { disposition: 'Scrap' });
      await expect(transition(id, 'approve_closure', manager, 'x')).rejects.toThrow(WorkflowError);
    }
  });
});

describe('gates are QC_MANAGER/ADMIN only — server-side', () => {
  it('engineer cannot approve a disposition', async () => {
    const id = await mkNcr('PENDING_APPROVAL', { disposition: 'Scrap' });
    await expect(transition(id, 'approve_disposition', engineer)).rejects.toThrow(/may not perform/);
    await expect(transition(id, 'approve_disposition', originator)).rejects.toThrow(/may not perform/);
    await expect(transition(id, 'approve_disposition', viewer)).rejects.toThrow(/may not perform/);
  });
  it('engineer cannot approve a closure', async () => {
    const id = await mkNcr('PENDING_CLOSURE_APPROVAL', { disposition: 'Scrap' });
    await expect(transition(id, 'approve_closure', engineer)).rejects.toThrow(/may not perform/);
  });
});

describe('rejection requires a comment and returns to previous actor', () => {
  it('reject at Gate 1 without comment fails; with comment returns to UNDER_REVIEW', async () => {
    const id = await mkNcr('PENDING_APPROVAL', { disposition: 'Scrap' });
    await expect(transition(id, 'reject_disposition', manager)).rejects.toThrow(/comment is mandatory/i);
    await expect(transition(id, 'reject_disposition', manager, '  ')).rejects.toThrow(/comment is mandatory/i);
    const n = await transition(id, 'reject_disposition', manager, 'wrong disposition — item is repairable');
    expect(n.status).toBe('UNDER_REVIEW');
    const rej = await db.approval.findFirst({ where: { ncrId: id, decision: 'REJECTED' } });
    expect(rej?.comment).toContain('repairable');
  });
  it('reject at Gate 2 returns to ACTION_IN_PROGRESS', async () => {
    const id = await mkNcr('PENDING_CLOSURE_APPROVAL', { disposition: 'Scrap' });
    const n = await transition(id, 'reject_closure', manager, 'no testing evidence attached');
    expect(n.status).toBe('ACTION_IN_PROGRESS');
  });
});

describe('closure-only fields are locked until Gate 2 approval', () => {
  it('cannot set closingDate / SAP fields while open', async () => {
    const id = await mkNcr('ACTION_IN_PROGRESS', { disposition: 'Scrap' });
    await expect(
      updateNcrFields(id, { closingDate: new Date() }, engineer),
    ).rejects.toThrow(/Gate 2/);
    await expect(updateNcrFields(id, { sapClosed: true }, engineer)).rejects.toThrow(/Gate 2/);
    await expect(
      updateNcrFields(id, { sapClosingDate: new Date() }, engineer),
    ).rejects.toThrow(/Gate 2/);
  });
  it('after closure, QC staff may tick the SAP checklist but nothing else', async () => {
    const id = await mkNcr('CLOSED', { disposition: 'Scrap', closingDate: new Date() });
    // SAP checklist alone: allowed for engineer post-closure (spec 3.3 manual tick)
    const updated = await updateNcrFields(id, { sapClosed: true, sapClosingDate: new Date() }, engineer);
    expect(updated.sapClosed).toBe(true);
    // any other field mixed in → still locked
    await expect(
      updateNcrFields(id, { sapClosed: false, remarks: 'sneaky edit' }, engineer),
    ).rejects.toThrow(/may not edit/);
    // viewer/originator never
    await expect(updateNcrFields(id, { sapClosed: false }, viewer)).rejects.toThrow(/may not edit/);
    await expect(updateNcrFields(id, { sapClosed: false }, originator)).rejects.toThrow(/may not edit/);
  });
});

describe('field validation and audit', () => {
  it('defect quantity cannot exceed total quantity', async () => {
    const id = await mkNcr('UNDER_REVIEW', { totalQty: 5, defectQty: 1 });
    await expect(updateNcrFields(id, { defectQty: 9 }, engineer)).rejects.toThrow(/cannot exceed/);
    await expect(updateNcrFields(id, { totalQty: 0.5 }, engineer)).rejects.toThrow(/cannot exceed/);
    await updateNcrFields(id, { defectQty: 5 }, engineer); // equal is fine
  });
  it('viewer cannot edit; originator cannot edit past SUBMITTED', async () => {
    const id = await mkNcr('UNDER_REVIEW');
    await expect(updateNcrFields(id, { remarks: 'hi' }, viewer)).rejects.toThrow(/may not edit/);
    await expect(updateNcrFields(id, { remarks: 'hi' }, originator)).rejects.toThrow(/may not edit/);
  });
  it('every field change writes a before/after audit row', async () => {
    const id = await mkNcr('UNDER_REVIEW', { make: 'SEL' });
    await updateNcrFields(id, { make: 'ZIV', remarks: 'swapped supplier' }, engineer);
    const audits = await db.auditLog.findMany({ where: { ncrId: id, action: 'FIELD_CHANGE' } });
    const makeAudit = audits.find((a) => a.field === 'make');
    expect(makeAudit).toMatchObject({ before: 'SEL', after: 'ZIV', actorId: engineer.id });
  });
  it('duplicate NCR No. rejected for user-maintained records', async () => {
    const a = await mkNcr('UNDER_REVIEW');
    const bNo = seq; // b's ncrNo === seq after creation
    const b = await mkNcr('UNDER_REVIEW');
    void a;
    await expect(updateNcrFields(b, { ncrNo: bNo - 1 }, engineer)).rejects.toThrow(/already exists/);
  });
});

describe('disposition cannot be changed after Gate 1 approval', () => {
  it('QC engineer may set disposition during review but not after approval', async () => {
    const during = await mkNcr('UNDER_REVIEW');
    await updateNcrFields(during, { disposition: 'Rework' }, engineer); // allowed
    for (const status of ['APPROVED', 'ACTION_IN_PROGRESS', 'ACTION_COMPLETED', 'PENDING_CLOSURE_APPROVAL']) {
      const id = await mkNcr(status, { disposition: 'Rework' });
      await expect(
        updateNcrFields(id, { disposition: 'Scrap' }, engineer),
      ).rejects.toThrow(/only be changed during review/);
    }
  });
  it('ADMIN may still correct a disposition out-of-band (audited)', async () => {
    const id = await mkNcr('ACTION_IN_PROGRESS', { disposition: 'Rework' });
    const admin = await mkUser('adm@test', 'ADMIN');
    const updated = await updateNcrFields(id, { disposition: 'Scrap' }, admin);
    expect(updated.disposition).toBe('Scrap');
  });
});

describe('no auto-approval exists anywhere', () => {
  it('entering PENDING_APPROVAL never creates an approval row by itself', async () => {
    const id = await mkNcr('DISPOSITION_PROPOSED', { disposition: 'Rework' });
    await transition(id, 'send_for_approval', engineer);
    const approvals = await db.approval.count({ where: { ncrId: id } });
    expect(approvals).toBe(0); // still zero — only a human decision creates one
    const n = await db.ncr.findUniqueOrThrow({ where: { id } });
    expect(n.status).toBe('PENDING_APPROVAL');
  });
});
