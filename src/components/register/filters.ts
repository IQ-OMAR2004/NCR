// Register filter param parsing — pure helpers shared by the register page
// (searchParams) and the export route handler (URLSearchParams). Keeping the
// mapping in one place guarantees the export always matches the on-screen list.
import type { RegisterFilters } from '@/lib/queries';

/** Every query-string key the register understands (page/sort included). */
export const REGISTER_PARAM_KEYS = [
  'q', 'year', 'status', 'project', 'panelType', 'make', 'defectType',
  'responsible', 'from', 'to', 'overdue', 'triage', 'sort', 'page',
] as const;

/** Next.js searchParams values can be arrays — take the first. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function flag(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'on';
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Map raw string params (already de-arrayed) to typed RegisterFilters. */
export function parseRegisterFilters(params: Record<string, string | undefined>): RegisterFilters {
  const s = (k: string): string | undefined => {
    const v = params[k]?.trim();
    return v ? v : undefined;
  };

  const f: RegisterFilters = {
    q: s('q'),
    status: s('status'),
    project: s('project'),
    panelType: s('panelType'),
    make: s('make'),
    defectType: s('defectType'),
    responsible: s('responsible'),
    sort: s('sort'),
  };

  const year = Number(s('year'));
  if (Number.isInteger(year) && year > 1900) f.year = year;

  const from = s('from');
  if (from && ISO_DAY.test(from)) {
    const d = new Date(`${from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) f.dateFrom = d;
  }
  // inclusive end-of-day so records dated "to" itself are included
  const to = s('to');
  if (to && ISO_DAY.test(to)) {
    const d = new Date(`${to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) f.dateTo = d;
  }

  if (flag(s('overdue'))) f.overdue = true;
  if (flag(s('triage'))) f.triage = true;

  const page = Number(s('page'));
  if (Number.isInteger(page) && page > 0) f.page = page;

  return f;
}
