// Read-side queries: register filtering, dashboard aggregates, approval queue.
// All server-only; pages await these and render.
import 'server-only';
import type { Ncr, Prisma } from '@prisma/client';
import { prisma } from './db';
import {
  APPROVAL_OVERDUE_DAYS,
  OPEN_OVERDUE_DAYS,
  isApprovalOverdue,
  isOpenOverdue,
} from './domain';

export interface RegisterFilters {
  q?: string;
  year?: number;
  status?: string;
  project?: string;
  panelType?: string;
  make?: string;
  defectType?: string;
  responsible?: string;
  dateFrom?: Date;
  dateTo?: Date;
  overdue?: boolean;
  triage?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string; // e.g. "date:desc", "ncrNo:asc"
}

const SORTABLE = new Set(['date', 'ncrNo', 'slNo', 'projectName', 'make', 'status', 'closingDate', 'defectQty']);

export function buildRegisterWhere(f: RegisterFilters): Prisma.NcrWhereInput {
  const where: Prisma.NcrWhereInput = {};
  if (f.year) where.year = f.year;
  if (f.status) where.status = f.status;
  if (f.project) where.projectName = f.project;
  if (f.panelType) where.panelType = f.panelType;
  if (f.make) where.make = f.make;
  if (f.defectType) where.defectType = f.defectType;
  if (f.responsible) {
    where.OR = [
      { responsiblePerson: { contains: f.responsible } },
      { responsibleDept: { contains: f.responsible } },
    ];
  }
  if (f.dateFrom || f.dateTo) {
    where.date = {
      ...(f.dateFrom ? { gte: f.dateFrom } : {}),
      ...(f.dateTo ? { lte: f.dateTo } : {}),
    };
  }
  if (f.triage) where.needsTriage = true;
  if (f.overdue) {
    const openCutoff = new Date(Date.now() - OPEN_OVERDUE_DAYS * 86400_000);
    const gateCutoff = new Date(Date.now() - APPROVAL_OVERDUE_DAYS * 86400_000);
    where.AND = [
      {
        OR: [
          { status: { not: 'CLOSED' }, date: { lt: openCutoff } },
          {
            status: { in: ['PENDING_APPROVAL', 'PENDING_CLOSURE_APPROVAL'] },
            statusChangedAt: { lt: gateCutoff },
          },
        ],
      },
    ];
  }
  if (f.q) {
    const q = f.q.trim();
    const qNum = Number(q);
    const or: Prisma.NcrWhereInput[] = [
      { projectName: { contains: q } },
      { panelRef: { contains: q } },
      { itemName: { contains: q } },
      { itemCode: { contains: q } },
      { itemDescription: { contains: q } },
      { make: { contains: q } },
      { defectDetails: { contains: q } },
      { so: { contains: q } },
      { serialsJson: { contains: q } },
    ];
    if (Number.isInteger(qNum) && qNum > 0) or.push({ ncrNo: qNum });
    where.AND = [...((where.AND as Prisma.NcrWhereInput[]) ?? []), { OR: or }];
  }
  return where;
}

export interface RegisterResult {
  rows: Ncr[];
  total: number;
  page: number;
  pageSize: number;
}

export async function queryRegister(f: RegisterFilters): Promise<RegisterResult> {
  const page = Math.max(1, f.page ?? 1);
  // UI never asks for more than 200; the export route passes 10000 explicitly.
  const pageSize = Math.min(10000, Math.max(10, f.pageSize ?? 50));
  const where = buildRegisterWhere(f);

  let orderBy: Prisma.NcrOrderByWithRelationInput = { date: 'desc' };
  if (f.sort) {
    const [col, dir] = f.sort.split(':');
    if (SORTABLE.has(col) && (dir === 'asc' || dir === 'desc')) orderBy = { [col]: dir };
  }

  const [rows, total] = await Promise.all([
    prisma.ncr.findMany({ where, orderBy: [orderBy, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.ncr.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/** Distinct filter options for register dropdowns. */
export async function registerFacets(): Promise<{
  years: number[]; projects: string[]; panelTypes: string[]; makes: string[]; defectTypes: string[];
}> {
  const [years, projects, panelTypes, makes, defectTypes] = await Promise.all([
    prisma.ncr.findMany({ distinct: ['year'], select: { year: true }, orderBy: { year: 'desc' } }),
    prisma.ncr.findMany({ distinct: ['projectName'], select: { projectName: true }, where: { projectName: { not: null } }, orderBy: { projectName: 'asc' } }),
    prisma.ncr.findMany({ distinct: ['panelType'], select: { panelType: true }, where: { panelType: { not: null } }, orderBy: { panelType: 'asc' } }),
    prisma.ncr.findMany({ distinct: ['make'], select: { make: true }, where: { make: { not: null } }, orderBy: { make: 'asc' } }),
    prisma.ncr.findMany({ distinct: ['defectType'], select: { defectType: true }, where: { defectType: { not: null } }, orderBy: { defectType: 'asc' } }),
  ]);
  return {
    years: years.map((r) => r.year),
    projects: projects.map((r) => r.projectName as string),
    panelTypes: panelTypes.map((r) => r.panelType as string),
    makes: makes.map((r) => r.make as string),
    defectTypes: defectTypes.map((r) => r.defectType as string),
  };
}

export async function vocab(category: string): Promise<string[]> {
  const items = await prisma.vocabItem.findMany({
    where: { category, active: true },
    orderBy: { sortOrder: 'asc' },
  });
  return items.map((i) => i.value);
}

export async function people(): Promise<{ name: string; department: string | null }[]> {
  return prisma.person.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
}

// ── approval queue ─────────────────────────────────────────────────────────
export async function approvalQueue(): Promise<Ncr[]> {
  return prisma.ncr.findMany({
    where: { status: { in: ['PENDING_APPROVAL', 'PENDING_CLOSURE_APPROVAL'] } },
    orderBy: { statusChangedAt: 'asc' }, // oldest first
  });
}

// ── dashboard ──────────────────────────────────────────────────────────────
export interface DashboardData {
  kpis: {
    open: number;
    closedThisMonth: number;
    avgDaysToClose: number | null;
    awaitingApproval: number;
    overdueOpen: number;
    overdueApprovals: number;
    needsTriage: number;
  };
  byMake: { key: string; count: number; defectQty: number }[];
  byPanelType: { key: string; count: number }[];
  byDefectType: { key: string; count: number }[];
  byCause: { key: string; count: number }[];
  byProject: { key: string; count: number }[];
  monthlyTrend: { month: string; y2025: number; y2026: number }[];
  aging: { bucket: string; count: number }[];
}

export async function dashboardData(): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [open, closedThisMonth, awaitingApproval, needsTriage, closedAll, openAll] = await Promise.all([
    prisma.ncr.count({ where: { status: { not: 'CLOSED' } } }),
    prisma.ncr.count({ where: { status: 'CLOSED', closingDate: { gte: monthStart } } }),
    prisma.ncr.count({ where: { status: { in: ['PENDING_APPROVAL', 'PENDING_CLOSURE_APPROVAL'] } } }),
    prisma.ncr.count({ where: { needsTriage: true } }),
    prisma.ncr.findMany({
      where: { status: 'CLOSED', closingDate: { not: null } },
      select: { date: true, closingDate: true },
    }),
    prisma.ncr.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { date: true, status: true, statusChangedAt: true },
    }),
  ]);

  const closeDurations = closedAll
    .map((n) => ((n.closingDate as Date).getTime() - n.date.getTime()) / 86400_000)
    .filter((d) => d >= 0 && d < 400);
  const avgDaysToClose = closeDurations.length
    ? Math.round((closeDurations.reduce((a, b) => a + b, 0) / closeDurations.length) * 10) / 10
    : null;

  const overdueOpen = openAll.filter((n) => isOpenOverdue(n.status, n.date, now)).length;
  const overdueApprovals = openAll.filter((n) => isApprovalOverdue(n.status, n.statusChangedAt, now)).length;

  const [byMakeRaw, byPanelRaw, byDefectRaw, byCauseRaw, byProjectRaw] = await Promise.all([
    prisma.ncr.groupBy({
      by: ['make'], _count: { _all: true }, _sum: { defectQty: true },
      where: { make: { not: null } },
      orderBy: { _sum: { defectQty: 'desc' } }, take: 15,
    }),
    prisma.ncr.groupBy({
      by: ['panelType'], _count: { _all: true },
      where: { panelType: { not: null } },
      orderBy: { _count: { panelType: 'desc' } }, take: 12,
    }),
    prisma.ncr.groupBy({
      by: ['defectType'], _count: { _all: true },
      where: { defectType: { not: null } },
      orderBy: { _count: { defectType: 'desc' } },
    }),
    prisma.ncr.groupBy({
      by: ['cause'], _count: { _all: true },
      where: { cause: { not: null } },
      orderBy: { _count: { cause: 'desc' } },
    }),
    prisma.ncr.groupBy({
      by: ['projectName'], _count: { _all: true },
      where: { projectName: { not: null } },
      orderBy: { _count: { projectName: 'desc' } }, take: 10,
    }),
  ]);

  // monthly trend 2025 vs 2026
  const dates = await prisma.ncr.findMany({ select: { date: true, year: true } });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const trend = months.map((m) => ({ month: m, y2025: 0, y2026: 0 }));
  for (const n of dates) {
    const m = n.date.getUTCMonth();
    if (n.year === 2025) trend[m].y2025++;
    else if (n.year === 2026) trend[m].y2026++;
  }

  // aging buckets for open NCRs
  const buckets = [
    { bucket: '0–7 d', min: 0, max: 7 },
    { bucket: '8–30 d', min: 8, max: 30 },
    { bucket: '31–60 d', min: 31, max: 60 },
    { bucket: '61–90 d', min: 61, max: 90 },
    { bucket: '90+ d', min: 91, max: Infinity },
  ];
  const aging = buckets.map((b) => ({ bucket: b.bucket, count: 0 }));
  for (const n of openAll) {
    // Floor to whole days so the integer bucket bounds are contiguous — a
    // fractional age like 7.4 d must not fall through the 7↔8 gap.
    const days = Math.floor((now.getTime() - n.date.getTime()) / 86400_000);
    const idx = buckets.findIndex((b) => days >= b.min && days <= b.max);
    if (idx >= 0) aging[idx].count++;
  }

  return {
    kpis: { open, closedThisMonth, avgDaysToClose, awaitingApproval, overdueOpen, overdueApprovals, needsTriage },
    byMake: byMakeRaw.map((r) => ({
      key: r.make as string,
      count: r._count._all,
      defectQty: Math.round(r._sum.defectQty ?? 0),
    })),
    byPanelType: byPanelRaw.map((r) => ({ key: r.panelType as string, count: r._count._all })),
    byDefectType: byDefectRaw.map((r) => ({ key: r.defectType as string, count: r._count._all })),
    byCause: byCauseRaw.map((r) => ({ key: r.cause as string, count: r._count._all })),
    byProject: byProjectRaw.map((r) => ({ key: r.projectName as string, count: r._count._all })),
    monthlyTrend: trend,
    aging,
  };
}

/** Supplier-quality pivot (replaces the Excel "Analysis" sheets). */
export async function supplierQuality(year?: number): Promise<
  { make: string; ncrs: number; defectQty: number; topDefect: string | null }[]
> {
  const where: Prisma.NcrWhereInput = { make: { not: null }, ...(year ? { year } : {}) };
  const grouped = await prisma.ncr.groupBy({
    by: ['make'], _count: { _all: true }, _sum: { defectQty: true },
    where, orderBy: { _sum: { defectQty: 'desc' } },
  });
  const topDefects = await prisma.ncr.groupBy({
    by: ['make', 'defectType'], _count: { _all: true },
    where: { ...where, defectType: { not: null } },
  });
  const topByMake = new Map<string, { defect: string; count: number }>();
  for (const t of topDefects) {
    const cur = topByMake.get(t.make as string);
    if (!cur || t._count._all > cur.count) {
      topByMake.set(t.make as string, { defect: t.defectType as string, count: t._count._all });
    }
  }
  return grouped.map((g) => ({
    make: g.make as string,
    ncrs: g._count._all,
    defectQty: Math.round(g._sum.defectQty ?? 0),
    topDefect: topByMake.get(g.make as string)?.defect ?? null,
  }));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
