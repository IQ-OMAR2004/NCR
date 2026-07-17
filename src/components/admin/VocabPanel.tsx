'use client';

// Controlled-vocabulary editor for one category: list (inactive dimmed),
// enable/disable toggles, add form. Admin actions re-check the role server-side.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addVocabAction, setVocabActiveAction } from '@/app/actions/admin-actions';

export interface VocabDto {
  id: number;
  value: string;
  active: boolean;
}

export function VocabPanel({
  category,
  categoryLabel,
  items,
}: {
  category: string;
  categoryLabel: string;
  items: VocabDto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number, active: boolean) {
    startTransition(async () => {
      const res = await setVocabActiveAction(id, active);
      if (!res.ok) setError(res.error ?? 'Failed');
      else { setError(null); router.refresh(); }
    });
  }

  function add(fd: FormData) {
    startTransition(async () => {
      const res = await addVocabAction(fd);
      if (!res.ok) setError(res.error ?? 'Failed');
      else { setError(null); router.refresh(); }
    });
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line2)' }}>
          <span className="micro-label">{categoryLabel} · {items.filter((i) => i.active).length} active</span>
          {category === 'DISPOSITION' && (
            <span className="micro-label">Red tag: Scrap, Return to supplier</span>
          )}
        </div>
        <ul>
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between px-4 py-2.5 border-b last:border-b-0"
              style={{ borderColor: 'var(--line)', opacity: i.active ? 1 : 0.45 }}
            >
              <span className="text-[13.5px]">{i.value}</span>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '3px 12px', fontSize: 12 }}
                disabled={pending}
                onClick={() => toggle(i.id, !i.active)}
              >
                {i.active ? 'Disable' : 'Enable'}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--slate)' }}>
              No values yet.
            </li>
          )}
        </ul>
      </div>

      <form action={add} className="card p-4 flex items-end gap-3">
        <input type="hidden" name="category" value={category} />
        <div className="flex-1">
          <label className="field-label" htmlFor="vocab-value">Add {categoryLabel} value</label>
          <input id="vocab-value" name="value" required className="input" placeholder="New value…" />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Adding…' : 'Add'}
        </button>
      </form>
      {error && <p className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
