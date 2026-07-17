// Domain vocabulary and workflow rules — single source of truth.
// SQLite has no enums, so these const objects + union types ARE the enums.

export const ROLES = ['ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const NCR_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DISPOSITION_PROPOSED',
  'PENDING_APPROVAL', // human gate #1 — disposition approval
  'APPROVED',
  'ACTION_IN_PROGRESS',
  'ACTION_COMPLETED',
  'PENDING_CLOSURE_APPROVAL', // human gate #2 — closure approval
  'CLOSED',
] as const;
export type NcrStatus = (typeof NCR_STATUSES)[number];

export const STATUS_LABELS: Record<NcrStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DISPOSITION_PROPOSED: 'Disposition Proposed',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  ACTION_IN_PROGRESS: 'Action In Progress',
  ACTION_COMPLETED: 'Action Completed',
  PENDING_CLOSURE_APPROVAL: 'Pending Closure Approval',
  CLOSED: 'Closed',
};

export type Gate = 'DISPOSITION' | 'CLOSURE';
export type Decision = 'APPROVED' | 'REJECTED';

// Target disposition list (from .claude/skills/ncr-alfanar/references/vocabularies.md).
// Admin-editable via VocabItem; this is the seed + tag-color rule basis.
export const DISPOSITIONS = [
  'Take replacement from stock',
  'Repaired by supplier',
  'Repaired internally',
  'Return to supplier',
  'Scrap',
  'Use as is / Accept as is',
  'Rework',
  'Close internally (documentation-only)',
  'Replace at site (PE & PMO agreement)',
  'Shuffle from another project',
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

// Rejection tag: red "REJECTION TAG - DO NOT USE" for material leaving the flow,
// amber "REWORK/REJECTION TAG" for everything else.
export const RED_TAG_DISPOSITIONS: readonly string[] = ['Scrap', 'Return to supplier'];
export function tagVariant(disposition: string | null | undefined): 'red' | 'amber' {
  return disposition && RED_TAG_DISPOSITIONS.includes(disposition) ? 'red' : 'amber';
}
export const TAG_REF_NO = '362:QCA:0817:02';
export const TAG_FACTORY = 'MV & DASA Factory';

export const DEFECT_TYPES = ['Manufacturing defect', 'Damaged', 'Missing'] as const;
export const NC_TYPES = ['Material defect'] as const;
export const CAUSES = ['Manufacturing defect', 'Mishandling', 'Not received'] as const;
export const PANEL_TYPES = [
  'ALFA12', 'SMRMU', 'ALFA-DT', 'LBS', 'ALFA-G', 'NES-H', 'MCC', 'ALFA-A',
  'AutoRecloser', 'LSIS-S24', 'MCLD', 'ALFA36',
] as const;
export const DEPARTMENTS = ['QC', 'Testing', 'Production', 'Busbar', 'Store', 'Planning'] as const;

// Auto-assignment suggestion: default responsible department by cause (spec 3.3).
export const CAUSE_DEFAULT_DEPT: Record<string, string> = {
  'Manufacturing defect': 'QC',
  Mishandling: 'Production',
  'Not received': 'Store',
};

// ---------------------------------------------------------------------------
// Workflow transition map. Server-side enforcement lives in workflow.ts and
// consumes exactly this table — the UI only reflects it.
// ---------------------------------------------------------------------------

export interface TransitionRule {
  action: string;
  label: string;
  to: NcrStatus;
  roles: readonly Role[];
  /** Human approval gate this action decides (recorded as an immutable Approval row). */
  gate?: Gate;
  decision?: Decision;
  /** Comment is mandatory (all gate rejections). */
  requiresComment?: boolean;
  /** NCR must have a disposition set before this action. */
  requiresDisposition?: boolean;
  /** Approving closure stamps closingDate and unlocks SAP fields. */
  setsClosingDate?: boolean;
}

// Anyone who may create an NCR may also submit their own draft (a QC Manager
// who raises an NCR must be able to move it forward — otherwise the draft orphans).
const EDITORS = ['ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN'] as const;
const REVIEWERS = ['QC_ENGINEER', 'QC_MANAGER', 'ADMIN'] as const;
const APPROVERS = ['QC_MANAGER', 'ADMIN'] as const; // the ONLY roles that decide gates

export const WORKFLOW: Record<NcrStatus, readonly TransitionRule[]> = {
  DRAFT: [
    { action: 'submit', label: 'Submit NCR', to: 'SUBMITTED', roles: EDITORS },
  ],
  SUBMITTED: [
    { action: 'start_review', label: 'Start Review', to: 'UNDER_REVIEW', roles: REVIEWERS },
  ],
  UNDER_REVIEW: [
    {
      action: 'propose_disposition', label: 'Propose Disposition',
      to: 'DISPOSITION_PROPOSED', roles: REVIEWERS, requiresDisposition: true,
    },
  ],
  DISPOSITION_PROPOSED: [
    {
      action: 'send_for_approval', label: 'Send for Approval',
      to: 'PENDING_APPROVAL', roles: REVIEWERS, requiresDisposition: true,
    },
  ],
  PENDING_APPROVAL: [
    {
      action: 'approve_disposition', label: 'Approve Disposition', to: 'APPROVED',
      roles: APPROVERS, gate: 'DISPOSITION', decision: 'APPROVED',
    },
    {
      action: 'reject_disposition', label: 'Reject (back to review)', to: 'UNDER_REVIEW',
      roles: APPROVERS, gate: 'DISPOSITION', decision: 'REJECTED', requiresComment: true,
    },
  ],
  APPROVED: [
    { action: 'start_action', label: 'Start Action', to: 'ACTION_IN_PROGRESS', roles: REVIEWERS },
  ],
  ACTION_IN_PROGRESS: [
    { action: 'complete_action', label: 'Mark Action Completed', to: 'ACTION_COMPLETED', roles: REVIEWERS },
  ],
  ACTION_COMPLETED: [
    { action: 'request_closure', label: 'Request Closure Approval', to: 'PENDING_CLOSURE_APPROVAL', roles: REVIEWERS },
  ],
  PENDING_CLOSURE_APPROVAL: [
    {
      action: 'approve_closure', label: 'Approve Closure', to: 'CLOSED',
      roles: APPROVERS, gate: 'CLOSURE', decision: 'APPROVED', setsClosingDate: true,
    },
    {
      action: 'reject_closure', label: 'Reject (back to action)', to: 'ACTION_IN_PROGRESS',
      roles: APPROVERS, gate: 'CLOSURE', decision: 'REJECTED', requiresComment: true,
    },
  ],
  CLOSED: [],
};

export function rulesFor(status: NcrStatus): readonly TransitionRule[] {
  return WORKFLOW[status] ?? [];
}
export function findRule(status: NcrStatus, action: string): TransitionRule | undefined {
  return rulesFor(status).find((r) => r.action === action);
}

// Editing rights: who may edit NCR fields in which states (server-enforced).
export function canEditFields(role: Role, status: NcrStatus): boolean {
  if (role === 'VIEWER') return false;
  if (status === 'CLOSED') return role === 'ADMIN'; // post-closure corrections: admin only, audited
  if (role === 'ORIGINATOR') return status === 'DRAFT' || status === 'SUBMITTED';
  return true; // QC_ENGINEER / QC_MANAGER / ADMIN in any open state
}

// Fields locked until Gate 2 (closure) approval has happened.
export const CLOSURE_ONLY_FIELDS = ['closingDate', 'sapClosed', 'sapClosingDate'] as const;

// Overdue rules (spec 3.2): open > 30 days; waiting at a gate > 3 days.
export const OPEN_OVERDUE_DAYS = 30;
export const APPROVAL_OVERDUE_DAYS = 3;
export function isOpenOverdue(status: string, date: Date, now = new Date()): boolean {
  return status !== 'CLOSED' && now.getTime() - date.getTime() > OPEN_OVERDUE_DAYS * 86400_000;
}
export function isApprovalOverdue(status: string, statusChangedAt: Date, now = new Date()): boolean {
  return (
    (status === 'PENDING_APPROVAL' || status === 'PENDING_CLOSURE_APPROVAL') &&
    now.getTime() - statusChangedAt.getTime() > APPROVAL_OVERDUE_DAYS * 86400_000
  );
}

export function parseSerials(serialsJson: string): string[] {
  try {
    const v: unknown = JSON.parse(serialsJson);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
