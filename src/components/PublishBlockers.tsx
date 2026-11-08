import Link from "next/link";
import type { PublishBlocker, PublishFixer } from "@/lib/jobs";
import { stepLabel } from "@/lib/job-builder";

const GROUPS: { fixer: PublishFixer; title: string }[] = [
  { fixer: "job", title: "In this job" },
  { fixer: "settings", title: "In organization settings" },
  { fixer: "counsel", title: "With counsel" },
];

/**
 * Why a job can't publish, grouped by who can fix each reason (#126, PLAN §2).
 * The reasons' words are publishBlockers' own. "In this job" is fixed in the
 * builder (the Edit draft button under the section); the settings link shows
 * only for a member who can open settings; counsel's reasons have no link.
 */
export function PublishBlockers({ blockers, canReadSettings }: { blockers: PublishBlocker[]; canReadSettings: boolean }) {
  return (
    <div className="alert-warning space-y-3">
      <p className="font-medium">This job can&apos;t publish yet</p>
      {GROUPS.map(({ fixer, title }) => {
        const items = blockers.filter((b) => b.fixer === fixer);
        if (items.length === 0) return null;
        return (
          <div key={fixer} className="space-y-1">
            <h3 className="font-semibold">{title}</h3>
            <ul className="list-disc space-y-0.5 pl-5">
              {items.map((b) => {
                const step = b.field ? stepLabel(b.field) : null;
                return (
                  <li key={b.text}>
                    {b.text}
                    {step && <span className="text-muted-sm"> {step}</span>}
                  </li>
                );
              })}
            </ul>
            {/* Only a page this member can open (the Desk sends roles without settings access here). */}
            {fixer === "settings" && canReadSettings && <Link href="/org/settings" className="link">Organization settings</Link>}
            {fixer === "counsel" && <p className="text-muted-sm">Turfcut staff approve rule profiles.</p>}
          </div>
        );
      })}
    </div>
  );
}
