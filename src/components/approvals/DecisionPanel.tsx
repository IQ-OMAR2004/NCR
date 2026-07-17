'use client';

// Inline gate-decision panel for the approvals inbox. All mutations go through
// transitionAction (the server re-checks role + state); this component only
// collects the decision and an optional/mandatory comment.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { transitionAction } from '@/app/actions/ncr-actions';

export type GateActionName =
  | 'approve_disposition'
  | 'reject_disposition'
  | 'approve_closure'
  | 'reject_closure';

type Mode = 'idle' | 'approve' | 'reject';

export function DecisionPanel({
  ncrId,
  approveAction,
  rejectAction,
  rejectHint,
}: {
  ncrId: number;
  approveAction: GateActionName;
  rejectAction: GateActionName;
  /** Where a rejection sends the NCR back to (shown under the textarea). */
  rejectHint: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setMode('idle');
    setComment('');
    setError(null);
  }

  function decide(action: GateActionName) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('ncrId', String(ncrId));
      fd.set('action', action);
      if (comment.trim() !== '') fd.set('comment', comment.trim());
      const res = await transitionAction(fd);
      if (res.ok) {
        reset();
        router.refresh();
      } else {
        setError(res.error ?? 'Unexpected error');
      }
    });
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-2">
        <span className="micro-label">Your decision</span>
        <button
          type="button"
          className="btn btn-success justify-center"
          disabled={pending}
          onClick={() => setMode('approve')}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn btn-danger justify-center"
          disabled={pending}
          onClick={() => setMode('reject')}
        >
          Reject
        </button>
        {error && (
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const rejecting = mode === 'reject';
  const commentEmpty = comment.trim() === '';

  return (
    <div className="flex flex-col gap-2">
      <span className="micro-label">
        {rejecting ? 'Reject · comment required' : 'Approve · comment optional'}
      </span>
      <textarea
        className="input"
        rows={3}
        value={comment}
        autoFocus
        placeholder={rejecting ? 'Reason for rejection (required)' : 'Optional note for the record'}
        onChange={(e) => setComment(e.target.value)}
        disabled={pending}
      />
      {rejecting && (
        <p className="text-[12px] leading-snug" style={{ color: 'var(--slate)' }}>
          {rejectHint}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`btn flex-1 justify-center ${rejecting ? 'btn-danger' : 'btn-success'}`}
          disabled={pending || (rejecting && commentEmpty)}
          onClick={() => decide(rejecting ? rejectAction : approveAction)}
        >
          {pending ? 'Saving…' : rejecting ? 'Confirm rejection' : 'Confirm approval'}
        </button>
        <button type="button" className="btn btn-outline" disabled={pending} onClick={reset}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="text-[12.5px] leading-snug" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
