// §02 NCR Register — searchable, filterable, sortable, exportable.
import Link from 'next/link';
import { queryRegister, registerFacets } from '@/lib/queries';
import { STATUS_LABELS, NCR_STATUSES, isApprovalOverdue, isOpenOverdue } from '@/lib/domain';
import { fmtDate, fmtQty } from '@/lib/format';
import { SectionHead } from '@/components/Shell';
import { RegisterTable, type RegisterRowDto } from '@/components/register/RegisterTable';
import { firstParam, parseRegisterFilters, REGISTER_PARAM_KEYS } from '@/components/register/filters';

export const dynamic = 'force-dynamic';

export default async function RegisterPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const spRaw = await props.searchParams;
  const params: Record<string, string | undefined> = {};
  for (const k of REGISTER_PARAM_KEYS) params[k] = firstParam(spRaw[k]);

  const filters = parseRegisterFilters(params);
  const [result, facets] = await Promise.all([queryRegister(filters), registerFacets()]);
  const now = new Date();

  const rows: RegisterRowDto[] = result.rows.map((n) => ({
    id: n.id,
    ncrNo: n.ncrNo,
    date: fmtDate(n.date),
    project: n.projectName,
    panelRef: n.panelRef,
    panelType: n.panelType,
    itemName: n.itemName,
    make: n.make,
    defectType: n.defectType,
    qty: `${fmtQty(n.defectQty)} / ${fmtQty(n.totalQty)}`,
    status: n.status,
    openOverdue: isOpenOverdue(n.status, n.date, now),
    approvalOverdue: isApprovalOverdue(n.status, n.statusChangedAt, now),
    needsTriage: n.needsTriage,
    responsible: n.responsiblePerson
      ? `${n.responsiblePerson}${n.responsibleDept ? ` — ${n.responsibleDept}` : ''}`
      : n.responsibleDept ?? '—',
    closingDate: fmtDate(n.closingDate),
  }));

  // hrefs preserving current params
  const qs = new URLSearchParams();
  for (const k of REGISTER_PARAM_KEYS) {
    const v = params[k];
    if (v) qs.set(k, v);
  }
  const withParam = (key: string, value: string | null): string => {
    const p = new URLSearchParams(qs);
    if (value === null) p.delete(key);
    else p.set(key, value);
    if (key !== 'page') p.delete('page'); // filter/sort changes reset paging
    const s = p.toString();
    return s ? `/ncrs?${s}` : '/ncrs';
  };
  const sortHrefTemplate = withParam('sort', '__SORT__');
  const exportQs = qs.toString();

  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return (
    <>
      <SectionHead no="02" title="NCR Register" sub={`${result.total.toLocaleString()} non-conformance reports`}>
        <a href={`/api/export${exportQs ? `?${exportQs}` : ''}`} className="btn btn-outline">Export Excel</a>
        <a href={`/api/export?format=csv${exportQs ? `&${exportQs}` : ''}`} className="btn btn-outline">CSV</a>
        <Link href="/ncrs/new" className="btn btn-primary">New NCR</Link>
      </SectionHead>

      <form method="get" action="/ncrs" className="card p-4 mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2">
            <label className="field-label" htmlFor="f-q">Search</label>
            <input id="f-q" name="q" defaultValue={params.q ?? ''} className="input"
              placeholder="NCR no, project, item, serial, defect…" />
          </div>
          <div>
            <label className="field-label" htmlFor="f-year">Year</label>
            <select id="f-year" name="year" defaultValue={params.year ?? ''} className="input">
              <option value="">All</option>
              {facets.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-status">Status</label>
            <select id="f-status" name="status" defaultValue={params.status ?? ''} className="input">
              <option value="">All</option>
              {NCR_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-project">Project</label>
            <select id="f-project" name="project" defaultValue={params.project ?? ''} className="input">
              <option value="">All</option>
              {facets.projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-panel">Panel type</label>
            <select id="f-panel" name="panelType" defaultValue={params.panelType ?? ''} className="input">
              <option value="">All</option>
              {facets.panelTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-make">Make</label>
            <select id="f-make" name="make" defaultValue={params.make ?? ''} className="input">
              <option value="">All</option>
              {facets.makes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-defect">Defect type</label>
            <select id="f-defect" name="defectType" defaultValue={params.defectType ?? ''} className="input">
              <option value="">All</option>
              {facets.defectTypes.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="f-resp">Responsible</label>
            <input id="f-resp" name="responsible" defaultValue={params.responsible ?? ''} className="input" placeholder="Name or dept" />
          </div>
          <div>
            <label className="field-label" htmlFor="f-from">From</label>
            <input id="f-from" name="from" type="date" defaultValue={params.from ?? ''} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="f-to">To</label>
            <input id="f-to" name="to" type="date" defaultValue={params.to ?? ''} className="input" />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === '1'} />
              Overdue only
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="triage" value="1" defaultChecked={params.triage === '1'} />
              Triage
            </label>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-primary">Apply</button>
            <Link href="/ncrs" className="btn btn-outline">Clear</Link>
          </div>
        </div>
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
      </form>

      <RegisterTable rows={rows} sort={params.sort} makeSortHref={sortHrefTemplate} />

      <div className="flex items-center justify-between mt-4">
        <span className="micro-label">
          Showing {from.toLocaleString()}–{to.toLocaleString()} of {result.total.toLocaleString()}
        </span>
        <div className="flex gap-2">
          {result.page > 1 && (
            <Link href={withParam('page', String(result.page - 1))} className="btn btn-outline">← Prev</Link>
          )}
          <span className="mono text-[12px] self-center" style={{ color: 'var(--slate)' }}>
            {result.page} / {lastPage}
          </span>
          {result.page < lastPage && (
            <Link href={withParam('page', String(result.page + 1))} className="btn btn-outline">Next →</Link>
          )}
        </div>
      </div>
    </>
  );
}
