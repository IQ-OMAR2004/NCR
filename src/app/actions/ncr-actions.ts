'use server';

// Server actions — THE enforcement surface. Every mutation re-authenticates the
// session cookie and delegates to the workflow service (role + state checks).
// UI buttons are a convenience; these checks are the real gates.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { AuthError, getSessionUser, requireUser } from '@/lib/auth';
import {
  transition as runTransition,
  updateNcrFields,
  WorkflowError,
  type NcrFieldPatch,
} from '@/lib/workflow';
import { commentSchema, ncrCreateSchema, ncrUpdateSchema, transitionSchema } from '@/lib/validate';
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: number;
}

function fail(err: unknown): ActionResult {
  if (err instanceof WorkflowError || err instanceof AuthError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof z.ZodError) {
    return { ok: false, error: err.issues.map((i) => i.message).join('; ') };
  }
  console.error(err);
  return { ok: false, error: 'Unexpected error' };
}

/** Create a new NCR in DRAFT (Originator/Engineer/Manager/Admin). */
export async function createNcrAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    const raw = Object.fromEntries(formData.entries());
    const serials = formData.getAll('serials').map(String).filter((s) => s.trim() !== '');
    const parsed = ncrCreateSchema.parse({ ...raw, serials });

    // Dates are parsed at UTC midnight — use the UTC year so an NCR dated Jan 1
    // is filed under its own year regardless of server timezone.
    const year = parsed.date.getUTCFullYear();
    const { serials: serialArr, ...fields } = parsed;

    // Uniqueness check + slNo assignment + insert in one transaction so two
    // concurrent creates can't both pass the check or claim the same slNo.
    const ncr = await prisma.$transaction(async (tx) => {
      const clash = await tx.ncr.findFirst({
        where: { ncrNo: parsed.ncrNo, importedLegacy: false },
      });
      if (clash) throw new WorkflowError(`NCR No. ${parsed.ncrNo} already exists (NCR #${clash.id})`);
      const last = await tx.ncr.aggregate({ where: { year }, _max: { slNo: true } });
      return tx.ncr.create({
        data: {
          ...fields,
          serialsJson: JSON.stringify(serialArr),
          slNo: (last._max.slNo ?? 0) + 1,
          year,
          status: 'DRAFT',
          createdById: user.id,
        },
      });
    });
    await prisma.auditLog.create({
      data: { ncrId: ncr.id, actorId: user.id, action: 'CREATE', after: `NCR ${ncr.ncrNo} created` },
    });
    revalidatePath('/ncrs');
    return { ok: true, id: ncr.id };
  } catch (err) {
    return fail(err);
  }
}

/** Audited field update (role/state rules enforced in workflow service). */
export async function updateNcrAction(ncrId: number, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    const raw = Object.fromEntries(formData.entries());
    const hasSerials = formData.has('serials');
    const serials = formData.getAll('serials').map(String).filter((s) => s.trim() !== '');
    const parsed = ncrUpdateSchema.parse(hasSerials ? { ...raw, serials } : raw);

    const { serials: serialArr, ...fields } = parsed;
    const patch: NcrFieldPatch = {
      ...(fields as NcrFieldPatch),
      ...(hasSerials ? { serialsJson: JSON.stringify(serialArr ?? []) } : {}),
    };
    await updateNcrFields(ncrId, patch, user);
    revalidatePath(`/ncrs/${ncrId}`);
    revalidatePath('/ncrs');
    return { ok: true, id: ncrId };
  } catch (err) {
    return fail(err);
  }
}

/** Execute a workflow action (submit / review / gates / etc.). */
export async function transitionAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser(); // role checked against the specific rule inside
    const { ncrId, action, comment } = transitionSchema.parse({
      ncrId: formData.get('ncrId'),
      action: formData.get('action'),
      comment: formData.get('comment') ?? undefined,
    });
    await runTransition(ncrId, action, user, comment);
    revalidatePath(`/ncrs/${ncrId}`);
    revalidatePath('/ncrs');
    revalidatePath('/approvals');
    revalidatePath('/');
    return { ok: true, id: ncrId };
  } catch (err) {
    return fail(err);
  }
}

export async function addCommentAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    const { ncrId, body } = commentSchema.parse({
      ncrId: formData.get('ncrId'),
      body: formData.get('body'),
    });
    await prisma.comment.create({ data: { ncrId, authorId: user.id, body } });
    revalidatePath(`/ncrs/${ncrId}`);
    return { ok: true, id: ncrId };
  } catch (err) {
    return fail(err);
  }
}

const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB
// Map validated MIME → the extension we force on disk. Never trust the client's
// filename extension: files are served same-origin from /public, so a ".html"
// or ".svg" upload with a spoofed image MIME could execute script. The stored
// extension is derived solely from the allowlisted MIME.
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Attach a defect photo / document. Stored under public/uploads/<ncrId>/. */
export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    const ncrId = z.coerce.number().int().positive().parse(formData.get('ncrId'));
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'No file selected' };
    if (file.size > MAX_UPLOAD) return { ok: false, error: 'File exceeds 10 MB' };
    const ext = MIME_EXT[file.type];
    if (!ext) return { ok: false, error: 'Only JPEG/PNG/WebP images or PDF' };

    await prisma.ncr.findUniqueOrThrow({ where: { id: ncrId } });
    // Extension comes from the validated MIME, not the client filename.
    const base = file.name.replace(/\.[^.]*$/, '').replace(/[^\w\-]+/g, '_').slice(-64) || 'file';
    const rel = path.join('uploads', String(ncrId), `${Date.now()}-${base}.${ext}`);
    const abs = path.join(process.cwd(), 'public', rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, Buffer.from(await file.arrayBuffer()));

    await prisma.attachment.create({
      data: {
        ncrId,
        filename: file.name,
        storedPath: `/${rel.split(path.sep).join('/')}`,
        mime: file.type,
        size: file.size,
        uploadedById: user.id,
      },
    });
    await prisma.auditLog.create({
      data: { ncrId, actorId: user.id, action: 'FIELD_CHANGE', field: 'attachment', after: file.name },
    });
    revalidatePath(`/ncrs/${ncrId}`);
    return { ok: true, id: ncrId };
  } catch (err) {
    return fail(err);
  }
}

export async function markNotificationReadAction(id: number): Promise<void> {
  // Fire-and-forget from the client; an expired session must not crash the page
  // (no error boundary on this route), so swallow auth failures quietly.
  const user = await getSessionUser();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath('/notifications');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/notifications');
}

/** Create-and-submit helper for the New NCR form ("Submit" button). */
export async function createAndSubmitNcrAction(formData: FormData): Promise<ActionResult> {
  const res = await createNcrAction(formData);
  if (!res.ok || res.id == null) return res;
  try {
    const user = await requireUser('ORIGINATOR', 'QC_ENGINEER', 'QC_MANAGER', 'ADMIN');
    await runTransition(res.id, 'submit', user);
    revalidatePath('/ncrs');
    return { ok: true, id: res.id };
  } catch (err) {
    return fail(err);
  }
}

export async function gotoNcr(id: number): Promise<never> {
  redirect(`/ncrs/${id}`);
}
