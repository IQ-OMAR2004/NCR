import { describe, expect, it } from 'vitest';
import { ncrCreateSchema, ncrUpdateSchema } from '../src/lib/validate';

const base = {
  date: '2026-01-15',
  ncrNo: '200600001',
  defectDetails: 'cracked terminal',
  defectType: 'Damaged',
  cause: 'Mishandling',
};

describe('ncrCreateSchema', () => {
  it('treats blank quantities as null, not 0', () => {
    const r = ncrCreateSchema.parse({ ...base, totalQty: '', defectQty: '' });
    expect(r.totalQty).toBeNull();
    expect(r.defectQty).toBeNull();
  });
  it('parses real quantities and enforces defect <= total', () => {
    expect(ncrCreateSchema.parse({ ...base, totalQty: '5', defectQty: '2' }).defectQty).toBe(2);
    expect(() => ncrCreateSchema.parse({ ...base, totalQty: '1', defectQty: '5' })).toThrow(/exceed/);
  });
  it('rejects a non-numeric NCR No.', () => {
    expect(() => ncrCreateSchema.parse({ ...base, ncrNo: 'abc' })).toThrow();
  });
});

describe('ncrUpdateSchema carries the SAP checklist fields', () => {
  it('parses sapClosed + sapClosingDate (the only fields SapCard submits)', () => {
    const r = ncrUpdateSchema.parse({ sapClosed: 'true', sapClosingDate: '2026-03-01' });
    expect(r.sapClosed).toBe(true);
    expect(r.sapClosingDate?.toISOString().slice(0, 10)).toBe('2026-03-01');
  });
  it('coerces an unchecked box and blank date correctly', () => {
    const r = ncrUpdateSchema.parse({ sapClosed: 'false', sapClosingDate: '' });
    expect(r.sapClosed).toBe(false);
    expect(r.sapClosingDate).toBeNull();
  });
  it('is fully partial — an empty patch is valid (serials defaults to [])', () => {
    const r = ncrUpdateSchema.parse({});
    expect(r.sapClosed).toBeUndefined();
    expect(r.date).toBeUndefined();
    expect(r.serials).toEqual([]); // updateNcrAction destructures serials out of the patch
  });
});
