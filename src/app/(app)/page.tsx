// §01 Quality Dashboard — KPIs, supplier pareto, trends, aging, breakdowns.
// Replaces the workbook "Analysis" pivot sheets.
import Link from 'next/link';
import { dashboardData, supplierQuality } from '@/lib/queries';
import { SectionHead } from '@/components/Shell';
import {
  AgingChart, Donut, HorizontalBars, MonthlyTrend, SupplierPareto,
} from '@/components/charts/Charts';

export const dynamic = 'force-dynamic';

function Kpi({
  label, value, href, danger,
}: {
  label: string; value: string | number; href?: string; danger?: boolean;
}) {
  const body = (
    <div className={`card p-4 h-full ${href ? 'card-hover' : ''}`}
      style={danger ? { borderColor: 'var(--danger)' } : undefined}>
      <p className="micro-label">{label}</p>
      <p className="mono text-[28px] font-medium mt-1" style={danger ? { color: 'var(--danger)' } : undefined}>
        {value}
      </p>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export default async function DashboardPage() {
  const [d, suppliers] = await Promise.all([dashboardData(), supplierQuality()]);
  const k = d.kpis;

  return (
    <>
      <SectionHead no="01" title="Quality Dashboard" sub="MV Switchgear non-conformance overview — live from the NCR register." />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
        <Kpi label="Open NCRs" value={k.open} href="/ncrs" />
        <Kpi label="Closed this month" value={k.closedThisMonth} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose ?? '—'} />
        <Kpi label="Awaiting approval" value={k.awaitingApproval} href="/approvals" />
        <Kpi label="Overdue open · 30d+" value={k.overdueOpen} href="/ncrs?overdue=1" danger={k.overdueOpen > 0} />
        <Kpi label="Overdue approvals" value={k.overdueApprovals} href="/approvals" danger={k.overdueApprovals > 0} />
        <Kpi label="Needs triage" value={k.needsTriage} href="/ncrs?triage=1" />
      </div>

      {/* Supplier pareto + table */}
      <div className="card p-5 mb-5">
        <p className="micro-label mb-1">NCRs &amp; defect quantity by Make — top suppliers</p>
        <p className="text-[12.5px] mb-3" style={{ color: 'var(--slate)' }}>
          Bars: defect quantity · line: cumulative share (pareto)
        </p>
        <SupplierPareto data={d.byMake} />
        <div className="overflow-x-auto mt-4 max-h-[320px] overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr><th>Make</th><th>NCRs</th><th>Defect qty</th><th>Top defect type</th></tr>
            </thead>
            <tbody>
              {suppliers.slice(0, 25).map((s) => (
                <tr key={s.make}>
                  <td className="font-medium whitespace-nowrap">
                    <Link href={`/ncrs?make=${encodeURIComponent(s.make)}`} className="hover:underline"
                      style={{ color: 'var(--accent)' }}>
                      {s.make}
                    </Link>
                  </td>
                  <td className="mono">{s.ncrs}</td>
                  <td className="mono">{s.defectQty}</td>
                  <td>{s.topDefect ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend + aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <p className="micro-label mb-3">Monthly NCRs — 2025 vs 2026</p>
          <MonthlyTrend data={d.monthlyTrend} />
        </div>
        <div className="card p-5">
          <p className="micro-label mb-3">Aging of open NCRs</p>
          <AgingChart data={d.aging} />
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <div className="card p-5">
          <p className="micro-label mb-3">By panel type</p>
          <HorizontalBars data={d.byPanelType} />
        </div>
        <div className="card p-5">
          <p className="micro-label mb-3">By defect type</p>
          <Donut data={d.byDefectType} />
        </div>
        <div className="card p-5">
          <p className="micro-label mb-3">By cause</p>
          <Donut data={d.byCause} />
        </div>
      </div>

      {/* Top projects */}
      <div className="card p-5">
        <p className="micro-label mb-4">Top projects by NCR count</p>
        <ul className="space-y-2.5">
          {d.byProject.map((p) => {
            const max = d.byProject[0]?.count ?? 1;
            return (
              <li key={p.key} className="grid grid-cols-[180px_1fr_56px] items-center gap-3">
                <Link href={`/ncrs?project=${encodeURIComponent(p.key)}`}
                  className="text-[13px] truncate hover:underline" title={p.key}>
                  {p.key}
                </Link>
                <div className="h-2 rounded-full" style={{ background: 'var(--panel)' }}>
                  <div className="h-2 rounded-full" style={{
                    width: `${Math.max(2, (p.count / max) * 100)}%`,
                    background: 'var(--accent)',
                  }} />
                </div>
                <span className="mono text-[12px] text-right">{p.count}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
