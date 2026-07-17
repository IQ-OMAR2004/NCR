'use client';

// Small client islands for the Notifications page: buttons need a pending
// state while the server action runs. Mutations go through the existing
// server actions only.
import { useTransition } from 'react';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/actions/ncr-actions';

export function MarkReadButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-outline shrink-0"
      style={{ padding: '4px 12px', fontSize: 12 }}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationReadAction(id);
        })
      }
    >
      {pending ? 'Marking…' : 'Mark read'}
    </button>
  );
}

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-outline"
      disabled={pending || disabled}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsReadAction();
        })
      }
    >
      {pending ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
