'use client';

// Comment + attachment forms for the detail page.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addCommentAction, uploadAttachmentAction } from '@/app/actions/ncr-actions';

export function CommentForm({ ncrId }: { ncrId: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData): void {
    startTransition(async () => {
      const res = await addCommentAction(fd);
      if (res.ok) {
        formRef.current?.reset();
        setError(null);
        router.refresh();
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex gap-2 items-start">
      <input type="hidden" name="ncrId" value={ncrId} />
      <textarea name="body" required rows={2} className="input flex-1" placeholder="Add a comment…" />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? '…' : 'Comment'}
      </button>
      {error && <p className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  );
}

export function AttachmentForm({ ncrId }: { ncrId: number }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData): void {
    startTransition(async () => {
      const res = await uploadAttachmentAction(fd);
      if (res.ok) {
        formRef.current?.reset();
        setError(null);
        router.refresh();
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ncrId" value={ncrId} />
      <input type="file" name="file" required accept="image/jpeg,image/png,image/webp,application/pdf"
        className="text-[13px]" aria-label="Defect photo or PDF" />
      <button type="submit" disabled={pending} className="btn btn-outline">
        {pending ? 'Uploading…' : 'Upload'}
      </button>
      <span className="micro-label">JPEG/PNG/WebP/PDF · max 10 MB</span>
      {error && <p className="text-[12.5px] w-full" style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  );
}
