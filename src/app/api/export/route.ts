// Excel / CSV export of the register — always matches the on-screen filters
// (same parser as the register page). Any authenticated role may export.
import * as XLSX from 'xlsx';
import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { queryRegister } from '@/lib/queries';
import { parseSerials, STATUS_LABELS, type NcrStatus } from '@/lib/domain';
import { parseRegisterFilters, REGISTER_PARAM_KEYS } from '@/components/register/filters';

export const dynamic = 'force-dynamic';

function dmy(d: Date | null): string {
  if (!d) return '';
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const sp = req.nextUrl.searchParams;
  const params: Record<string, string | undefined> = {};
  for (const k of REGISTER_PARAM_KEYS) params[k] = sp.get(k) ?? undefined;
  const filters = parseRegisterFilters(params);
  filters.page = 1;
  filters.pageSize = 10000;

  const { rows } = await queryRegister({ ...filters, pageSize: 10000 });

  const data = rows.map((n) => ({
    'SL No.': n.slNo,
    'Date': dmy(n.date),
    'NCR No.': n.ncrNo,
    'SO#': n.so ?? '',
    'FG#': n.fg ?? '',
    'Pr.O#': n.prO ?? '',
    'Project Name': n.projectName ?? '',
    'Panel Ref.': n.panelRef ?? '',
    'Panel Type': n.panelType ?? '',
    'Item code': n.itemCode ?? '',
    'Item Name': n.itemName ?? '',
    'Item description': n.itemDescription ?? '',
    'Make': n.make ?? '',
    'Total Quantity': n.totalQty ?? '',
    'Defect quantity': n.defectQty ?? '',
    'Serial No.': parseSerials(n.serialsJson).join(', '),
    'Defect details': n.defectDetails ?? '',
    'Defect Type': n.defectType ?? '',
    'Type Of Nonconformance': n.ncType ?? '',
    'Cause Of Nonconformance': n.cause ?? '',
    'Disposition': n.disposition ?? '',
    'Disposition note': n.dispositionNote ?? '',
    'Closing Date': dmy(n.closingDate),
    'Status(Internal)': n.status === 'CLOSED' ? 'Closed' : 'Open',
    'Status in SAP': n.sapClosed ? 'Closed' : 'Open',
    'SAP closing date': dmy(n.sapClosingDate),
    'Responsible': n.responsiblePerson
      ? `${n.responsiblePerson}${n.responsibleDept ? ` - ${n.responsibleDept}` : ''}`
      : n.responsibleDept ?? '',
    'Remarks': n.remarks ?? '',
    'Workflow status': STATUS_LABELS[n.status as NcrStatus] ?? n.status,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const stamp = new Date().toISOString().slice(0, 10);

  if (sp.get('format') === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="ncr-register-${stamp}.csv"`,
      },
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NCR Register');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="ncr-register-${stamp}.xlsx"`,
    },
  });
}
