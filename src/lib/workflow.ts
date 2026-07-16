// Workflow engine — ALL state changes and field edits pass through here, inside
// a single DB transaction, with role checks and audit logging. The two human
// gates (disposition + closure) can only be decided by QC_MANAGER/ADMIN and are
// recorded as immutable Approval rows. Nothing in this file (or anywhere else)
// auto-approves or auto-closes an NCR.
import { prisma } from './db';
import type { Ncr, Prisma } from '@prisma/client';
import {
  CLOSURE_ONLY_FIELDS,
  findRule,
  canEditFields,
  type NcrStatus,
  type Role,
} from './domain';

export class WorkflowError extends Error {}

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

/**
 * Execute a workflow action on an NCR. Throws WorkflowError on any violation:
 * unknown action for the current state, actor role not allowed, missing
 * mandatory comment (gate rejections), or missing disposition.
 */
export async function transition(
  ncrId: number,
  action: string,
  actor: Actor,
  comment?: string,
): Promise<Ncr> {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.ncr.findUniqueOrThrow({ where: { id: ncrId } });
    const rule = findRule(ncr.status as NcrStatus, action);

    if (!rule) {
      throw new WorkflowError(`Action "${action}" is not allowed from state ${ncr.status}`);
    }
    if (!rule.roles.includes(actor.role)) {
      throw new WorkflowError(`Role ${actor.role} may not perform "${rule.label}"`);
    }
    if (rule.requiresComment && !comment?.trim()) {
      throw new WorkflowError('A comment is mandatory for this decision');
    }
    if (rule.requiresDisposition && !ncr.disposition) {
      throw new WorkflowError('A disposition must be set before this step');
    }

    const now = new Date();

    // Human gate: record the immutable approval decision.
    if (rule.gate && rule.decision) {
      await tx.approval.create({
        data: {
          ncrId: ncr.id,
          gate: rule.gate,
          decision: rule.decision,
          approverId: actor.id,
          comment: comment?.trim() || null,
        },
      });
    }

    await tx.transition.create({
      data: {
        ncrId: ncr.id,
        fromStatus: ncr.status,
        toStatus: rule.to,
        action: rule.action,
        actorId: actor.id,
        comment: comment?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        ncrId: ncr.id,
        actorId: actor.id,
        action: rule.gate ? 'APPROVAL' : 'TRANSITION',
        field: rule.gate ?? 'status',
        before: ncr.status,
        after: rule.to,
      },
    });

    const updated = await tx.ncr.update({
      where: { id: ncr.id },
      data: {
        status: rule.to,
        statusChangedAt: now,
        // Closing date is stamped ONLY by an approved closure gate.
        ...(rule.setsClosingDate ? { closingDate: now } : {}),
      },
    });

    await queueNotifications(tx, updated, rule.to, actor, rule.gate ? rule.decision : undefined, comment);
    return updated;
  });
}

/** Notify the people whose queue the NCR just entered (in-app; email is a stub). */
async function queueNotifications(
  tx: Prisma.TransactionClient,
  ncr: Ncr,
  to: string,
  actor: Actor,
  decision?: 'APPROVED' | 'REJECTED',
  comment?: string,
): Promise<void> {
  const label = `NCR ${ncr.ncrNo}`;
  if (to === 'PENDING_APPROVAL' || to === 'PENDING_CLOSURE_APPROVAL') {
    const managers = await tx.user.findMany({ where: { role: 'QC_MANAGER', active: true } });
    const gate = to === 'PENDING_APPROVAL' ? 'disposition approval' : 'closure approval';
    await tx.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        ncrId: ncr.id,
        type: 'QUEUE',
        message: `${label} awaits your ${gate} (sent by ${actor.name})`,
      })),
    });
  } else if (decision) {
    // Approval outcome → notify the creator (if any) and QC engineers.
    const recipients = await tx.user.findMany({
      where: { active: true, OR: [{ id: ncr.createdById ?? '' }, { role: 'QC_ENGINEER' }] },
    });
    const verb = decision === 'APPROVED' ? 'approved' : `rejected back${comment ? `: "${comment.trim()}"` : ''}`;
    await tx.notification.createMany({
      data: recipients
        .filter((r) => r.id !== actor.id)
        .map((r) => ({
          userId: r.id,
          ncrId: ncr.id,
          type: decision === 'REJECTED' ? 'REJECTED_BACK' : 'APPROVAL_RESULT',
          message: `${label} ${verb} by ${actor.name}`,
        })),
    });
  } else if (to === 'SUBMITTED') {
    const engineers = await tx.user.findMany({ where: { role: 'QC_ENGINEER', active: true } });
    await tx.notification.createMany({
      data: engineers.map((e) => ({
        userId: e.id,
        ncrId: ncr.id,
        type: 'QUEUE',
        message: `${label} submitted by ${actor.name} — awaiting review`,
      })),
    });
  }
}

// Fields a role may generally edit through updateNcrFields. Closure-only fields
// have the extra CLOSED-state guard below.
const EDITABLE_FIELDS = [
  'date', 'ncrNo', 'so', 'fg', 'prO', 'projectName', 'panelRef', 'panelType',
  'itemCode', 'itemName', 'itemDescription', 'make', 'totalQty', 'defectQty',
  'serialsJson', 'defectDetails', 'defectType', 'ncType', 'cause',
  'disposition', 'dispositionNote', 'responsiblePerson', 'responsibleDept',
  'remarks', 'sapClosed', 'sapClosingDate', 'closingDate', 'needsTriage',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

export type NcrFieldPatch = Partial<
  Pick<Ncr, Exclude<EditableField, never>>
>;

/**
 * Audited field update. Enforces:
 *  - role/state edit rights (canEditFields)
 *  - closure-only fields (closingDate, SAP fields) locked until status = CLOSED
 *  - defectQty <= totalQty
 *  - per-field before/after audit rows
 */
export async function updateNcrFields(
  ncrId: number,
  patch: NcrFieldPatch,
  actor: Actor,
): Promise<Ncr> {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.ncr.findUniqueOrThrow({ where: { id: ncrId } });

    if (!canEditFields(actor.role, ncr.status as NcrStatus)) {
      throw new WorkflowError(`Role ${actor.role} may not edit an NCR in state ${ncr.status}`);
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
        throw new WorkflowError(`Field "${key}" is not editable`);
      }
      if (
        (CLOSURE_ONLY_FIELDS as readonly string[]).includes(key) &&
        ncr.status !== 'CLOSED'
      ) {
        throw new WorkflowError(
          `"${key}" only becomes writable after closure approval (Gate 2)`,
        );
      }
      data[key] = value;
    }

    const totalQty = (data.totalQty as number | null | undefined) ?? ncr.totalQty;
    const defectQty = (data.defectQty as number | null | undefined) ?? ncr.defectQty;
    if (totalQty != null && defectQty != null && defectQty > totalQty) {
      throw new WorkflowError('Defect quantity cannot exceed total quantity');
    }

    // NCR No. uniqueness for user-maintained records (legacy rows may share numbers).
    if (data.ncrNo != null && data.ncrNo !== ncr.ncrNo) {
      const clash = await tx.ncr.findFirst({
        where: { ncrNo: data.ncrNo as number, importedLegacy: false, NOT: { id: ncr.id } },
      });
      if (clash) throw new WorkflowError(`NCR No. ${String(data.ncrNo)} already exists`);
    }

    const audits: Prisma.AuditLogCreateManyInput[] = [];
    for (const key of Object.keys(data)) {
      const before = ncr[key as keyof Ncr];
      const after = data[key];
      if (String(before ?? '') === String(after ?? '')) continue;
      audits.push({
        ncrId: ncr.id,
        actorId: actor.id,
        action: 'FIELD_CHANGE',
        field: key,
        before: before instanceof Date ? before.toISOString() : String(before ?? ''),
        after: after instanceof Date ? after.toISOString() : String(after ?? ''),
      });
    }
    if (audits.length > 0) await tx.auditLog.createMany({ data: audits });

    return tx.ncr.update({ where: { id: ncr.id }, data });
  });
}
