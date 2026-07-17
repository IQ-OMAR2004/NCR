// Serializable DTOs passed from the NCR detail server page to its client
// components. Plain data only (dates as ISO strings) — no Prisma types cross
// the server/client boundary.
import type { Decision, Gate } from '@/lib/domain';

export interface VocabSets {
  projects: string[];
  panelTypes: string[];
  makes: string[];
  defectTypes: string[];
  ncTypes: string[];
  causes: string[];
  departments: string[];
  dispositions: string[];
  people: string[];
}

/** The editable/displayable NCR record fields (dates as ISO strings). */
export interface RecordDto {
  id: number;
  slNo: number;
  year: number;
  date: string;
  ncrNo: number;
  so: string | null;
  fg: string | null;
  prO: string | null;
  projectName: string | null;
  panelRef: string | null;
  panelType: string | null;
  itemCode: string | null;
  itemName: string | null;
  itemDescription: string | null;
  make: string | null;
  totalQty: number | null;
  defectQty: number | null;
  serials: string[];
  defectDetails: string | null;
  defectType: string | null;
  ncType: string | null;
  cause: string | null;
  responsiblePerson: string | null;
  responsibleDept: string | null;
  remarks: string | null;
  status: string;
}

/** A workflow rule already filtered for the current user's role (serializable). */
export interface RuleDto {
  action: string;
  label: string;
  to: string;
  gate?: Gate;
  decision?: Decision;
  requiresComment?: boolean;
  requiresDisposition?: boolean;
}
