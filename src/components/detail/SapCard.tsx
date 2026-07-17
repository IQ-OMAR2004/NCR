'use client';

// SAP / closure checklist. Fields stay locked server-side until the NCR is
// CLOSED (Gate 2 approved) — this card mirrors that rule visually.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNcrAction } from '@/app/actions/ncr-actions';
import { fmtDate } from '@/lib/format';

export function SapCard({
  ncrId,
  status,
  closingDate,
  sapClosed,
  sapClosingDate,
  canEdit,
}: {
  ncrId: number;
  status: string;
  closingDate: string | null;
  sapClosed: boolean;
  sapClosingDate: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData): void {
    // checkbox: absent when unchecked
    if (!fd.has('sapClosed')) fd.set('sapClosed', 'false');
    else fd.set('sapClosed', 'true');
    startTransition(async () => {
      const res = await updateNcrAction(ncrId, fd);
      if (res.ok) { setError(null); router.refresh(); }
      else setError(res.error ?? 'Failed');
    });
  }

  return (
    <section className="card p-5">
      <p className="micro-label mb-3">SAP / Closure</p>
      {status !== 'CLOSED' ? (
        <p className="text-[13px]" style={{ color: 'var(--slate)' }}>
          Closing date and SAP fields unlock after closure approval (Gate 2).
          No SAP QM integration yet — this is a manual sync checklist by design.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <span className="field-label">Closing date</span>
            <span className="mono text-[13px]">{fmtDate(closingDate)}</span>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>stamped by Gate 2 approval</p>
          </div>
          {canEdit ? (
            <form action={submit} className="flex items-end gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-[13.5px] pb-2">
                <input type="checkbox" name="sapClosed" defaultChecked={sapClosed} />
                Closed in SAP
              </label>
              <div>
                <label className="field-label" htmlFor="s-sapDate">SAP closing date</label>
                <input id="s-sapDate" name="sapClosingDate" type="date" className="input"
                  defaultValue={sapClosingDate ? sapClosingDate.slice(0, 10) : ''} />
              </div>
              <button type="submit" disabled={pending} className="btn btn-outline">
                {pending ? 'Saving…' : 'Update SAP status'}
              </button>
              {error && <span className="text-[12.5px] pb-2" style={{ color: 'var(--danger)' }}>{error}</span>}
            </form>
          ) : (
            <div>
              <span className="field-label">SAP</span>
              <span className="mono text-[13px]">{sapClosed ? `Closed · ${fmtDate(sapClosingDate)}` : 'Open'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
