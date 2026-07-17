import { describe, expect, it } from 'vitest';
import {
  extractTrailingDate,
  isClosedFlag,
  normalizeDefectType,
  normalizeMake,
  normalizeNcType,
  normalizePanelType,
  parseDMY,
  parseLegacyStatus,
  parseResponsible,
  splitSerials,
} from '../src/lib/import/clean';

describe('parseDMY (day-first text dates)', () => {
  it('parses 30/1/2025', () => {
    const d = parseDMY('30/1/2025');
    expect(d?.toISOString().slice(0, 10)).toBe('2025-01-30');
  });
  it('parses 5-12-2026 and 2-digit years', () => {
    expect(parseDMY('5-12-2026')?.toISOString().slice(0, 10)).toBe('2026-12-05');
    expect(parseDMY('7/3/25')?.toISOString().slice(0, 10)).toBe('2025-03-07');
  });
  it('rejects impossible dates and junk', () => {
    expect(parseDMY('31/2/2025')).toBeNull();
    expect(parseDMY('not a date')).toBeNull();
    expect(parseDMY(null)).toBeNull();
  });
  it('passes real Date cells through (date-only, UTC)', () => {
    const d = parseDMY(new Date(2025, 5, 17, 14, 30));
    expect(d?.toISOString().slice(0, 10)).toBe('2025-06-17');
  });
});

describe('typo normalization', () => {
  it('fixes "Manufacturing deffect"', () => {
    expect(normalizeDefectType('Manufacturing deffect').value).toBe('Manufacturing defect');
    expect(normalizeDefectType('Manufacturing deffect').changed).toBe(true);
  });
  it('fixes "Material deffect"', () => {
    expect(normalizeNcType('Material deffect').value).toBe('Material defect');
  });
  it('leaves clean values untouched', () => {
    expect(normalizeDefectType('Damaged')).toEqual({ value: 'Damaged', changed: false });
  });
  it('normalizes "ALFA DT" → "ALFA-DT"', () => {
    expect(normalizePanelType('ALFA DT').value).toBe('ALFA-DT');
    expect(normalizePanelType('ALFA12').value).toBe('ALFA12');
  });
});

describe('make normalization', () => {
  it('trims trailing spaces', () => {
    expect(normalizeMake('SEGA ')).toEqual({ value: 'SEGA', changed: true });
    expect(normalizeMake('EA SRL ').value).toBe('EA SRL');
  });
  it('dedupes trailing-dot company variant', () => {
    expect(normalizeMake('Arabian Industrial Metal Coating Co.').value).toBe(
      'ARABIAN INDUSTRIAL METAL COATING CO',
    );
  });
  it('maps junk to null', () => {
    expect(normalizeMake('--').value).toBeNull();
    expect(normalizeMake('NA').value).toBeNull();
    expect(normalizeMake(null).value).toBeNull();
  });
});

describe('legacy STATUS parsing', () => {
  it('maps the dominant value', () => {
    const r = parseLegacyStatus('Take replacement from stock');
    expect(r.disposition).toBe('Take replacement from stock');
    expect(r.unmapped).toBe(false);
  });
  it('extracts trailing dates from waiting statuses', () => {
    const r = parseLegacyStatus('Waiting for testing confirmation 22/7/2025');
    expect(r.disposition).toBe('Take replacement from stock');
    expect(r.state).toBe('ACTION_IN_PROGRESS');
    expect(r.extractedDate?.toISOString().slice(0, 10)).toBe('2025-07-22');
    expect(r.note).toContain('Waiting for testing confirmation');
  });
  it('maps closed-internally variants incl. typos', () => {
    for (const s of [
      'Closed internally', 'closed internally', 'Internally closed',
      'Internallly printed an closed', 'Interrnally printed and closed',
    ]) {
      expect(parseLegacyStatus(s).disposition).toBe('Close internally (documentation-only)');
    }
  });
  it('maps "Repalcement received" typo to replacement', () => {
    expect(parseLegacyStatus('Repalcement received').disposition).toBe('Take replacement from stock');
  });
  it('maps supplier repair / accept / site-replace / shuffle / handover', () => {
    expect(parseLegacyStatus('Repaired by supplier').disposition).toBe('Repaired by supplier');
    expect(parseLegacyStatus('Accepted as it is').disposition).toBe('Use as is / Accept as is');
    expect(parseLegacyStatus('Agreed to replace at site by PE & PMO').disposition).toBe(
      'Replace at site (PE & PMO agreement)',
    );
    expect(parseLegacyStatus('Shuffed from another project').disposition).toBe('Shuffle from another project');
    expect(parseLegacyStatus('Defective material handover to substore - 20/5/2025').disposition).toBe(
      'Return to supplier',
    );
  });
  it('flags unmapped statuses for triage, preserving raw text', () => {
    const r = parseLegacyStatus('Verified and found OK, except K01 panel');
    expect(r.unmapped).toBe(true);
    expect(r.disposition).toBeNull();
    expect(r.state).toBe('UNDER_REVIEW');
    expect(r.note).toBe('Verified and found OK, except K01 panel');
  });
  it('treats blank as no-op (not triage)', () => {
    expect(parseLegacyStatus('').unmapped).toBe(false);
    expect(parseLegacyStatus(null).unmapped).toBe(false);
  });
});

describe('responsible parsing', () => {
  it('splits "Sachin - Testing"', () => {
    expect(parseResponsible('Sachin - Testing')).toEqual({ person: 'Sachin', department: 'Testing' });
  });
  it('normalizes department case + substore', () => {
    expect(parseResponsible('Arbaz - production').department).toBe('Production');
    expect(parseResponsible('Khokan - Substore').department).toBe('Store');
  });
  it('handles department-only and glued forms', () => {
    expect(parseResponsible('QC')).toEqual({ person: null, department: 'QC' });
    expect(parseResponsible('Shibili QC')).toEqual({ person: 'Shibili', department: 'QC' });
    expect(parseResponsible('Siraj -QC')).toEqual({ person: 'Siraj', department: 'QC' });
  });
});

describe('serials + misc', () => {
  it('splits multi-serial cells', () => {
    expect(splitSerials('A1, A2 & A3')).toEqual(['A1', 'A2', 'A3']);
    expect(splitSerials(null)).toEqual([]);
  });
  it('isClosedFlag is case/space tolerant', () => {
    expect(isClosedFlag('Closed')).toBe(true);
    expect(isClosedFlag('closed ')).toBe(true);
    expect(isClosedFlag('Open')).toBe(false);
    expect(isClosedFlag(null)).toBe(false);
  });
  it('extractTrailingDate splits text and date', () => {
    const { rest, date } = extractTrailingDate('Waiting for testing confirmation 12/7/2025');
    expect(rest).toBe('Waiting for testing confirmation');
    expect(date?.toISOString().slice(0, 10)).toBe('2025-07-12');
  });
});
