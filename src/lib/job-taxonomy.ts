import type { JobType } from "@/lib/jobs";

/**
 * Sector, activity and place of work: one platform, three sectors, eight
 * activities (the founder's list, docs/product/EXPANSION_UX_ROADMAP.md).
 *
 * A job says what it is in three fields, each stated by the organization and
 * never inferred:
 *   sector   – who the work is for;
 *   activity – what the work is;
 *   workMode – where it happens.
 * `type` (PETITION / CANVASS) stays as how the work is counted.
 *
 * Only what `live` marks can be stored: the database refuses the rest
 * (prisma/p3-sectors.sql, the "Job_activity_live" check). A unit test holds
 * that check's text to this table, and an acceptance script tries every
 * combination against a real database and compares with checkTaxonomy. An activity turns live in
 * the slice that builds it end to end (posting, hiring, scheduling, field
 * work, verification, pay, jurisdiction rules), never before.
 */
export type Sector = "POLITICAL" | "NONPROFIT" | "PRIVATE";
export type WorkActivity = "PETITION_CIRCULATION" | "DOOR_CANVASSING" | "PHONE_BANKING" | "PHONE_POLLING" | "DOOR_POLLING" | "DOOR_FUNDRAISING" | "DOOR_SALES" | "PHONE_SALES";
export type WorkMode = "FIELD" | "REMOTE" | "ONSITE";

export const SECTORS: readonly { id: Sector; label: string; blurb: string }[] = [
  { id: "POLITICAL", label: "Political", blurb: "Campaigns, ballot measures and civic work" },
  { id: "NONPROFIT", label: "Nonprofit", blurb: "Fundraising and outreach" },
  { id: "PRIVATE", label: "Private", blurb: "Sales and customer outreach" },
];

export interface Activity {
  id: WorkActivity;
  label: string;
  /** The sectors it can serve once built. */
  sectors: readonly Sector[];
  /** Where it can happen once built. */
  modes: readonly WorkMode[];
  /** Storable today: the sector, the place and the counting type it goes with. Absent = planned. */
  live?: { sector: Sector; mode: WorkMode; type: JobType };
}

export const ACTIVITIES: readonly Activity[] = [
  { id: "PETITION_CIRCULATION", label: "Petition circulation", sectors: ["POLITICAL"], modes: ["FIELD"], live: { sector: "POLITICAL", mode: "FIELD", type: "PETITION" } },
  { id: "DOOR_CANVASSING", label: "Door-to-door canvassing", sectors: ["POLITICAL", "NONPROFIT"], modes: ["FIELD"], live: { sector: "POLITICAL", mode: "FIELD", type: "CANVASS" } },
  { id: "PHONE_BANKING", label: "Phone banking", sectors: ["POLITICAL", "NONPROFIT", "PRIVATE"], modes: ["REMOTE", "ONSITE"] },
  { id: "PHONE_POLLING", label: "Phone polling", sectors: ["POLITICAL", "NONPROFIT", "PRIVATE"], modes: ["REMOTE", "ONSITE"] },
  { id: "DOOR_POLLING", label: "Door-to-door polling", sectors: ["POLITICAL", "NONPROFIT", "PRIVATE"], modes: ["FIELD"] },
  { id: "DOOR_FUNDRAISING", label: "Door-to-door fundraising", sectors: ["NONPROFIT"], modes: ["FIELD"] },
  { id: "DOOR_SALES", label: "Door-to-door sales", sectors: ["PRIVATE"], modes: ["FIELD"] },
  { id: "PHONE_SALES", label: "Phone sales and cold calling", sectors: ["PRIVATE"], modes: ["REMOTE", "ONSITE"] },
];

export const WORK_MODE_LABELS: Record<WorkMode, string> = { FIELD: "In the field", REMOTE: "Remote", ONSITE: "On site" };

const BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));
export const activityInfo = (id: WorkActivity): Activity | undefined => BY_ID.get(id);
export const sectorLabel = (id: Sector): string => SECTORS.find((s) => s.id === id)?.label ?? id;

/** The activity a counting type means, for a job written without one (the database does the same). */
export const activityForType = (type: JobType): WorkActivity => (type === "PETITION" ? "PETITION_CIRCULATION" : "DOOR_CANVASSING");

/** A job's activity: the one it names, else the one its type means. */
export const activityOf = (job: { activity?: WorkActivity | null; type: JobType }): WorkActivity => job.activity ?? activityForType(job.type);

export type TaxonomyCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a job may be stored as this sector, activity and place with this
 * counting type: the same rule as the database's check, with a sentence for
 * each refusal. Nothing on screen offers a choice yet (the app writes the
 * two live combinations itself), so today this is what the tests hold the
 * database to; the job form will call it when a second sector is offered.
 */
export function checkTaxonomy(j: { sector: Sector; activity: WorkActivity; workMode: WorkMode; type: JobType }): TaxonomyCheck {
  const a = BY_ID.get(j.activity);
  if (!a) return { ok: false, reason: "Pick the kind of work." };
  if (!a.live) return { ok: false, reason: `${a.label} isn't available yet.` };
  if (j.sector !== a.live.sector) return { ok: false, reason: a.sectors.includes(j.sector) ? `${a.label} isn't available for ${sectorLabel(j.sector).toLowerCase()} work yet.` : `${a.label} isn't ${sectorLabel(j.sector).toLowerCase()} work.` };
  if (j.workMode !== a.live.mode) return { ok: false, reason: `${a.label} is done ${WORK_MODE_LABELS[a.live.mode].toLowerCase()}.` };
  if (j.type !== a.live.type) return { ok: false, reason: `${a.label} is counted as ${a.live.type === "PETITION" ? "signatures" : "doors"}.` };
  return { ok: true };
}
