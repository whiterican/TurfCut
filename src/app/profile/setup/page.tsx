import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadSharing } from "@/lib/sharing-data";
import { loadAvailability } from "@/lib/availability-data";
import { loadCredentials } from "@/lib/credentials-data";
import { AUDIENCE_OPTIONS, PART_DETAILS, SHARE_GROUPS, type ShareAudience } from "@/lib/sharing";
import { availabilitySummary, isEmptyAvailability } from "@/lib/availability";
import { credentialName } from "@/lib/credentials";
import { confirmSharing, skipSetup } from "./actions";

const SHORT: Record<ShareAudience, string> = {
  RELATIONSHIP: "Organizations you apply to or accept an invite from",
  ANY_APPROVED_ORG: "Any organization Turfcut has approved",
  NOBODY: "Nobody",
};
const STEPS = ["Who sees your scorecard", "Availability", "Credentials", "Being found"] as const;

/**
 * First-run setup (C2.6): four short steps, each with the current state and
 * a link to change it. Skippable at any point; skipping keeps the defaults.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { workerId } = await requireWorker();
  const n = Math.min(Math.max(Number((await searchParams).step) || 1, 1), STEPS.length);
  const [sharing, avail, creds] = await Promise.all([loadSharing(workerId), loadAvailability(workerId), loadCredentials(workerId)]);
  const c = sharing.choices;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="page max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Step {n} of {STEPS.length}</p>
        <h1 className="page-title">{STEPS[n - 1]}</h1>
        <ol className="flex gap-1.5" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i < n ? "bg-[var(--focus)]" : "bg-surface-2"}`}>
              <span className="sr-only">{s}{i < n - 1 ? " (done)" : i === n - 1 ? " (now)" : ""}</span>
            </li>
          ))}
        </ol>
      </header>

      <section className="card space-y-3">
        {n === 1 && (
          <>
            <p className="text-muted-sm">Each part of your scorecard has its own audience. Anything not shared shows as &quot;not shared&quot;, never a zero.</p>
            <ul className="space-y-1.5">
              {SHARE_GROUPS.map((g) => (
                <li key={g} className="flex flex-wrap justify-between gap-x-4 text-sm">
                  <span className="text-fg">{PART_DETAILS[g].label}</span>
                  <span className="text-muted">{SHORT[c.audiences[g]]}</span>
                </li>
              ))}
            </ul>
            <Link href="/profile/sharing" className="link text-sm">Change who sees what</Link>
          </>
        )}
        {n === 2 && (
          <>
            <p className="text-muted-sm">When you&apos;re usually free, for schedulers. Never scored. Seen by: {AUDIENCE_OPTIONS.find((o) => o.value === c.audiences.availability)!.label}.</p>
            <p className="text-sm text-fg">{isEmptyAvailability(avail.availability) ? "Not set yet." : availabilitySummary(avail.availability, today).usual ?? "Only specific dates set."}</p>
            <Link href="/profile/availability" className="link text-sm">{isEmptyAvailability(avail.availability) ? "Set your availability" : "Change availability"}</Link>
          </>
        )}
        {n === 3 && (
          <>
            <p className="text-muted-sm">Registrations, notary status and training. Seen by: {AUDIENCE_OPTIONS.find((o) => o.value === c.audiences.credentials)!.label}. Never the number.</p>
            <p className="text-sm text-fg">{creds.length ? creds.map(credentialName).join(", ") : "None added yet."}</p>
            <Link href="/profile/credentials" className="link text-sm">{creds.length ? "Manage credentials" : "Add a credential"}</Link>
          </>
        )}
        {n === 4 && (
          <>
            <p className="text-muted-sm">Whether organizations can find you for work. Off unless you turn it on; it uses only a city or ZIP you type.</p>
            <p className="text-sm text-fg">{c.findable ? `On: within ${c.travelMiles} miles of ${c.homeArea}.` : "Off."}</p>
            <Link href="/profile/sharing" className="link text-sm">Change</Link>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {n < STEPS.length ? (
          <Link href={`/profile/setup?step=${n + 1}`} className="btn-primary">Next</Link>
        ) : (
          <form action={confirmSharing}>
            <button className="btn-primary">Done, keep these choices</button>
          </form>
        )}
        {n > 1 && <Link href={`/profile/setup?step=${n - 1}`} className="btn-ghost">Back</Link>}
        <form action={skipSetup}>
          <button className="btn-ghost">Skip for now</button>
        </form>
      </div>
      <p className="text-hint">
        {sharing.version === null
          ? "Skipping keeps the defaults: organizations you apply to or accept an invite from see your profile, and nobody can find you."
          : "Skipping keeps your current choices."}
      </p>
    </main>
  );
}
