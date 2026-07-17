// §04 NCR detail — record, workflow timeline, gates, comments, attachments, audit.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { people, vocab } from '@/lib/queries';
import {
  canEditFields,
  isApprovalOverdue,
  isOpenOverdue,
  parseSerials,
  rulesFor,
  STATUS_LABELS,
  type NcrStatus,
  type Role,
} from '@/lib/domain';
import { fmtDate, fmtDateTime, fmtQty, daysSince } from '@/lib/format';
import { SectionHead } from '@/components/Shell';
import { StatusBadge, OverdueBadge } from '@/components/StatusBadge';
import { ActionButtons } from '@/components/detail/ActionButtons';
import { RecordCard } from '@/components/detail/RecordCard';
import { DispositionCard } from '@/components/detail/DispositionCard';
import { SapCard } from '@/components/detail/SapCard';
import { CommentForm, AttachmentForm } from '@/components/detail/Forms';
import type { RecordDto, RuleDto, VocabSets } from '@/components/detail/types';

export const dynamic = 'force-dynamic';

export default async function NcrDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await props.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();

  const [user, ncr] = await Promise.all([
    getSessionUser(),
    prisma.ncr.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        transitions: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        approvals: { include: { approver: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
        comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        attachments: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        auditLogs: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 },
      },
    }),
  ]);
  if (!ncr || !user) notFound();

  const role = user.role as Role;
  const status = ncr.status as NcrStatus;
  const now = new Date();
  const editable = canEditFields(role, status);
  const isViewer = role === 'VIEWER';

  const rules: RuleDto[] = rulesFor(status)
    .filter((r) => r.roles.includes(role))
    .map((r) => ({
      action: r.action, label: r.label, to: r.to, gate: r.gate,
      decision: r.decision, requiresComment: r.requiresComment,
      requiresDisposition: r.requiresDisposition,
    }));

  const record: RecordDto = {
    id: ncr.id, slNo: ncr.slNo, year: ncr.year,
    date: ncr.date.toISOString(), ncrNo: ncr.ncrNo,
    so: ncr.so, fg: ncr.fg, prO: ncr.prO,
    projectName: ncr.projectName, panelRef: ncr.panelRef, panelType: ncr.panelType,
    itemCode: ncr.itemCode, itemName: ncr.itemName, itemDescription: ncr.itemDescription,
    make: ncr.make, totalQty: ncr.totalQty, defectQty: ncr.defectQty,
    serials: parseSerials(ncr.serialsJson),
    defectDetails: ncr.defectDetails, defectType: ncr.defectType, ncType: ncr.ncType,
    cause: ncr.cause, responsiblePerson: ncr.responsiblePerson, responsibleDept: ncr.responsibleDept,
    remarks: ncr.remarks, status: ncr.status,
  };

  let vocabSets: VocabSets | null = null;
  if (editable || rules.length > 0) {
    const [panelTypes, defectTypes, ncTypes, causes, makes, departments, dispositions, persons] =
      await Promise.all([
        vocab('PANEL_TYPE'), vocab('DEFECT_TYPE'), vocab('NC_TYPE'), vocab('CAUSE'),
        vocab('MAKE'), vocab('DEPARTMENT'), vocab('DISPOSITION'), people(),
      ]);
    vocabSets = {
      projects: [], panelTypes, makes, defectTypes, ncTypes, causes, departments, dispositions,
      people: persons.map((p) => (p.department ? `${p.name} — ${p.department}` : p.name)),
    };
  }

  const canPropose =
    !isViewer &&
    (status === 'UNDER_REVIEW' || status === 'DISPOSITION_PROPOSED') &&
    (role === 'QC_ENGINEER' || role === 'QC_MANAGER' || role === 'ADMIN');

  // The gate decision context (spec 3.2: side-by-side summary at the gates)
  const atGate = status === 'PENDING_APPROVAL' || status === 'PENDING_CLOSURE_APPROVAL';
  const isApprover = role === 'QC_MANAGER' || role === 'ADMIN';

  return (
    <>
      <SectionHead
        no="04"
        title={`NCR ${ncr.ncrNo}`}
        sub={[ncr.projectName, ncr.panelRef, `SL ${ncr.slNo}/${ncr.year}`].filter(Boolean).join(' · ')}
      >
        <StatusBadge status={ncr.status} />
        {isOpenOverdue(ncr.status, ncr.date, now) && <OverdueBadge kind="open" />}
        {isApprovalOverdue(ncr.status, ncr.statusChangedAt, now) && <OverdueBadge kind="approval" />}
        {ncr.importedLegacy && <span className="badge bg-white" title="Imported from the legacy Excel register">Legacy import</span>}
        {ncr.needsTriage && (
          <span className="badge" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Needs triage
          </span>
        )}
        {ncr.disposition && (
          <Link href={`/tag/${ncr.id}`} target="_blank" className="btn btn-outline">Print tag</Link>
        )}
      </SectionHead>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <RecordCard record={record} editable={editable} vocab={vocabSets} />
          <DispositionCard
            ncrId={ncr.id}
            disposition={ncr.disposition}
            note={ncr.dispositionNote}
            canPropose={canPropose}
            dispositions={vocabSets?.dispositions ?? []}
          />
          <SapCard
            ncrId={ncr.id}
            status={ncr.status}
            closingDate={ncr.closingDate?.toISOString() ?? null}
            sapClosed={ncr.sapClosed}
            sapClosingDate={ncr.sapClosingDate?.toISOString() ?? null}
            canEdit={!isViewer && ncr.status === 'CLOSED'}
          />

          {/* Comments */}
          <section className="card p-5">
            <p className="micro-label mb-4">Comments · {ncr.comments.length}</p>
            {!isViewer && <CommentForm ncrId={ncr.id} />}
            <ul className="space-y-3 mt-4">
              {ncr.comments.map((c) => (
                <li key={c.id} className="border-b pb-3 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium">{c.author.name}</span>
                    <span className="mono text-[11px]" style={{ color: 'var(--slate)' }}>{fmtDateTime(c.createdAt)}</span>
                  </div>
                  <p className="text-[13.5px] mt-1 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
              {ncr.comments.length === 0 && (
                <li className="text-[13px]" style={{ color: 'var(--slate)' }}>No comments yet.</li>
              )}
            </ul>
          </section>

          {/* Attachments */}
          <section className="card p-5">
            <p className="micro-label mb-4">Attachments · {ncr.attachments.length}</p>
            {!isViewer && <AttachmentForm ncrId={ncr.id} />}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {ncr.attachments.map((a) => (
                <a key={a.id} href={a.storedPath} target="_blank" rel="noreferrer"
                  className="card card-hover p-2 block">
                  {a.mime.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.storedPath} alt={a.filename} className="w-full h-28 object-cover rounded-md" />
                  ) : (
                    <div className="w-full h-28 grid place-items-center rounded-md" style={{ background: 'var(--panel)' }}>
                      <span className="mono text-[11px]">PDF</span>
                    </div>
                  )}
                  <p className="text-[11.5px] mt-1.5 truncate" title={a.filename}>{a.filename}</p>
                  <p className="mono text-[10px]" style={{ color: 'var(--slate)' }}>
                    {a.uploadedBy.name} · {fmtDate(a.createdAt)}
                  </p>
                </a>
              ))}
              {ncr.attachments.length === 0 && (
                <p className="text-[13px] col-span-full" style={{ color: 'var(--slate)' }}>
                  No photos or documents attached.
                </p>
              )}
            </div>
          </section>

          {/* Audit trail */}
          <section className="card overflow-hidden">
            <p className="micro-label px-5 pt-5 pb-3">Audit trail · last {ncr.auditLogs.length}</p>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr><th>When</th><th>Who</th><th>Action</th><th>Field</th><th>Before → After</th></tr>
                </thead>
                <tbody>
                  {ncr.auditLogs.map((l) => (
                    <tr key={l.id} style={l.action === 'APPROVAL' ? { background: 'var(--panel)' } : undefined}>
                      <td className="mono text-[11.5px] whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                      <td className="whitespace-nowrap">{l.actor?.name ?? 'system'}</td>
                      <td className="mono text-[11px]">{l.action}</td>
                      <td>{l.field ?? '—'}</td>
                      <td className="max-w-[300px]">
                        <span className="block truncate" title={`${l.before ?? ''} → ${l.after ?? ''}`}>
                          {l.before && <span style={{ color: 'var(--slate)' }}>{l.before} → </span>}
                          {l.after ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Import traceability */}
          {ncr.importRaw && (
            <details className="card p-5">
              <summary className="micro-label cursor-pointer">Original Excel row (import traceability)</summary>
              <pre className="mono text-[11px] mt-3 whitespace-pre-wrap break-all" style={{ color: 'var(--ink2)' }}>
                {JSON.stringify(JSON.parse(ncr.importRaw), null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* RIGHT: workflow */}
        <div className="space-y-5">
          {atGate && isApprover && (
            <div className="card p-5" style={{ background: 'var(--panel)' }}>
              <p className="micro-label mb-3">
                {status === 'PENDING_APPROVAL' ? 'Gate 1 · Disposition decision' : 'Gate 2 · Closure decision'}
              </p>
              <dl className="space-y-2 text-[13px]">
                <div><dt className="field-label">Proposed disposition</dt><dd className="font-semibold">{ncr.disposition ?? '—'}</dd></div>
                <div><dt className="field-label">Defect</dt><dd>{ncr.defectType ?? '—'} · {fmtQty(ncr.defectQty)} of {fmtQty(ncr.totalQty)}</dd></div>
                <div><dt className="field-label">Details</dt><dd className="line-clamp-3">{ncr.defectDetails ?? '—'}</dd></div>
                <div><dt className="field-label">Evidence</dt><dd>{ncr.attachments.length} attachment(s) · {ncr.comments.length} comment(s)</dd></div>
                <div><dt className="field-label">Waiting</dt><dd className="mono">{daysSince(ncr.statusChangedAt)} day(s)</dd></div>
              </dl>
            </div>
          )}

          {rules.length > 0 && (
            <div className="card p-5">
              <p className="micro-label mb-3">Available actions</p>
              <ActionButtons ncrId={ncr.id} rules={rules} hasDisposition={!!ncr.disposition} />
            </div>
          )}

          <div className="card p-5">
            <p className="micro-label mb-4">Workflow timeline</p>
            <ol className="relative space-y-4 pl-5" style={{ borderLeft: '2px solid var(--line2)' }}>
              <li className="text-[12.5px]">
                <span className="absolute -left-[5px] mt-1 badge-dot" style={{ background: 'var(--slate)', width: 8, height: 8 }} />
                <span className="font-medium">Created</span>
                {ncr.createdBy && <> by {ncr.createdBy.name}</>}
                {ncr.importedLegacy && ' (legacy import)'}
                <div className="mono text-[11px]" style={{ color: 'var(--slate)' }}>{fmtDateTime(ncr.createdAt)}</div>
              </li>
              {ncr.transitions.map((t) => {
                const approval = ncr.approvals.find(
                  (a) => Math.abs(a.createdAt.getTime() - t.createdAt.getTime()) < 1500 &&
                    ((t.action.startsWith('approve_') && a.decision === 'APPROVED') ||
                     (t.action.startsWith('reject_') && a.decision === 'REJECTED')),
                );
                return (
                  <li key={t.id} className="text-[12.5px]">
                    <span className="absolute -left-[5px] mt-1 badge-dot" style={{
                      background: approval
                        ? approval.decision === 'APPROVED' ? 'var(--success)' : 'var(--danger)'
                        : 'var(--accent)',
                      width: 8, height: 8,
                    }} />
                    <span className="font-medium">
                      {STATUS_LABELS[t.fromStatus as NcrStatus] ?? t.fromStatus} → {STATUS_LABELS[t.toStatus as NcrStatus] ?? t.toStatus}
                    </span>
                    <div style={{ color: 'var(--ink2)' }}>{t.actor.name}</div>
                    {approval && (
                      <div className="mt-1 px-2.5 py-1.5 rounded-md border text-[12px]" style={{
                        borderColor: approval.decision === 'APPROVED' ? 'var(--success)' : 'var(--danger)',
                        background: '#fff',
                      }}>
                        <span className="mono text-[10.5px] uppercase tracking-wider" style={{
                          color: approval.decision === 'APPROVED' ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {approval.gate} {approval.decision}
                        </span>
                        {' — '}{approval.approver.name}
                        {approval.comment && <p className="italic mt-0.5">&ldquo;{approval.comment}&rdquo;</p>}
                      </div>
                    )}
                    {!approval && t.comment && <p className="italic" style={{ color: 'var(--slate)' }}>&ldquo;{t.comment}&rdquo;</p>}
                    <div className="mono text-[11px]" style={{ color: 'var(--slate)' }}>{fmtDateTime(t.createdAt)}</div>
                  </li>
                );
              })}
            </ol>
            {ncr.transitions.length === 0 && (
              <p className="text-[12.5px]" style={{ color: 'var(--slate)' }}>
                {ncr.importedLegacy
                  ? 'Historical record — imported in its final state, no workflow steps recorded.'
                  : 'No transitions yet.'}
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="micro-label mb-3">Meta</p>
            <dl className="text-[12.5px] space-y-1.5">
              <div className="flex justify-between"><dt style={{ color: 'var(--slate)' }}>Raised</dt><dd className="mono">{fmtDate(ncr.date)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: 'var(--slate)' }}>Age</dt><dd className="mono">{daysSince(ncr.date)} days</dd></div>
              <div className="flex justify-between"><dt style={{ color: 'var(--slate)' }}>In current state</dt><dd className="mono">{daysSince(ncr.statusChangedAt)} days</dd></div>
              <div className="flex justify-between"><dt style={{ color: 'var(--slate)' }}>Closed</dt><dd className="mono">{fmtDate(ncr.closingDate)}</dd></div>
              <div className="flex justify-between"><dt style={{ color: 'var(--slate)' }}>SAP</dt><dd className="mono">{ncr.sapClosed ? `Closed ${fmtDate(ncr.sapClosingDate)}` : 'Open'}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
