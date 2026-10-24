import { requireStaff } from "@/lib/staff-session";
import { db } from "@/lib/db";
import { jurisdictionLabel, UUID_RE } from "@/lib/jobs";
import { readRules } from "@/lib/jurisdiction-rules";
import { JurisdictionVersionForm } from "@/components/admin/JurisdictionVersionForm";

/** Propose a version (M10.3): of an existing place, prefilled from the version named by ?from, or of a new place. */
export default async function NewJurisdictionVersionPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireStaff();
  const { from } = await searchParams;
  const source = from && UUID_RE.test(from) ? await db().jurisdictionProfile.findUnique({ where: { id: from }, select: { state: true, locality: true, version: true, rules: true } }) : null;
  const defaults = source
    ? { state: source.state, locality: source.locality ?? "", rules: readRules(source.rules) }
    : { state: "", locality: "", rules: readRules(null) };
  return (
    <>
      <header className="space-y-1">
        <h2 className="page-title">{source ? "Propose a new version" : "A new place"}</h2>
        <p className="text-muted-sm">Nothing changes for any job until the version is approved.</p>
      </header>
      <JurisdictionVersionForm defaults={defaults} fromLabel={source ? jurisdictionLabel(source) : null} />
    </>
  );
}
