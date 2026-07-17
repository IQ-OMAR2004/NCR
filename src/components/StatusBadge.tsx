import { STATUS_LABELS, type NcrStatus } from '@/lib/domain';

// Brand ratio: blues dominate; green/red only where semantically necessary.
const DOT: Record<NcrStatus, string> = {
  DRAFT: 'var(--slate)',
  SUBMITTED: 'var(--sky)',
  UNDER_REVIEW: 'var(--accent)',
  DISPOSITION_PROPOSED: 'var(--accent)',
  PENDING_APPROVAL: 'var(--warning)',
  APPROVED: 'var(--accent2)',
  ACTION_IN_PROGRESS: 'var(--accent)',
  ACTION_COMPLETED: 'var(--accent2)',
  PENDING_CLOSURE_APPROVAL: 'var(--warning)',
  CLOSED: 'var(--success)',
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as NcrStatus;
  const label = STATUS_LABELS[s] ?? status;
  const dot = DOT[s] ?? 'var(--slate)';
  return (
    <span className="badge bg-white">
      <span className="badge-dot" style={{ background: dot }} />
      {label}
    </span>
  );
}

export function OverdueBadge({ kind }: { kind: 'open' | 'approval' }) {
  return (
    <span
      className="badge"
      style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: '#fff' }}
      title={kind === 'open' ? 'Open for more than 30 days' : 'Waiting for approval for more than 3 days'}
    >
      <span className="badge-dot" style={{ background: 'var(--danger)' }} />
      {kind === 'open' ? 'Overdue' : 'Approval overdue'}
    </span>
  );
}
