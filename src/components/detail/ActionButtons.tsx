'use client';

// Workflow action buttons for the NCR detail page. The server re-validates
// role + state on every call — these buttons are a convenience, not the gate.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { transitionAction } from '@/app/actions/ncr-actions';
import type { RuleDto } from './types';

export function ActionButtons({
  ncrId,
  rules,
  hasDisposition,
}: {
  ncrId: number;
  rules: RuleDto[];
  hasDisposition: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  function run(action: string, withComment: boolean): void {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('ncrId', String(ncrId));
      fd.set('action', action);
      if (withComment && comment.trim()) fd.set('comment', comment.trim());
      const res = await transitionAction(fd);
      if (res.ok) {
        setCommentFor(null);
        setComment('');
        router.refresh();
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  function btnClass(rule: RuleDto): string {
    if (rule.decision === 'REJECTED') return 'btn btn-danger';
    if (rule.decision === 'APPROVED') return 'btn btn-success';
    return 'btn btn-primary';
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const blocked = rule.requiresDisposition && !hasDisposition;
        const needsComment = !!rule.requiresComment;
        const open = commentFor === rule.action;
        return (
          <div key={rule.action}>
            <button
              type="button"
              className={`${btnClass(rule)} w-full justify-center`}
              disabled={pending || blocked}
              title={blocked ? 'Set a disposition first (below the record)' : undefined}
              onClick={() => {
                if (needsComment || rule.gate) {
                  setCommentFor(open ? null : rule.action);
                  setComment('');
                  setError(null);
                } else {
                  run(rule.action, false);
                }
              }}
            >
              {rule.label}
            </button>
            {blocked && (
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--slate)' }}>
                Requires a disposition — set it in the Disposition card.
              </p>
            )}
            {open && (
              <div className="mt-2 space-y-2">
                <textarea
                  className="input"
                  rows={3}
                  autoFocus
                  value={comment}
                  placeholder={needsComment ? 'Comment (required for rejection)' : 'Comment (optional, recorded with the decision)'}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={pending}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${btnClass(rule)} flex-1 justify-center`}
                    disabled={pending || (needsComment && comment.trim() === '')}
                    onClick={() => run(rule.action, true)}
                  >
                    {pending ? 'Saving…' : `Confirm: ${rule.label}`}
                  </button>
                  <button type="button" className="btn btn-outline" disabled={pending}
                    onClick={() => setCommentFor(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>
      )}
    </div>
  );
}
