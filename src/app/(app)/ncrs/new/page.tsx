// §03 New NCR — all 27 fields, controlled vocabularies, validation.
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { people, registerFacets, vocab } from '@/lib/queries';
import { SectionHead } from '@/components/Shell';
import { NcrForm } from '@/components/ncr-form/NcrForm';

export const dynamic = 'force-dynamic';

export default async function NewNcrPage() {
  const user = await getSessionUser();
  if (!user || user.role === 'VIEWER') {
    return (
      <>
        <SectionHead no="03" title="New NCR" />
        <div className="card p-8 max-w-md">
          <h2 className="text-[16px] font-semibold">Read-only role</h2>
          <p className="text-[13.5px] mt-2" style={{ color: 'var(--ink2)' }}>
            Viewers cannot create NCRs. Sign in as an originator, QC engineer or QC manager.
          </p>
        </div>
      </>
    );
  }

  const year = new Date().getFullYear();
  const [panelTypes, defectTypes, ncTypes, causes, makes, departments, persons, facets, last] =
    await Promise.all([
      vocab('PANEL_TYPE'),
      vocab('DEFECT_TYPE'),
      vocab('NC_TYPE'),
      vocab('CAUSE'),
      vocab('MAKE'),
      vocab('DEPARTMENT'),
      people(),
      registerFacets(),
      prisma.ncr.aggregate({ where: { year }, _max: { slNo: true } }),
    ]);

  return (
    <>
      <SectionHead
        no="03"
        title="New NCR"
        sub={`Record a non-conformance finding · next SL No. ${(last._max.slNo ?? 0) + 1} / ${year}`}
      />
      <NcrForm
        panelTypes={panelTypes}
        defectTypes={defectTypes}
        ncTypes={ncTypes}
        causes={causes}
        makes={makes.length ? makes : facets.makes}
        departments={departments}
        people={persons.map((p) => (p.department ? `${p.name} — ${p.department}` : p.name))}
        projects={facets.projects}
      />
    </>
  );
}
