// §07 Import & Export — legacy import provenance + register exports.
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { fmtDateTime } from '@/lib/format';
import { SectionHead } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function ImportExportPage() {
  const [total, byYear, legacy, triage, importLogs] = await Promise.all([
    prisma.ncr.count(),
    prisma.ncr.groupBy({ by: ['year'], _count: { _all: true }, orderBy: { year: 'asc' } }),
    prisma.ncr.count({ where: { importedLegacy: true } }),
    prisma.ncr.count({ where: { needsTriage: true } }),
    prisma.auditLog.findMany({ where: { action: 'IMPORT' }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  return (
    <>
      <SectionHead no="07" title="Import & Export" sub="Legacy workbook import and register exports." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <p className="micro-label mb-4">Legacy import</p>
          <p className="text-[13.5px]" style={{ color: 'var(--ink2)' }}>
            The 2025 and 2026 NCR workbooks are imported by <code className="mono text-[12px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--panel)' }}>npm run db:import</code> — idempotent: re-running
            replaces previously imported rows and never touches NCRs created in this app. The import
            report (cleaned / skipped rows) prints to the terminal.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div>
              <p className="micro-label">Total NCRs</p>
              <p className="mono text-[22px] font-medium">{total.toLocaleString()}</p>
            </div>
            {byYear.map((y) => (
              <div key={y.year}>
                <p className="micro-label">{y.year}</p>
                <p className="mono text-[22px] font-medium">{y._count._all.toLocaleString()}</p>
              </div>
            ))}
            <div>
              <p className="micro-label">From legacy import</p>
              <p className="mono text-[22px] font-medium">{legacy.toLocaleString()}</p>
            </div>
            <div>
              <p className="micro-label">Needs triage</p>
              <p className="mono text-[22px] font-medium">
                {triage > 0 ? (
                  <Link href="/ncrs?triage=1" className="hover:underline" style={{ color: 'var(--warning)' }}>
                    {triage}
                  </Link>
                ) : (
                  0
                )}
              </p>
            </div>
          </div>

          <details className="mt-5">
            <summary className="micro-label cursor-pointer">Cleaning rules applied on import</summary>
            <ul className="mono text-[11.5px] mt-3 space-y-1.5" style={{ color: 'var(--ink2)' }}>
              <li>· &ldquo;Manufacturing deffect&rdquo; → &ldquo;Manufacturing defect&rdquo;; &ldquo;Material deffect&rdquo; → &ldquo;Material defect&rdquo;</li>
              <li>· &ldquo;ALFA DT&rdquo; → &ldquo;ALFA-DT&rdquo;; Make trimmed + variant-deduped; junk (&ldquo;--&rdquo;, &ldquo;NA&rdquo;) → empty</li>
              <li>· text dates &ldquo;30/1/2025&rdquo; parsed day-first (D/M/YYYY)</li>
              <li>· legacy STATUS split into disposition + workflow state + note; trailing dates extracted</li>
              <li>· rows without an NCR No. skipped and reported</li>
              <li>· original row preserved as JSON (importRaw) on every record</li>
              <li>· unmapped STATUS values flagged needs-triage instead of guessing</li>
            </ul>
          </details>
        </section>

        <section className="card p-5">
          <p className="micro-label mb-4">Export</p>
          <p className="text-[13.5px] mb-4" style={{ color: 'var(--ink2)' }}>
            Full register in the original 27-column layout (+ workflow status). Filtered exports are
            available from the register page — they respect the active filters.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" className="btn btn-primary">Full register · Excel</a>
            <a href="/api/export?format=csv" className="btn btn-outline">Full register · CSV</a>
            <Link href="/ncrs" className="btn btn-outline">Filtered export → Register</Link>
          </div>

          <p className="micro-label mt-6 mb-3">Import history</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>When</th><th>File</th><th>Result</th></tr>
              </thead>
              <tbody>
                {importLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="mono text-[11.5px] whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                    <td className="text-[12px]">{l.field ?? '—'}</td>
                    <td className="mono text-[11.5px]">{l.after ?? '—'}</td>
                  </tr>
                ))}
                {importLogs.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-8" style={{ color: 'var(--slate)' }}>
                    No imports recorded yet — run npm run db:import.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
