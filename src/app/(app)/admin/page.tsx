// §06 Administration — users, controlled vocabularies, audit trail.
// ADMIN-only: the (app) layout guarantees a session; the role is re-checked here.
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { vocab } from '@/lib/queries';
import { DEPARTMENTS } from '@/lib/domain';
import { fmtDateTime } from '@/lib/format';
import { SectionHead } from '@/components/Shell';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { VocabPanel } from '@/components/admin/VocabPanel';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'vocab', label: 'Vocabularies' },
  { key: 'audit', label: 'Audit Log' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const VOCAB_CATEGORIES = [
  { key: 'PANEL_TYPE', label: 'Panel Type' },
  { key: 'DEFECT_TYPE', label: 'Defect Type' },
  { key: 'NC_TYPE', label: 'NC Type' },
  { key: 'CAUSE', label: 'Cause' },
  { key: 'MAKE', label: 'Make' },
  { key: 'DISPOSITION', label: 'Disposition' },
  { key: 'PROJECT', label: 'Project' },
  { key: 'DEPARTMENT', label: 'Department' },
] as const;

const AUDIT_ACTIONS = [
  'CREATE',
  'FIELD_CHANGE',
  'TRANSITION',
  'APPROVAL',
  'IMPORT',
  'LOGIN',
  'VOCAB',
  'USER_ADMIN',
] as const;

function pick(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <>
        <SectionHead no="06" title="Administration" />
        <div className="card p-8 max-w-md">
          <h2 className="text-[16px] font-semibold">Admin access required</h2>
          <p className="text-[13.5px] mt-2" style={{ color: 'var(--ink2)' }}>
            This section is restricted to administrators. Contact QC management if you
            believe you need access.
          </p>
        </div>
      </>
    );
  }

  const sp = await props.searchParams;
  const tabRaw = pick(sp.tab);
  const tab: TabKey = tabRaw === 'vocab' || tabRaw === 'audit' ? tabRaw : 'users';

  const categoryRaw = pick(sp.category);
  const category =
    categoryRaw && VOCAB_CATEGORIES.some((c) => c.key === categoryRaw) ? categoryRaw : 'PANEL_TYPE';

  const actionRaw = pick(sp.action);
  const auditAction =
    actionRaw && (AUDIT_ACTIONS as readonly string[]).includes(actionRaw) ? actionRaw : undefined;
  const q = (pick(sp.q) ?? '').trim() || undefined;

  // Tab links preserve the other tabs' params so switching back keeps context.
  const keep = new URLSearchParams();
  if (categoryRaw) keep.set('category', category);
  if (auditAction) keep.set('action', auditAction);
  if (q) keep.set('q', q);
  const tabHref = (t: TabKey): string => {
    const p = new URLSearchParams(keep);
    p.set('tab', t);
    return `/admin?${p.toString()}`;
  };

  return (
    <>
      <SectionHead
        no="06"
        title="Administration"
        sub="Users, controlled vocabularies and the compliance audit trail."
      />

      <div className="flex gap-6 border-b mb-6" style={{ borderColor: 'var(--line2)' }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={`pb-2.5 -mb-px text-[13.5px] border-b-2 transition-colors ${active ? 'font-semibold' : ''}`}
              style={
                active
                  ? { borderColor: 'var(--accent)', color: 'var(--navy)' }
                  : { borderColor: 'transparent', color: 'var(--slate)' }
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === 'users' && <UsersTab selfId={user.id} />}
      {tab === 'vocab' && <VocabTab category={category} />}
      {tab === 'audit' && <AuditTab action={auditAction} q={q} />}
    </>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────
async function UsersTab({ selfId }: { selfId: string }) {
  const [users, deptVocab] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    vocab('DEPARTMENT'),
  ]);
  const departments = deptVocab.length > 0 ? deptVocab : [...DEPARTMENTS];
  return (
    <UsersPanel
      selfId={selfId}
      departments={departments}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        department: u.department,
        active: u.active,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}

// ── Vocabularies ────────────────────────────────────────────────────────────
async function VocabTab({ category }: { category: string }) {
  const items = await prisma.vocabItem.findMany({
    where: { category },
    orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
  });
  const label = VOCAB_CATEGORIES.find((c) => c.key === category)?.label ?? category;

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        {VOCAB_CATEGORIES.map((c) => {
          const active = c.key === category;
          return (
            <Link
              key={c.key}
              href={`/admin?tab=vocab&category=${c.key}`}
              className="mono text-[11px] tracking-wider uppercase px-3 py-1.5 rounded-full border transition-colors"
              style={
                active
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { background: '#fff', borderColor: 'var(--line2)', color: 'var(--ink2)' }
              }
            >
              {c.label}
            </Link>
          );
        })}
      </div>
      <VocabPanel
        category={category}
        categoryLabel={label}
        items={items.map((i) => ({ id: i.id, value: i.value, active: i.active }))}
      />
    </>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────
async function AuditTab({ action, q }: { action?: string; q?: string }) {
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { field: { contains: q } },
      { before: { contains: q } },
      { after: { contains: q } },
    ];
  }
  const logs = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true } }, ncr: { select: { id: true, ncrNo: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="card overflow-hidden">
      <form
        method="get"
        action="/admin"
        className="flex flex-wrap items-end gap-3 px-4 py-4 border-b"
        style={{ borderColor: 'var(--line2)' }}
      >
        <input type="hidden" name="tab" value="audit" />
        <div>
          <label className="field-label" htmlFor="audit-action">Action</label>
          <select id="audit-action" name="action" defaultValue={action ?? ''} className="input" style={{ width: 200 }}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[220px] max-w-[320px]">
          <label className="field-label" htmlFor="audit-q">Search</label>
          <input
            id="audit-q"
            name="q"
            defaultValue={q ?? ''}
            className="input"
            placeholder="Field, before or after value…"
          />
        </div>
        <button type="submit" className="btn btn-outline">Filter</button>
        {(action || q) && (
          <Link href="/admin?tab=audit" className="text-[12.5px] self-center" style={{ color: 'var(--accent)' }}>
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>NCR</th>
              <th>Action</th>
              <th>Field</th>
              <th>Before → After</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                style={log.action === 'APPROVAL' ? { background: 'var(--panel)' } : undefined}
              >
                <td className="mono text-[12px] whitespace-nowrap">{fmtDateTime(log.createdAt)}</td>
                <td className="whitespace-nowrap">{log.actor?.name ?? '—'}</td>
                <td className="mono text-[12px]">
                  {log.ncr && log.ncrId != null ? (
                    <Link
                      href={`/ncrs/${log.ncrId}`}
                      className="hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {log.ncr.ncrNo}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="mono text-[11px] whitespace-nowrap">{log.action}</td>
                <td className="whitespace-nowrap">{log.field ?? '—'}</td>
                <td className="max-w-[380px]">
                  <span
                    className="block truncate"
                    title={`${log.before ?? '—'} → ${log.after ?? '—'}`}
                  >
                    {log.before != null && (
                      <span style={{ color: 'var(--slate)' }}>{log.before} → </span>
                    )}
                    {log.after ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10" style={{ color: 'var(--slate)' }}>
                  No audit entries match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="px-4 py-3 border-t flex items-center justify-between flex-wrap gap-2"
        style={{ borderColor: 'var(--line2)' }}
      >
        <span className="micro-label">Latest {logs.length} entries</span>
        <span className="micro-label">APPROVAL rows tinted — compliance trail</span>
      </div>
    </div>
  );
}
