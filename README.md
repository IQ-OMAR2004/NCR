# alfanar NCR Management System

Digital Non-Conformance Report (NCR) management for alfanar's **MV Switchgear (SG) factory** —
replacing the Excel-based process in `Copy of NCR Details 2025/2026 SG FOR AI.xlsx` with an
enforced workflow, mandatory human approval gates, printable rejection tags, and
supplier-quality analytics.

Built with **Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Prisma 7 · SQLite**.
SQLite keeps local setup at zero; the Prisma schema is PostgreSQL-ready (swap the datasource,
convert the String status/role fields to native enums).

---

## Quick start

```bash
npm install
npm run setup     # migrate → seed users/vocab → import both Excel files (+ report)
npm run dev       # http://localhost:3000
```

`npm run setup` expects the two source workbooks one directory above the app
(`../Copy of NCR Details 2025 SG FOR AI.xlsx`, `…2026…`). The importer prints a full report:
rows imported, every cleaning rule applied with counts, skipped rows and why.
It is **idempotent** — re-running replaces previously imported rows and never touches
user-created NCRs.

```bash
npm test          # vitest: workflow gates, importer cleaning rules, validation
```

## Deploy (Railway)

This is a **server app** (server actions, Prisma, cookie auth, API routes) — it cannot run on
static hosts like GitHub Pages. Deploy it to any host that runs a Node server. Railway works
out of the box:

1. **New Project → Deploy from GitHub repo** → pick this repo.
2. Add a **Volume** and mount it at `/data` (SQLite needs a persistent disk).
3. Set service **Variables**:
   - `DATABASE_URL = file:/data/prod.db`
   - `SESSION_SECRET =` a long random string
     (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
     The app refuses to start in production without this.
4. Deploy. On boot, `npm run deploy:start` runs `prisma migrate deploy`, seeds the demo
   users + vocabularies, and seeds **synthetic sample NCRs** (`prisma/seed-samples.ts`).

> **The public deployment uses fabricated sample data**, not the real 2025/2026 register — a
> public URL guarded only by the shared demo password must not expose real employee/supplier
> data. To load the real data, run `npm run db:import` locally (it needs the two source
> workbooks, which are intentionally **not** committed).

`railway.json` and `.env.example` are included. The same steps work on Render/Fly (any host
with a persistent disk); on Vercel, switch the Prisma datasource to a hosted Postgres first.

## Demo logins (password: `alfanar123`)

| Email | Role | Can |
|---|---|---|
| originator@alfanar.com | ORIGINATOR | create NCRs, submit, edit own drafts |
| engineer@alfanar.com | QC_ENGINEER | review, set disposition, run actions |
| manager@alfanar.com | QC_MANAGER | **decide both approval gates** |
| admin@alfanar.com | ADMIN | everything + users/vocab/audit |
| viewer@alfanar.com | VIEWER | read-only + dashboards |

## Workflow — two mandatory human gates

```
DRAFT → SUBMITTED → UNDER_REVIEW → DISPOSITION_PROPOSED
      → PENDING_APPROVAL            ◄ GATE 1: QC Manager approves disposition
      → APPROVED → ACTION_IN_PROGRESS → ACTION_COMPLETED
      → PENDING_CLOSURE_APPROVAL    ◄ GATE 2: QC Manager approves closure
      → CLOSED
        (either gate can REJECT back — comment mandatory)
```

Enforced **server-side** in `src/lib/workflow.ts` (not just hidden buttons):

- Nothing is ever auto-approved or auto-closed. Each gate decision is an **immutable
  `Approval` row**: approver id, timestamp, decision, comment.
- Only `QC_MANAGER` (or `ADMIN`) can decide gates.
- `closingDate`, `sapClosed`, `sapClosingDate` are rejected by the update service until the NCR
  is CLOSED (i.e. after Gate 2).
- Every field change and transition writes an `AuditLog` row (who/when/before/after).
- Overdue flags: open > 30 days; waiting at a gate > 3 days.
- Legacy Excel rows that were already closed import directly as `CLOSED` with
  `importedLegacy = true` (no retroactive approvals), fully auditable via `importRaw`.

## Excel column → DB field mapping

| # | Excel column | DB field (`Ncr`) | Import cleaning |
|---|---|---|---|
| 1 | SL No. | `slNo` | per-year sequence; new NCRs get max+1 |
| 2 | Date | `date` | Date cells or `D/M/YYYY` text, parsed day-first |
| 3 | NCR No. | `ncrNo` | required — rows without it are skipped & reported. Not unique in legacy data (one SAP notification ↔ many lines); uniqueness enforced for new records |
| 4 | SO# | `so` | trim |
| 5 | FG# | `fg` | trim |
| 6 | Pr.O# | `prO` | trim |
| 7 | Project Name | `projectName` | trim |
| 8 | Panel Ref. | `panelRef` | trim |
| 9 | Panel Type | `panelType` | `ALFA DT` → `ALFA-DT` |
| 10 | Item code | `itemCode` | trim |
| 11 | Item Name | `itemName` | trim |
| 12 | Item description | `itemDescription` | trim |
| 13 | Make | `make` | trim/collapse spaces, variant dedupe (e.g. trailing-dot company names), junk (`--`, `NA`) → null |
| 14 | Total Quantity | `totalQty` | numeric |
| 15 | Defect quantity | `defectQty` | numeric; legacy `defect > total` imported as-is but reported |
| 16 | Serial No. | `serialsJson` | split on `, & ; newline` → JSON array |
| 17 | Defect details | `defectDetails` | trim |
| 18 | Defect Type | `defectType` | `Manufacturing deffect` → `Manufacturing defect` |
| 19 | Type Of Nonconformance | `ncType` | `Material deffect` → `Material defect` |
| 20 | Cause Of Nonconformance | `cause` | trim |
| 21 | STATUS (legacy mixed) | `disposition` + `dispositionNote` + workflow `status` | pattern-mapped (see below) |
| 22 | Closing Date | `closingDate` | date/text parsing; only kept when closed |
| 23 | Status(Internal) | drives `status` | `Closed` (any case) → `CLOSED` |
| 24 | Status in SAP | `sapClosed` | `Closed` → true |
| 25 | SAP closing date | `sapClosingDate` | date/text parsing |
| 26 | Responsible | `responsiblePerson` + `responsibleDept` | split `Name - Dept`, dept case-normalized, `Substore` → `Store`; also fills the `Person` directory |
| 27 | Remarks | `remarks` | trim |
| — | (whole row) | `importRaw` | original cells as JSON for traceability |

**Legacy STATUS mapping** (`src/lib/import/clean.ts`): "Take replacement from stock",
"Closed internally" (all typo variants), "Waiting for testing confirmation *date*"
(date extracted, note kept), "Repaired by supplier", "Accepted as it is", "Agreed to replace
at site by PE & PMO", "Shuffled from another project", "Defective material handover to
substore", etc. → one of the 10 controlled dispositions + in-flight state. Unmapped values
import with `needsTriage = true` for manual review (8 rows in the 2025 file).

## Modules

- **Dashboard** — KPI cards, supplier pareto (defect qty by Make), monthly trend 2025 vs 2026,
  aging of open NCRs, panel-type/defect-type/cause breakdowns, supplier-quality table
  (replaces the Excel "Analysis" sheets).
- **NCR Register** — search + filters (year, status, project, panel type, make, defect type,
  responsible, date range, overdue, triage), sortable columns, column visibility toggle,
  filtered Excel/CSV export.
- **New NCR** — all 27 fields, controlled vocabularies, serial chips, add-new Make/Project,
  qty validation, department auto-suggestion by cause.
- **NCR detail** — record editing (role/state-gated), disposition proposal, workflow timeline
  with immutable approval records, action buttons per state, comments, photo/PDF attachments,
  audit trail, original-Excel-row viewer.
- **Approvals** — QC Manager inbox, oldest first, decision context side-by-side, approve /
  reject-with-mandatory-comment inline.
- **Rejection/Rework tag** — print-ready A5 tag per NCR (`/tag/[id]`), red
  `REJECTION TAG - DO NOT USE` for Scrap / Return to supplier, amber `REWORK/REJECTION TAG`
  otherwise, Ref. No. `362:QCA:0817:02`, QR code of the NCR number, two copies per sheet.
- **Import/Export** — import provenance + live counts, register exports.
- **Admin** — users, controlled vocabularies, audit log viewer.
- **Notifications** — in-app queue events (email stubbed by design).

## SAP

There is no live SAP QM integration (by design, matching current practice): "Status in SAP" is
a manual checklist (`sapClosed` + `sapClosingDate`) that unlocks after closure approval. The
service layer isolates these fields so a real integration can replace the checklist later.

## Project skill

Domain knowledge (vocabularies, STATUS mapping table, brand tokens) lives in
`../.claude/skills/ncr-alfanar/` — treat it as the source of truth alongside the Excel files.

---

*THE POWER OF EXCELLENCE — alfanar MV Switchgear · Quality Control*
