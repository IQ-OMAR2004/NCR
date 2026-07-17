'use client';

// The 27-field record: read view + role/state-gated edit form.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateNcrAction } from '@/app/actions/ncr-actions';
import { fmtDate, fmtQty } from '@/lib/format';
import { SerialChips } from '@/components/ncr-form/SerialChips';
import type { RecordDto, VocabSets } from './types';

export function RecordCard({
  record,
  editable,
  vocab,
}: {
  record: RecordDto;
  editable: boolean;
  vocab: VocabSets | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="micro-label">Record</p>
        {editable && vocab && (
          <button type="button" className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      {editing && vocab ? (
        <EditForm record={record} vocab={vocab} onDone={() => setEditing(false)} />
      ) : (
        <ReadView record={record} />
      )}
    </section>
  );
}

function Field({ label, value, mono, span }: { label: string; value: React.ReactNode; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? 'col-span-full' : undefined}>
      <dt className="field-label">{label}</dt>
      <dd className={`text-[13.5px] ${mono ? 'mono text-[12.5px]' : ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

function ReadView({ record: r }: { record: RecordDto }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4">
      <Field label="SL No." value={`${r.slNo} / ${r.year}`} mono />
      <Field label="Date" value={fmtDate(r.date)} mono />
      <Field label="NCR No." value={r.ncrNo} mono />
      <Field label="SO#" value={r.so} mono />
      <Field label="FG#" value={r.fg} mono />
      <Field label="Pr.O#" value={r.prO} mono />
      <Field label="Project" value={r.projectName} />
      <Field label="Panel Ref." value={r.panelRef} mono />
      <Field label="Panel Type" value={r.panelType} />
      <Field label="Item Code" value={r.itemCode} mono />
      <Field label="Item Name" value={r.itemName} />
      <Field label="Make" value={r.make} />
      <Field label="Item Description" value={r.itemDescription} span />
      <Field label="Total Qty" value={fmtQty(r.totalQty)} mono />
      <Field label="Defect Qty" value={fmtQty(r.defectQty)} mono />
      <Field label="Defect Type" value={r.defectType} />
      <Field label="Cause" value={r.cause} />
      <Field
        label="Serial No."
        span
        value={
          r.serials.length === 0 ? '—' : (
            <span className="flex flex-wrap gap-1.5">
              {r.serials.map((s) => (
                <span key={s} className="mono text-[11.5px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line2)' }}>
                  {s}
                </span>
              ))}
            </span>
          )
        }
      />
      <Field label="Defect Details" value={<span className="whitespace-pre-wrap">{r.defectDetails ?? '—'}</span>} span />
      <Field label="Type of NC" value={r.ncType} />
      <Field label="Responsible" value={r.responsiblePerson ? `${r.responsiblePerson}${r.responsibleDept ? ` — ${r.responsibleDept}` : ''}` : r.responsibleDept ?? '—'} />
      <Field label="Remarks" value={r.remarks} span />
    </dl>
  );
}

function EditForm({ record: r, vocab, onDone }: { record: RecordDto; vocab: VocabSets; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serials, setSerials] = useState<string[]>(r.serials);

  function submit(fd: FormData): void {
    for (const s of serials) fd.append('serials', s);
    if (serials.length === 0) fd.append('serials', ''); // signal presence for empty list
    startTransition(async () => {
      const res = await updateNcrAction(r.id, fd);
      if (res.ok) {
        onDone();
        router.refresh();
      } else {
        setError(res.error ?? 'Failed');
      }
    });
  }

  const text = (name: keyof RecordDto, label: string, mono = false) => (
    <div>
      <label className="field-label" htmlFor={`e-${name}`}>{label}</label>
      <input id={`e-${name}`} name={name} defaultValue={(r[name] as string | number | null) ?? ''}
        className={`input ${mono ? 'mono' : ''}`} />
    </div>
  );
  const select = (name: keyof RecordDto, label: string, options: string[]) => (
    <div>
      <label className="field-label" htmlFor={`e-${name}`}>{label}</label>
      <select id={`e-${name}`} name={name} defaultValue={(r[name] as string | null) ?? ''} className="input">
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form action={submit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <label className="field-label" htmlFor="e-date">Date</label>
        <input id="e-date" name="date" type="date" defaultValue={r.date.slice(0, 10)} className="input" />
      </div>
      {text('ncrNo', 'NCR No.', true)}
      {text('so', 'SO#', true)}
      {text('fg', 'FG#', true)}
      {text('prO', 'Pr.O#', true)}
      {text('projectName', 'Project')}
      {text('panelRef', 'Panel Ref.', true)}
      {select('panelType', 'Panel Type', vocab.panelTypes)}
      {text('itemCode', 'Item Code', true)}
      {text('itemName', 'Item Name')}
      {select('make', 'Make', vocab.makes)}
      <div className="col-span-2 md:col-span-4">
        <label className="field-label" htmlFor="e-itemDescription">Item Description</label>
        <input id="e-itemDescription" name="itemDescription" defaultValue={r.itemDescription ?? ''} className="input" />
      </div>
      <div>
        <label className="field-label" htmlFor="e-totalQty">Total Qty</label>
        <input id="e-totalQty" name="totalQty" type="number" min="0" step="any" defaultValue={r.totalQty ?? ''} className="input mono" />
      </div>
      <div>
        <label className="field-label" htmlFor="e-defectQty">Defect Qty</label>
        <input id="e-defectQty" name="defectQty" type="number" min="0" step="any" defaultValue={r.defectQty ?? ''} className="input mono" />
      </div>
      {select('defectType', 'Defect Type', vocab.defectTypes)}
      {select('cause', 'Cause', vocab.causes)}
      <div className="col-span-2 md:col-span-4">
        <SerialChips serials={serials} onChange={setSerials} />
      </div>
      <div className="col-span-2 md:col-span-4">
        <label className="field-label" htmlFor="e-defectDetails">Defect Details</label>
        <textarea id="e-defectDetails" name="defectDetails" rows={3} defaultValue={r.defectDetails ?? ''} className="input" />
      </div>
      {select('ncType', 'Type of NC', vocab.ncTypes)}
      {text('responsiblePerson', 'Responsible Person')}
      {select('responsibleDept', 'Responsible Dept', vocab.departments)}
      {text('remarks', 'Remarks')}
      <div className="col-span-full flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onDone}>Cancel</button>
        {error && <span className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</span>}
        <span className="micro-label ml-auto">Every change is audited</span>
      </div>
    </form>
  );
}
