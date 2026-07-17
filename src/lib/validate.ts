import { z } from 'zod';

// Shared field pieces
const optStr = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional();

// Optional numeric that treats blank/whitespace as "unknown" (null), NOT 0 —
// z.coerce.number() would turn '' into 0 and corrupt quantities.
const optNum = z
  .preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.coerce.number().nonnegative().nullable(),
  )
  .optional();

const ncrBaseSchema = z
  .object({
    date: z.coerce.date(),
    ncrNo: z.coerce.number().int('NCR No. must be numeric').positive('NCR No. must be numeric'),
    so: optStr,
    fg: optStr,
    prO: optStr,
    projectName: optStr,
    panelRef: optStr,
    panelType: optStr,
    itemCode: optStr,
    itemName: optStr,
    itemDescription: optStr,
    make: optStr,
    totalQty: optNum,
    defectQty: optNum,
    serials: z.array(z.string().trim().min(1)).default([]),
    defectDetails: z.string().trim().min(1, 'Defect details are required'),
    defectType: z.string().trim().min(1, 'Defect type is required'),
    ncType: optStr,
    cause: z.string().trim().min(1, 'Cause is required'),
    disposition: optStr,
    dispositionNote: optStr,
    responsiblePerson: optStr,
    responsibleDept: optStr,
    remarks: optStr,
  });

const qtyRule = {
  check: (v: { totalQty?: number | null; defectQty?: number | null }) =>
    v.totalQty == null || v.defectQty == null || v.defectQty <= v.totalQty,
  opts: { message: 'Defect quantity cannot exceed total quantity', path: ['defectQty'] },
};

export const ncrCreateSchema = ncrBaseSchema.refine(qtyRule.check, qtyRule.opts);
export type NcrCreateInput = z.infer<typeof ncrCreateSchema>;

// Partial patch: the cross-field qty rule is fully enforced against current DB
// values inside workflow.updateNcrFields — here we only check what's present.
// The SAP checklist fields are update-only (never part of creation) and are
// gated to CLOSED status inside the workflow service.
export const ncrUpdateSchema = ncrBaseSchema
  .extend({
    sapClosed: z.preprocess((v) => v === 'true' || v === true || v === 'on', z.boolean()).optional(),
    sapClosingDate: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.coerce.date().nullable(),
    ).optional(),
  })
  .partial()
  .refine(qtyRule.check, qtyRule.opts);
export type NcrUpdateInput = z.infer<typeof ncrUpdateSchema>;

export const transitionSchema = z.object({
  ncrId: z.coerce.number().int().positive(),
  action: z.string().min(1),
  comment: z
    .string()
    .transform((s) => s.trim())
    .optional(),
});

export const commentSchema = z.object({
  ncrId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1, 'Comment cannot be empty'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
