'use client';

// New NCR form. Client-side validation is a convenience; the server actions
// re-validate everything (zod) and the workflow service enforces the rules.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createAndSubmitNcrAction, createNcrAction } from '@/app/actions/ncr-actions';
import { addOpenVocabAction } from '@/app/actions/admin-actions';
import { CAUSE_DEFAULT_DEPT } from '@/lib/domain';
import { SerialChips } from './SerialChips';

interface Props {
  panelTypes: string[];
  defectTypes: string[];
  ncTypes: string[];
  causes: string[];
  makes: string[];
  departments: string[];
  people: string[];
  projects: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NcrForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [totalQty, setTotalQty] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [dept, setDept] = useState('');
  const [deptSuggested, setDeptSuggested] = useState(false);
  const [newMake, setNewMake] = useState(false);
  const [serials, setSerials] = useState<string[]>([]);

  function checkQty(t: string, d: string): void {
    const tn = Number(t);
    const dn = Number(d);
    setQtyError(
      t !== '' && d !== '' && Number.isFinite(tn) && Number.isFinite(dn) && dn > tn
        ? 'Defect quantity cannot exceed total quantity'
        : null,
    );
  }

  function onCauseChange(cause: string): void {
    if (dept === '' || deptSuggested) {
      const suggestion = CAUSE_DEFAULT_DEPT[cause];
      if (suggestion) {
        setDept(suggestion);
        setDeptSuggested(true);
      }
    }
  }

  function submit(fd: FormData, alsoSubmit: boolean): void {
    setError(null);
    if (qtyError) {
      setError(qtyError);
      return;
    }
    for (const s of serials) fd.append('serials', s);
    startTransition(async () => {
      // Persist a newly typed Make into the open vocabulary first.
      const makeVal = String(fd.get('make') ?? '').trim();
      if (newMake && makeVal !== '') await addOpenVocabAction('MAKE', makeVal);
      const res = alsoSubmit ? await createAndSubmitNcrAction(fd) : await createNcrAction(fd);
      if (res.ok && res.id != null) {
        router.push(`/ncrs/${res.id}`);
      } else {
        setError(res.error ?? 'Failed to save');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  return (
    <form
      className="space-y-5 max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        submit(fd, submitter?.value === 'submit');
      }}
    >
      {error && (
        <div role="alert" className="card p-4" style={{ borderColor: 'var(--danger)' }}>
          <p className="text-[13.5px]" style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {/* Identification */}
      <section className="card p-5">
        <p className="micro-label mb-4">Identification</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="field-label" htmlFor="n-date">Date *</label>
            <input id="n-date" name="date" type="date" required defaultValue={today()} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-ncrNo">NCR No. (SAP) *</label>
            <input id="n-ncrNo" name="ncrNo" required inputMode="numeric" pattern="[0-9]+"
              title="Numeric SAP notification number" className="input mono" placeholder="200573124" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-so">SO#</label>
            <input id="n-so" name="so" className="input mono" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-fg">FG#</label>
            <input id="n-fg" name="fg" className="input mono" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-prO">Pr.O#</label>
            <input id="n-prO" name="prO" className="input mono" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-project">Project name</label>
            <input id="n-project" name="projectName" list="projects" className="input" />
            <datalist id="projects">
              {props.projects.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="n-panelRef">Panel ref.</label>
            <input id="n-panelRef" name="panelRef" className="input mono" placeholder="AH337" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-panelType">Panel type</label>
            <select id="n-panelType" name="panelType" className="input" defaultValue="">
              <option value="">—</option>
              {props.panelTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Item */}
      <section className="card p-5">
        <p className="micro-label mb-4">Item</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="field-label" htmlFor="n-itemCode">Item code</label>
            <input id="n-itemCode" name="itemCode" className="input mono" />
          </div>
          <div className="col-span-2">
            <label className="field-label" htmlFor="n-itemName">Item name</label>
            <input id="n-itemName" name="itemName" className="input" placeholder="Current transformer" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-make">Make (supplier)</label>
            {newMake ? (
              <div className="flex gap-1">
                <input id="n-make" name="make" className="input" placeholder="New supplier…" autoFocus />
                <button type="button" className="btn btn-outline" style={{ padding: '4px 10px' }}
                  onClick={() => setNewMake(false)}>×</button>
              </div>
            ) : (
              <div className="flex gap-1">
                <select id="n-make" name="make" className="input" defaultValue="">
                  <option value="">—</option>
                  {props.makes.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button type="button" className="btn btn-outline" style={{ padding: '4px 10px' }}
                  title="Add a new supplier" onClick={() => setNewMake(true)}>+</button>
              </div>
            )}
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className="field-label" htmlFor="n-itemDescription">Item description</label>
            <input id="n-itemDescription" name="itemDescription" className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-totalQty">Total quantity</label>
            <input id="n-totalQty" name="totalQty" type="number" min="0" step="any" className="input mono"
              value={totalQty} aria-invalid={qtyError ? true : undefined}
              onChange={(e) => { setTotalQty(e.target.value); checkQty(e.target.value, defectQty); }} />
          </div>
          <div>
            <label className="field-label" htmlFor="n-defectQty">Defect quantity</label>
            <input id="n-defectQty" name="defectQty" type="number" min="0" step="any" className="input mono"
              value={defectQty} aria-invalid={qtyError ? true : undefined}
              onChange={(e) => { setDefectQty(e.target.value); checkQty(totalQty, e.target.value); }} />
            {qtyError && <p className="text-[12px] mt-1" style={{ color: 'var(--danger)' }}>{qtyError}</p>}
          </div>
          <div className="col-span-2">
            <SerialChips serials={serials} onChange={setSerials} />
          </div>
        </div>
      </section>

      {/* Defect */}
      <section className="card p-5">
        <p className="micro-label mb-4">Defect</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <label className="field-label" htmlFor="n-defectDetails">Defect details *</label>
            <textarea id="n-defectDetails" name="defectDetails" required rows={3} className="input"
              placeholder="Describe the non-conformance…" />
          </div>
          <div>
            <label className="field-label" htmlFor="n-defectType">Defect type *</label>
            <select id="n-defectType" name="defectType" required className="input" defaultValue="">
              <option value="" disabled>Select…</option>
              {props.defectTypes.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="n-ncType">Type of nonconformance</label>
            <select id="n-ncType" name="ncType" className="input" defaultValue={props.ncTypes[0] ?? ''}>
              {props.ncTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="n-cause">Cause of nonconformance *</label>
            <select id="n-cause" name="cause" required className="input" defaultValue=""
              onChange={(e) => onCauseChange(e.target.value)}>
              <option value="" disabled>Select…</option>
              {props.causes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Assignment */}
      <section className="card p-5">
        <p className="micro-label mb-4">Assignment</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="field-label" htmlFor="n-person">Responsible person</label>
            <input id="n-person" name="responsiblePerson" list="people" className="input" />
            <datalist id="people">
              {props.people.map((p) => <option key={p} value={p.split(' — ')[0]}>{p}</option>)}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="n-dept">
              Responsible department{deptSuggested && <span className="ml-1" style={{ color: 'var(--accent)' }}>· suggested</span>}
            </label>
            <select id="n-dept" name="responsibleDept" className="input" value={dept}
              onChange={(e) => { setDept(e.target.value); setDeptSuggested(false); }}>
              <option value="">—</option>
              {props.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="n-remarks">Remarks</label>
            <input id="n-remarks" name="remarks" className="input" />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button type="submit" name="mode" value="draft" disabled={pending} className="btn btn-outline">
          {pending ? 'Saving…' : 'Save as draft'}
        </button>
        <button type="submit" name="mode" value="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Create & submit'}
        </button>
        <p className="text-[12.5px] self-center" style={{ color: 'var(--slate)' }}>
          Disposition is proposed later, during QC review.
        </p>
      </div>
    </form>
  );
}
