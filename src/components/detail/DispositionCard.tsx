'use client';

// Disposition proposal card — how the QC engineer sets/changes the disposition
// before sending the NCR to Gate 1.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNcrAction } from '@/app/actions/ncr-actions';

export function DispositionCard({
  ncrId,
  disposition,
  note,
  canPropose,
  dispositions,
}: {
  ncrId: number;
  disposition: string | null;
  note: string | null;
  canPropose: boolean;
  dispositions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData): void {
    startTransition(async () => {
      const res = await updateNcrAction(ncrId, fd);
      if (res.ok) {
        setEditing(false);
        setError(null);
        router.refresh();
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="micro-label">Disposition</p>
        {canPropose && (
          <button type="button" className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : disposition ? 'Change' : 'Set disposition'}
          </button>
        )}
      </div>

      {editing ? (
        <form action={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="d-disposition">Disposition</label>
            <select id="d-disposition" name="disposition" required defaultValue={disposition ?? ''} className="input">
              <option value="" disabled>Select…</option>
              {dispositions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="d-note">Note</label>
            <input id="d-note" name="dispositionNote" defaultValue={note ?? ''} className="input"
              placeholder="Context for the approver…" />
          </div>
          <div className="col-span-full flex items-center gap-3">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? 'Saving…' : 'Save disposition'}
            </button>
            {error && <span className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</span>}
          </div>
        </form>
      ) : (
        <div>
          <p className="text-[15px] font-semibold">{disposition ?? '— not set —'}</p>
          {note && <p className="text-[13px] mt-1" style={{ color: 'var(--ink2)' }}>{note}</p>}
          {!disposition && (
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--slate)' }}>
              A disposition must be proposed during review, then approved by the QC Manager (Gate 1).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
