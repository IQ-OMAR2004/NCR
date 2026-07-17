'use client';

// Register table with client-side column visibility. Rows arrive as
// pre-formatted serializable DTOs from the server page.
import { useState } from 'react';
import Link from 'next/link';
import { StatusBadge, OverdueBadge } from '@/components/StatusBadge';

export interface RegisterRowDto {
  id: number;
  ncrNo: number;
  date: string;
  project: string | null;
  panelRef: string | null;
  panelType: string | null;
  itemName: string | null;
  make: string | null;
  defectType: string | null;
  qty: string; // "defect / total"
  status: string;
  openOverdue: boolean;
  approvalOverdue: boolean;
  needsTriage: boolean;
  responsible: string;
  closingDate: string;
}

interface Column {
  key: string;
  label: string;
  sortKey?: string;
}

const COLUMNS: Column[] = [
  { key: 'ncrNo', label: 'NCR No.', sortKey: 'ncrNo' },
  { key: 'date', label: 'Date', sortKey: 'date' },
  { key: 'project', label: 'Project' },
  { key: 'panelRef', label: 'Panel Ref.' },
  { key: 'panelType', label: 'Panel Type' },
  { key: 'itemName', label: 'Item' },
  { key: 'make', label: 'Make', sortKey: 'make' },
  { key: 'defectType', label: 'Defect Type' },
  { key: 'qty', label: 'Qty (def/tot)' },
  { key: 'status', label: 'Status', sortKey: 'status' },
  { key: 'responsible', label: 'Responsible' },
  { key: 'closingDate', label: 'Closed', sortKey: 'closingDate' },
];

const DEFAULT_HIDDEN = new Set<string>([]);

export function RegisterTable({
  rows,
  sort,
  makeSortHref,
}: {
  rows: RegisterRowDto[];
  sort?: string;
  /** server-computed href template: replace __SORT__ with `col:dir` */
  makeSortHref: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(DEFAULT_HIDDEN);
  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = COLUMNS.filter((c) => !hidden.has(c.key));
  const [sortCol, sortDir] = (sort ?? '').split(':');

  function sortHref(col: string): string {
    const dir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc';
    return makeSortHref.replace('__SORT__', `${col}:${dir}`);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--line2)' }}>
        <span className="micro-label">Register</span>
        <div className="relative">
          <button type="button" className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}
            aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}>
            Columns
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1 card p-3 z-20 w-52 shadow-lg">
              {COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 py-1 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.key)}
                    onChange={() => {
                      const next = new Set(hidden);
                      if (next.has(c.key)) next.delete(c.key);
                      else next.add(c.key);
                      setHidden(next);
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {visible.map((c) => (
                <th key={c.key}>
                  {c.sortKey ? (
                    <Link href={sortHref(c.sortKey)} className="hover:underline">
                      {c.label}
                      {sortCol === c.sortKey && (
                        <span className="ml-1" style={{ color: 'var(--accent)' }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.needsTriage ? { boxShadow: 'inset 3px 0 0 var(--warning)' } : undefined}>
                {visible.map((c) => (
                  <td key={c.key} className={c.key === 'ncrNo' || c.key === 'date' || c.key === 'qty' || c.key === 'closingDate' ? 'mono text-[12px] whitespace-nowrap' : undefined}>
                    {renderCell(c.key, r)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={visible.length} className="text-center py-12" style={{ color: 'var(--slate)' }}>
                  No NCRs match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderCell(key: string, r: RegisterRowDto): React.ReactNode {
  switch (key) {
    case 'ncrNo':
      return (
        <Link href={`/ncrs/${r.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
          {r.ncrNo}
        </Link>
      );
    case 'date': return r.date;
    case 'project': return r.project ?? '—';
    case 'panelRef': return r.panelRef ?? '—';
    case 'panelType': return r.panelType ?? '—';
    case 'itemName': return <span className="block max-w-[220px] truncate" title={r.itemName ?? undefined}>{r.itemName ?? '—'}</span>;
    case 'make': return r.make ?? '—';
    case 'defectType': return r.defectType ?? '—';
    case 'qty': return r.qty;
    case 'status':
      return (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge status={r.status} />
          {r.openOverdue && <OverdueBadge kind="open" />}
          {r.approvalOverdue && <OverdueBadge kind="approval" />}
        </span>
      );
    case 'responsible': return r.responsible;
    case 'closingDate': return r.closingDate;
    default: return null;
  }
}
