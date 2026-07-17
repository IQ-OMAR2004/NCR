 
// Legacy Excel importer — idempotent: re-running replaces previously imported
// (importedLegacy) rows per year and re-inserts, never touching user-created NCRs
// nor legacy rows that have since been worked on in the app.
// Usage: npx tsx scripts/import-excel.ts   (imports the two bundled 2025/2026 workbooks)
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import 'dotenv/config';
import { createPrismaClient } from '../src/lib/prisma-client';
import {
  isClosedFlag,
  normalizeDefectType,
  normalizeMake,
  normalizeNcType,
  normalizePanelType,
  parseDMY,
  parseLegacyStatus,
  parseResponsible,
  splitSerials,
  toNumber,
  toStr,
} from '../src/lib/import/clean';

const prisma = createPrismaClient();

interface FileSpec {
  file: string;
  sheet: string;
  year: number;
}

const DEFAULT_FILES: FileSpec[] = [
  { file: '../Copy of NCR Details 2025 SG FOR AI.xlsx', sheet: 'SAP 2025', year: 2025 },
  { file: '../Copy of NCR Details 2026 SG FOR AI.xlsx', sheet: 'SAP 2026', year: 2026 },
];

interface Report {
  file: string;
  scanned: number;
  imported: number;
  skipped: { row: number; reason: string }[];
  cleaned: Record<string, number>;
  triage: number;
  warnings: string[];
}

function bump(rec: Record<string, number>, key: string): void {
  rec[key] = (rec[key] ?? 0) + 1;
}

type Row = unknown[];

async function importFile(spec: FileSpec): Promise<Report> {
  const abs = path.resolve(process.cwd(), spec.file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const wb = XLSX.readFile(abs, { cellDates: true });
  const ws = wb.Sheets[spec.sheet];
  if (!ws) throw new Error(`Sheet "${spec.sheet}" not found in ${spec.file}`);
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null });

  const report: Report = {
    file: path.basename(abs), scanned: 0, imported: 0, skipped: [], cleaned: {}, triage: 0, warnings: [],
  };

  // Idempotency WITHOUT data loss: re-import replaces previously imported rows
  // for this year, but never deletes a legacy row that has been worked on in the
  // app (comments, attachments, approvals or workflow transitions). Those are
  // preserved and skipped on re-insert, so user work is never cascaded away.
  const worked = await prisma.ncr.findMany({
    where: {
      year: spec.year,
      importedLegacy: true,
      OR: [
        { transitions: { some: {} } },
        { comments: { some: {} } },
        { approvals: { some: {} } },
        { attachments: { some: {} } },
      ],
    },
    select: { ncrNo: true, slNo: true },
  });
  const preserved = new Set(worked.map((w) => `${w.ncrNo}|${w.slNo}`));
  const removed = await prisma.ncr.deleteMany({
    where: {
      year: spec.year,
      importedLegacy: true,
      NOT: {
        OR: [
          { transitions: { some: {} } },
          { comments: { some: {} } },
          { approvals: { some: {} } },
          { attachments: { some: {} } },
        ],
      },
    },
  });
  if (removed.count > 0) report.warnings.push(`Re-import: replaced ${removed.count} untouched ${spec.year} rows`);
  if (preserved.size > 0) report.warnings.push(`Preserved ${preserved.size} ${spec.year} rows with user work (kept, not re-imported)`);

  const inserts = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || c === '')) continue;
    report.scanned++;
    const excelRow = i + 1;

    const ncrNo = toNumber(r[2]);
    if (ncrNo == null) {
      report.skipped.push({ row: excelRow, reason: `no NCR No. (SL ${String(r[0] ?? '—')})` });
      continue;
    }

    const date = parseDMY(r[1]);
    const dateMissing = date == null; // no usable raise date → fabricated below, flag for triage
    if (date == null && r[1] != null) bump(report.cleaned, 'unparseable date → fabricated Jan 1, flagged triage');
    else if (typeof r[1] === 'string') bump(report.cleaned, 'text date parsed (D/M/YYYY)');

    const panel = normalizePanelType(r[8]);
    if (panel.changed) bump(report.cleaned, 'panel type normalized (ALFA DT → ALFA-DT)');
    const make = normalizeMake(r[12]);
    if (make.changed) bump(report.cleaned, 'make trimmed/deduped');
    const defectType = normalizeDefectType(r[17]);
    if (defectType.changed) bump(report.cleaned, '"deffect" → "defect" (Defect Type)');
    const ncType = normalizeNcType(r[18]);
    if (ncType.changed) bump(report.cleaned, '"deffect" → "defect" (NC Type)');

    const legacy = parseLegacyStatus(r[20]);
    if (legacy.disposition) bump(report.cleaned, 'legacy STATUS mapped to disposition');
    if (legacy.extractedDate) bump(report.cleaned, 'date extracted from STATUS text');
    if (legacy.unmapped) { report.triage++; bump(report.cleaned, 'STATUS unmapped → needs triage'); }

    const closedInternal = isClosedFlag(r[22]);
    const status = closedInternal ? 'CLOSED' : legacy.state;

    const closingDate = parseDMY(r[21]);
    if (typeof r[21] === 'string' && closingDate) bump(report.cleaned, 'text closing date parsed');
    const sapClosed = isClosedFlag(r[23]);
    const sapClosingDate = parseDMY(r[24]);

    const responsible = parseResponsible(r[25]);
    const serials = splitSerials(r[15]);

    const totalQty = toNumber(r[13]);
    const defectQty = toNumber(r[14]);
    if (totalQty != null && defectQty != null && defectQty > totalQty) {
      report.warnings.push(`row ${excelRow}: defect qty ${defectQty} > total ${totalQty} (imported as-is, legacy)`);
    }

    const slNo = toNumber(r[0]) ?? report.scanned;
    // Skip rows already preserved from a prior import with user work on them.
    if (preserved.has(`${ncrNo}|${slNo}`)) continue;

    const needsTriage = (legacy.unmapped || dateMissing) && !closedInternal;
    if (dateMissing) report.triage++;

    inserts.push({
      slNo,
      year: spec.year,
      date: date ?? new Date(Date.UTC(spec.year, 0, 1)),
      ncrNo,
      so: toStr(r[3]),
      fg: toStr(r[4]),
      prO: toStr(r[5]),
      projectName: toStr(r[6]),
      panelRef: toStr(r[7]),
      panelType: panel.value,
      itemCode: toStr(r[9]),
      itemName: toStr(r[10]),
      itemDescription: toStr(r[11]),
      make: make.value,
      totalQty,
      defectQty,
      serialsJson: JSON.stringify(serials),
      defectDetails: toStr(r[16]),
      defectType: defectType.value,
      ncType: ncType.value,
      cause: toStr(r[19]),
      disposition: legacy.disposition,
      dispositionNote: legacy.note,
      status,
      statusChangedAt: closingDate ?? date ?? new Date(),
      closingDate: status === 'CLOSED' ? closingDate : null,
      sapClosed,
      sapClosingDate,
      responsiblePerson: responsible.person,
      responsibleDept: responsible.department,
      remarks: toStr(r[26]),
      importRaw: JSON.stringify({
        row: excelRow,
        cells: r.map((c) => (c instanceof Date ? c.toISOString() : c)),
      }),
      importedLegacy: true,
      needsTriage,
    });
  }

  // chunked createMany (SQLite variable limit)
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    await prisma.ncr.createMany({ data: chunk });
    report.imported += chunk.length;
  }

  // people directory from Responsible column
  const people = new Map<string, { name: string; department: string | null }>();
  for (const ins of inserts) {
    if (ins.responsiblePerson) {
      people.set(`${ins.responsiblePerson}|${ins.responsibleDept ?? ''}`, {
        name: ins.responsiblePerson,
        department: ins.responsibleDept,
      });
    }
  }
  for (const p of people.values()) {
    await prisma.person.upsert({
      where: { name_department: { name: p.name, department: p.department ?? '' } },
      update: {},
      create: { name: p.name, department: p.department ?? '' },
    });
  }

  await prisma.auditLog.create({
    data: {
      action: 'IMPORT',
      field: spec.file,
      after: `imported ${report.imported}, skipped ${report.skipped.length}, triage ${report.triage}`,
    },
  });

  return report;
}

async function main(): Promise<void> {
  console.log('══ alfanar NCR legacy import ══');
  const reports: Report[] = [];
  for (const spec of DEFAULT_FILES) {
    reports.push(await importFile(spec));
  }

  for (const rep of reports) {
    console.log(`\n▌ ${rep.file}`);
    console.log(`  rows scanned:   ${rep.scanned}`);
    console.log(`  imported:       ${rep.imported}`);
    console.log(`  skipped:        ${rep.skipped.length}`);
    for (const s of rep.skipped.slice(0, 10)) console.log(`    · row ${s.row}: ${s.reason}`);
    if (rep.skipped.length > 10) console.log(`    · … and ${rep.skipped.length - 10} more`);
    console.log(`  needs triage:   ${rep.triage} (unmapped legacy STATUS)`);
    console.log('  cleaning applied:');
    for (const [rule, n] of Object.entries(rep.cleaned).sort((a, b) => b[1] - a[1])) {
      console.log(`    · ${rule}: ${n}`);
    }
    for (const w of rep.warnings.slice(0, 8)) console.log(`  ⚠ ${w}`);
  }

  const total = await prisma.ncr.count();
  console.log(`\n▌ database now holds ${total} NCRs`);
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
