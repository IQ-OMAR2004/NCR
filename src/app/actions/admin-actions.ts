'use server';

// Admin-only mutations: users + controlled vocabularies. Audited.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { AuthError, hashPassword, requireUser } from '@/lib/auth';
import { ROLES } from '@/lib/domain';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function fail(err: unknown): ActionResult {
  if (err instanceof AuthError) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => i.message).join('; ') };
  console.error(err);
  return { ok: false, error: 'Unexpected error' };
}

const userSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  name: z.string().trim().min(1),
  role: z.enum(ROLES),
  department: z.string().trim().transform((s) => (s === '' ? null : s)).nullable().optional(),
  password: z.string().min(6).optional(),
});

export async function upsertUserAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireUser('ADMIN');
    const id = (formData.get('id') as string | null) || null;
    const raw = Object.fromEntries(formData.entries());
    if (raw.password === '') delete raw.password;
    const parsed = userSchema.parse(raw);

    if (id) {
      const data: Record<string, unknown> = {
        email: parsed.email, name: parsed.name, role: parsed.role, department: parsed.department ?? null,
      };
      if (parsed.password) data.passwordHash = hashPassword(parsed.password);
      await prisma.user.update({ where: { id }, data });
      await prisma.auditLog.create({
        data: { actorId: admin.id, action: 'USER_ADMIN', field: parsed.email, after: `updated (${parsed.role})` },
      });
    } else {
      if (!parsed.password) return { ok: false, error: 'Password required for a new user' };
      await prisma.user.create({
        data: {
          email: parsed.email, name: parsed.name, role: parsed.role,
          department: parsed.department ?? null, passwordHash: hashPassword(parsed.password),
        },
      });
      await prisma.auditLog.create({
        data: { actorId: admin.id, action: 'USER_ADMIN', field: parsed.email, after: `created (${parsed.role})` },
      });
    }
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  try {
    const admin = await requireUser('ADMIN');
    if (admin.id === userId && !active) return { ok: false, error: 'You cannot deactivate yourself' };
    const u = await prisma.user.update({ where: { id: userId }, data: { active } });
    await prisma.auditLog.create({
      data: { actorId: admin.id, action: 'USER_ADMIN', field: u.email, after: active ? 'activated' : 'deactivated' },
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const vocabSchema = z.object({
  category: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export async function addVocabAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireUser('ADMIN');
    const { category, value } = vocabSchema.parse(Object.fromEntries(formData.entries()));
    const max = await prisma.vocabItem.aggregate({ where: { category }, _max: { sortOrder: true } });
    await prisma.vocabItem.upsert({
      where: { category_value: { category, value } },
      update: { active: true },
      create: { category, value, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    await prisma.auditLog.create({
      data: { actorId: admin.id, action: 'VOCAB', field: category, after: `+ ${value}` },
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setVocabActiveAction(id: number, active: boolean): Promise<ActionResult> {
  try {
    const admin = await requireUser('ADMIN');
    const item = await prisma.vocabItem.update({ where: { id }, data: { active } });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id, action: 'VOCAB', field: item.category,
        after: `${active ? 'enabled' : 'disabled'} ${item.value}`,
      },
    });
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Non-admins can add new Make/Project values from the NCR form ("add new").
 *  Restricted at runtime to these two open categories — the TypeScript union is
 *  not enforced across the server-action boundary. */
const OPEN_VOCAB_CATEGORIES = new Set(['MAKE', 'PROJECT']);
export async function addOpenVocabAction(category: 'MAKE' | 'PROJECT', value: string): Promise<ActionResult> {
  try {
    await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    if (!OPEN_VOCAB_CATEGORIES.has(category)) {
      return { ok: false, error: 'Only Make and Project can be added here' };
    }
    const v = value.replace(/\s+/g, ' ').trim();
    if (v === '') return { ok: false, error: 'Empty value' };
    const max = await prisma.vocabItem.aggregate({ where: { category }, _max: { sortOrder: true } });
    await prisma.vocabItem.upsert({
      where: { category_value: { category, value: v } },
      update: {},
      create: { category, value: v, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
