// Pure data-cleaning rules for the legacy Excel import.
// Every rule here mirrors .claude/skills/ncr-alfanar/references/vocabularies.md.
// Pure functions — unit-tested in tests/importer.test.ts without a DB.

export interface LegacyStatusResult {
  disposition: string | null;
  /** In-flight state when the row is NOT internally closed. */
  state: 'ACTION_IN_PROGRESS' | 'ACTION_COMPLETED' | 'UNDER_REVIEW';
  note: string | null;
  extractedDate: Date | null;
  /** True when no mapping matched — flag for manual triage. */
  unmapped: boolean;
}

/** Parse "30/1/2025", "30-1-2025", "30/01/25" (day-first) → Date, else null. */
export function parseDMY(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    // Excel serial dates arrive as JS Dates already (cellDates: true).
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === 'number') return null; // raw serials shouldn't appear with cellDates:true
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // reject rollovers like 31/2
  if (date.getUTCDate() !== d || date.getUTCMonth() !== mo - 1) return null;
  return date;
}

/** Trailing date inside a status string, e.g. "Waiting for testing confirmation 22/7/2025". */
export function extractTrailingDate(text: string): { rest: string; date: Date | null } {
  const m = text.match(/[\s\-–]*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*\.?\s*$/);
  if (!m) return { rest: text.trim(), date: null };
  const date = parseDMY(m[1]);
  if (!date) return { rest: text.trim(), date: null };
  return { rest: text.slice(0, m.index).trim(), date };
}

const MAKE_CANONICAL: Record<string, string> = {
  ALFANR: 'ALFANAR',
  'ARABIAN INDUSTRIAL METAL COATING CO.': 'ARABIAN INDUSTRIAL METAL COATING CO',
  'KRAUS&NAIMER': 'KRAUS & NAIMER',
  'KRAUS & NAIMER': 'KRAUS & NAIMER',
  'SQUARE D': 'SQUARE-D',
  GIOVENZANA: 'GIOVANZANA',
  'FUTURE MINE INDUSTRY COMPANY': 'FUTURE MINE INDUSTRY',
  'SHOROOQ ALASMAH FOR METAL FABRICATION CO': 'SHOROOQ ALASMAH FOR METAL FABRICATION',
  'SHOROOQ ALASMAH FOR METAL FABRICATION CO.': 'SHOROOQ ALASMAH FOR METAL FABRICATION',
};
const MAKE_NULLS = new Set(['', '--', '-', 'NA', 'N/A', '(BLANK)', 'NIL']);

/** Trim, collapse whitespace, dedupe known variants; junk values → null. */
export function normalizeMake(value: unknown): { value: string | null; changed: boolean } {
  if (value == null) return { value: null, changed: false };
  const raw = String(value);
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const upper = collapsed.toUpperCase();
  if (MAKE_NULLS.has(upper)) return { value: null, changed: collapsed !== '' };
  const canonicalUpper = MAKE_CANONICAL[upper];
  if (canonicalUpper) {
    // preserve display case when only punctuation/case differs, else use canonical
    return { value: canonicalUpper, changed: true };
  }
  return { value: collapsed, changed: collapsed !== raw };
}

export function normalizePanelType(value: unknown): { value: string | null; changed: boolean } {
  if (value == null) return { value: null, changed: false };
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (v === '') return { value: null, changed: false };
  if (/^ALFA\s+DT$/i.test(v)) return { value: 'ALFA-DT', changed: true };
  return { value: v, changed: v !== String(value) };
}

export function normalizeDefectType(value: unknown): { value: string | null; changed: boolean } {
  if (value == null) return { value: null, changed: false };
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (v === '') return { value: null, changed: false };
  const fixed = v.replace(/deffect/gi, 'defect');
  const canon = fixed.toLowerCase() === 'manufacturing defect' ? 'Manufacturing defect' : fixed;
  return { value: canon, changed: canon !== String(value) };
}

export function normalizeNcType(value: unknown): { value: string | null; changed: boolean } {
  if (value == null) return { value: null, changed: false };
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (v === '') return { value: null, changed: false };
  const fixed = v.replace(/deffect/gi, 'defect');
  const canon = fixed.toLowerCase() === 'material defect' ? 'Material defect' : fixed;
  return { value: canon, changed: canon !== String(value) };
}

const DEPT_CANON: Record<string, string> = {
  qc: 'QC',
  testing: 'Testing',
  production: 'Production',
  busbar: 'Busbar',
  store: 'Store',
  substore: 'Store',
  planning: 'Planning',
};

/** "Sachin - Testing" → {person, department}; "QC" → {null, QC}; junk → {raw, null}. */
export function parseResponsible(value: unknown): { person: string | null; department: string | null } {
  if (value == null) return { person: null, department: null };
  const v = String(value).replace(/\s+/g, ' ').trim();
  if (v === '') return { person: null, department: null };
  const deptOnly = DEPT_CANON[v.toLowerCase()];
  if (deptOnly) return { person: null, department: deptOnly };
  const m = v.match(/^(.*?)\s*-\s*(.+)$/);
  if (m) {
    const dept = DEPT_CANON[m[2].trim().toLowerCase()];
    return { person: m[1].trim() || null, department: dept ?? m[2].trim() };
  }
  // "Shibili QC" style: trailing token is a known department
  const parts = v.split(' ');
  const last = DEPT_CANON[parts[parts.length - 1]?.toLowerCase() ?? ''];
  if (last && parts.length > 1) {
    return { person: parts.slice(0, -1).join(' '), department: last };
  }
  return { person: v, department: null };
}

/** Multi-serial cell → string[]. Splits on comma, ampersand, newline, slash-space. */
export function splitSerials(value: unknown): string[] {
  if (value == null) return [];
  return String(value)
    .split(/[,&\n;]|\s\/\s/)
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '-');
}

// ---------------------------------------------------------------------------
// Legacy STATUS (col 21) → structured disposition + state + note (+ date)
// ---------------------------------------------------------------------------
interface StatusRule {
  test: RegExp;
  disposition: string | null;
  state: LegacyStatusResult['state'];
  keepNote: boolean;
}

const STATUS_RULES: readonly StatusRule[] = [
  { test: /^take\s+replacement/i, disposition: 'Take replacement from stock', state: 'ACTION_COMPLETED', keepNote: false },
  { test: /^rep(?:al|la)?cement\s+received|^accessories\s+received/i, disposition: 'Take replacement from stock', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /(closed\s+intern|internall?y?\s+closed|printed\s+an?d?\s+closed|repaired\s+and\s+closed\s+internally)/i, disposition: 'Close internally (documentation-only)', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /^waiting\s+for\s+testing\s+(confirmation|verification)/i, disposition: 'Take replacement from stock', state: 'ACTION_IN_PROGRESS', keepNote: true },
  { test: /^repaired\s+by\s+supplier/i, disposition: 'Repaired by supplier', state: 'ACTION_COMPLETED', keepNote: false },
  { test: /^repaired\s+(internally|and\s+foun?d?\s+ok)/i, disposition: 'Repaired internally', state: 'ACTION_IN_PROGRESS', keepNote: true },
  { test: /^closed\s+as\s+per\s+(the\s+)?(d&d|supplier)/i, disposition: 'Use as is / Accept as is', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /^accepted\s+as\s+(it\s+is|per)/i, disposition: 'Use as is / Accept as is', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /^use\s+as\s+is/i, disposition: 'Use as is / Accept as is', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /^agreed\s+to\s+replace\s+at\s+site/i, disposition: 'Replace at site (PE & PMO agreement)', state: 'ACTION_IN_PROGRESS', keepNote: true },
  { test: /shuff?l?ed\s+from\s+another\s+project/i, disposition: 'Shuffle from another project', state: 'ACTION_COMPLETED', keepNote: true },
  { test: /^defective\s+material\s+handover\s+to\s+substore/i, disposition: 'Return to supplier', state: 'ACTION_IN_PROGRESS', keepNote: true },
  { test: /^return(ed)?\s+to\s+supplier/i, disposition: 'Return to supplier', state: 'ACTION_IN_PROGRESS', keepNote: false },
  { test: /^scrap/i, disposition: 'Scrap', state: 'ACTION_COMPLETED', keepNote: false },
  { test: /^rework/i, disposition: 'Rework', state: 'ACTION_IN_PROGRESS', keepNote: false },
];

export function parseLegacyStatus(value: unknown): LegacyStatusResult {
  const raw = value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
  if (raw === '') {
    return { disposition: null, state: 'UNDER_REVIEW', note: null, extractedDate: null, unmapped: false };
  }
  const { rest, date } = extractTrailingDate(raw);
  for (const rule of STATUS_RULES) {
    if (rule.test.test(rest)) {
      return {
        disposition: rule.disposition,
        state: rule.state,
        note: rule.keepNote || date ? raw : null,
        extractedDate: date,
        unmapped: false,
      };
    }
  }
  return { disposition: null, state: 'UNDER_REVIEW', note: raw, extractedDate: date, unmapped: true };
}

/** "Closed"/"closed " → true. */
export function isClosedFlag(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'closed';
}

export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function toStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}
