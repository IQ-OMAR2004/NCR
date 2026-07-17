// Rejection / Rework tag — print-ready A5, recreated from the workbook "tag"
// sheet. Lives OUTSIDE the (app) group so the sidebar never prints.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { parseSerials, TAG_FACTORY, TAG_REF_NO, tagVariant } from '@/lib/domain';
import { fmtDate } from '@/lib/format';
import { PrintButton } from '@/components/tag/TagChrome';
import { TagQr } from '@/components/tag/TagQr';

export const dynamic = 'force-dynamic';

const LOGO_BLUE = 'https://www.alfanar.com/assets/images/logo-blue.svg';

export default async function TagPage(props: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const { id: idStr } = await props.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();
  const ncr = await prisma.ncr.findUnique({ where: { id } });
  if (!ncr) notFound();

  const variant = tagVariant(ncr.disposition);
  const headerBg = variant === 'red' ? 'var(--danger)' : 'var(--warning)';
  const headerText = variant === 'red' ? 'REJECTION TAG - DO NOT USE' : 'REWORK/REJECTION TAG';
  const serials = parseSerials(ncr.serialsJson).join(', ');

  const tag = (
    <div className="print-tag bg-white mx-auto" style={{
      width: '100%', maxWidth: 640, border: '1.5px solid var(--navy)', borderRadius: 12, overflow: 'hidden',
    }}>
      {/* ref row */}
      <div className="flex justify-between items-center px-4 pt-2.5 pb-1.5">
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink2)' }}>Ref. No.: {TAG_REF_NO}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_BLUE} alt="alfanar" style={{ height: 18 }} />
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink2)' }}>{TAG_FACTORY}</span>
      </div>
      {/* header */}
      <div className="text-center py-2" style={{ background: headerBg }}>
        <span style={{
          fontFamily: 'var(--font-poppins)', fontWeight: 700, fontSize: 17,
          color: '#fff', letterSpacing: '0.06em',
        }}>
          {headerText}
        </span>
      </div>
      {/* field grid */}
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          <Row2 l1="WO/ SO No." v1={ncr.so ?? ncr.prO ?? '—'} l2="Panel Ref." v2={ncr.panelRef ?? '—'} />
          <Row2 l1="NCR No" v1={String(ncr.ncrNo)} l2="Date" v2={fmtDate(ncr.date)} />
          <Row2 l1="Item Code" v1={ncr.itemCode ?? '—'} l2="SI. No." v2={serials || '—'} />
          <Row2 l1="Model no." v1={ncr.itemName ?? '—'} l2="Qty." v2={String(ncr.defectQty ?? '—')} />
          <RowFull label="Item Description" value={ncr.itemDescription ?? '—'} />
          <RowFull label="Defect" value={ncr.defectDetails ?? '—'} />
          <tr>
            <Cell label="Disposition" value={ncr.disposition ?? '—'} strong />
            <Cell label="Sign." value="" sign />
          </tr>
        </tbody>
      </table>
      {/* footer strip with QR */}
      <div className="flex items-end justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--line2)' }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: 'var(--slate)' }}>
          ALFANAR · MV SWITCHGEAR · QUALITY CONTROL
        </span>
        <TagQr value={String(ncr.ncrNo)} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen brand-grid-bg py-8 px-6 print:bg-white print:p-0">
      <div className="no-print max-w-[640px] mx-auto mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="micro-label">NCR REGISTER / NCR {ncr.ncrNo} / TAG</p>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--slate)' }}>
            A5 landscape · two copies per sheet · attach one to the material
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/ncrs/${ncr.id}`} className="btn btn-outline">Back to NCR</Link>
          <PrintButton />
        </div>
      </div>

      <div className="space-y-5">
        {tag}
        <div className="no-print-divider mx-auto" style={{
          maxWidth: 640, borderTop: '1.5px dashed var(--slate)', position: 'relative',
        }}>
          <span className="mono absolute -top-2 left-1/2 -translate-x-1/2 px-2 brand-grid-bg"
            style={{ fontSize: 9, color: 'var(--slate)', letterSpacing: '0.2em' }}>
            CUT
          </span>
        </div>
        {tag}
      </div>
    </div>
  );
}

function Cell({ label, value, strong, sign }: { label: string; value: string; strong?: boolean; sign?: boolean }) {
  return (
    <td style={{ border: '1px solid var(--line2)', padding: '7px 12px', width: '50%' }}>
      <span className="mono block" style={{
        fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate)',
      }}>
        {label}
      </span>
      <span className="block" style={{
        fontWeight: strong ? 600 : 400,
        minHeight: sign ? 34 : undefined,
        fontSize: strong ? 13 : 12,
      }}>
        {value}
      </span>
    </td>
  );
}

function Row2({ l1, v1, l2, v2 }: { l1: string; v1: string; l2: string; v2: string }) {
  return (
    <tr>
      <Cell label={l1} value={v1} />
      <Cell label={l2} value={v2} />
    </tr>
  );
}

function RowFull({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td colSpan={2} style={{ border: '1px solid var(--line2)', padding: '7px 12px' }}>
        <span className="mono block" style={{
          fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate)',
        }}>
          {label}
        </span>
        <span style={{ fontSize: 12 }}>{value}</span>
      </td>
    </tr>
  );
}
