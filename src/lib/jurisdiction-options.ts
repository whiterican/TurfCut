import { db } from "@/lib/db";
import { jurisdictionLabel, jurisdictionProblems } from "@/lib/jobs";
import type { JurisdictionOption } from "@/components/JobForm";

/**
 * Every rule profile, with why it can't publish (if it can't). Drafts may
 * use any of them; the publish step is where the hard stop applies.
 */
export async function jurisdictionOptions(now = new Date()): Promise<JurisdictionOption[]> {
  const rows = await db().jurisdictionProfile.findMany({ orderBy: [{ state: "asc" }, { locality: "asc" }, { version: "desc" }] });
  return rows.map((j) => ({ id: j.id, label: jurisdictionLabel(j), problems: jurisdictionProblems(j, now) }));
}
