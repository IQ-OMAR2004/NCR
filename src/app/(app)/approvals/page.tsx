// §05 Approvals inbox — everything waiting at either human gate, oldest first.
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isApprovalOverdue } from '@/lib/domain';
import { fmtQty, daysSince, fmtDate } from '@/lib/format';

function fmtGate(status: string): string {
  return status === 'PENDING_APPROVAL' ? 'GATE 1 · DISPOSITION' : 'GATE 2 · CLOSURE';
}
import { SectionHead } from '@/components/Shell';
import { OverdueBadge } from '@/components/StatusBadge';
import { DecisionPanel, type GateActionName } from '@/components/approvals/DecisionPanel';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const user = await getSessionUser();
  if (!user || (user.role !== 'QC_MANAGER' && user.role !== 'ADMIN')) {
    return (
      <>
        <SectionHead no="05" title="Approvals" />
        <div className="card p-8 max-w-md">
          <h2 className="text-[16px] font-semibold">QC Manager gate</h2>
          <p className="text-[13.5px] mt-2" style={{ color: 'var(--ink2)' }}>
            Only the QC Manager decides approval gates. Your submissions appear here once they
            reach a gate — track them in the NCR register.
          </p>
        </div>
      </>
    );
  }

  const queue = await prisma.ncr.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'PENDING_CLOSURE_APPROVAL'] } },
    orderBy: { statusChangedAt: 'asc' },
    include: { _count: { select: { attachments: true, comments: true } } },
  });

  const now = new Date();
  const gate1 = queue.filter((n) => n.status === 'PENDING_APPROVAL').length;
  const gate2 = queue.length - gate1;
  const overdue = queue.filter((n) => isApprovalOverdue(n.status, n.statusChangedAt, now)).length;

  return (
    <>
      <SectionHead no="05" title="Approvals" sub="Everything waiting for your decision — oldest first." />

      <div className="grid grid-cols-3 gap-4 mb-6 max-w-2xl">
        <div className="card p-4">
          <p className="micro-label">Gate 1 · Disposition</p>
          <p className="mono text-[26px] font-medium mt-1">{gate1}</p>
        </div>
        <div className="card p-4">
          <p className="micro-label">Gate 2 · Closure</p>
          <p className="mono text-[26px] font-medium mt-1">{gate2}</p>
        </div>
        <div className="card p-4" style={overdue > 0 ? { borderColor: 'var(--danger)' } : undefined}>
          <p className="micro-label">Overdue &gt; 3 days</p>
          <p className="mono text-[26px] font-medium mt-1" style={overdue > 0 ? { color: 'var(--danger)' } : undefined}>
            {overdue}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {queue.map((n) => {
          const gate1Pending = n.status === 'PENDING_APPROVAL';
          const waiting = daysSince(n.statusChangedAt, now);
          const late = isApprovalOverdue(n.status, n.statusChangedAt, now);
          const approve: GateActionName = gate1Pending ? 'approve_disposition' : 'approve_closure';
          const reject: GateActionName = gate1Pending ? 'reject_disposition' : 'reject_closure';
          return (
            <div key={n.id} className="card card-hover p-5 grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-5">
              <div>
                <Link href={`/ncrs/${n.id}`} className="mono text-[17px] font-medium hover:underline"
                  style={{ color: 'var(--accent)' }}>
                  {n.ncrNo}
                </Link>
                <div className="mt-2">
                  <span className="badge" style={gate1Pending
                    ? { borderColor: 'var(--warning)', color: 'var(--warning)' }
                    : { borderColor: 'var(--navy)', color: 'var(--navy)' }}>
                    {fmtGate(n.status)}
                  </span>
                </div>
                <p className="mono text-[12px] mt-2" style={{ color: late ? 'var(--danger)' : 'var(--slate)' }}>
                  waiting {waiting} day{waiting === 1 ? '' : 's'}
                </p>
                {late && <div className="mt-1"><OverdueBadge kind="approval" /></div>}
                <p className="mono text-[11px] mt-2" style={{ color: 'var(--slate)' }}>
                  raised {fmtDate(n.date)}
                </p>
              </div>

              <div className="text-[13px] space-y-1.5 min-w-0">
                <p><span className="field-label inline mr-2">Project</span>{n.projectName ?? '—'} · {n.panelRef ?? '—'} ({n.panelType ?? '—'})</p>
                <p><span className="field-label inline mr-2">Item</span>{n.itemName ?? '—'} · {n.make ?? '—'}</p>
                <p><span className="field-label inline mr-2">Defect</span>{n.defectType ?? '—'} · qty {fmtQty(n.defectQty)} of {fmtQty(n.totalQty)}</p>
                <p className="line-clamp-2" style={{ color: 'var(--ink2)' }}>{n.defectDetails ?? ''}</p>
                <p>
                  <span className="field-label inline mr-2">Proposed disposition</span>
                  <span className="font-semibold">{n.disposition ?? '—'}</span>
                  {n.dispositionNote && <span style={{ color: 'var(--slate)' }}> — {n.dispositionNote}</span>}
                </p>
                <p className="mono text-[11px]" style={{ color: 'var(--slate)' }}>
                  {n._count.attachments} attachment(s) · {n._count.comments} comment(s) ·{' '}
                  <Link href={`/ncrs/${n.id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                    open full record →
                  </Link>
                </p>
              </div>

              <DecisionPanel
                ncrId={n.id}
                approveAction={approve}
                rejectAction={reject}
                rejectHint={gate1Pending
                  ? 'Rejection returns the NCR to Under Review.'
                  : 'Rejection returns the NCR to Action In Progress.'}
              />
            </div>
          );
        })}

        {queue.length === 0 && (
          <div className="card p-14 text-center">
            <p className="text-[15px] font-medium">Queue is clear</p>
            <p className="micro-label mt-2">nothing awaits approval</p>
          </div>
        )}
      </div>
    </>
  );
}
