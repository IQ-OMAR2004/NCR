'use client';

// Multi-serial chips input. Enter or comma adds; each chip is submitted via
// FormData appended by the parent (state lifted up).
import { useState } from 'react';

export function SerialChips({
  serials,
  onChange,
}: {
  serials: string[];
  onChange: (serials: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function add(): void {
    const parts = draft.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...serials];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
  }

  return (
    <div>
      <label className="field-label" htmlFor="serial-input">Serial No. — Enter or comma to add</label>
      <div className="input flex flex-wrap items-center gap-1.5" style={{ minHeight: 38 }}>
        {serials.map((s) => (
          <span key={s} className="mono text-[11.5px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: 'var(--panel)', border: '1px solid var(--line2)' }}>
            {s}
            <button type="button" aria-label={`Remove serial ${s}`} className="cursor-pointer"
              style={{ color: 'var(--slate)' }}
              onClick={() => onChange(serials.filter((x) => x !== s))}>
              ×
            </button>
          </span>
        ))}
        <input
          id="serial-input"
          className="flex-1 min-w-[120px] outline-none bg-transparent text-[13px]"
          value={draft}
          placeholder={serials.length === 0 ? 'e.g. 2023456, 2023457' : ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && draft === '' && serials.length > 0) {
              onChange(serials.slice(0, -1));
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}
