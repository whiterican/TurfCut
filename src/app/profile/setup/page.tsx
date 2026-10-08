import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadSharing } from "@/lib/sharing-data";
import { loadAvailability } from "@/lib/availability-data";
import { loadCredentials } from "@/lib/credentials-data";
import { PART_DETAILS, SHARE_GROUPS, type ShareAudience, type WorkType } from "@/lib/sharing";
import { availabilitySummary, isEmptyAvailability } from "@/lib/availability";
import { credentialName } from "@/lib/credentials";
import { SETUP_STEPS, setupOrigin, setupStep } from "@/lib/setup-flow";
import { PendingButton } from "@/components/PendingButton";
import { confirmSharing, skipSetup } from "./actions";

const SHORT: Record<ShareAudience, string> = {
  RELATIONSHIP: "Organizations you apply to or accept an invite from",
  ANY_APPROVED_ORG: "Any organization Turfcut has approved",
  NOBODY: "Nobody",
};
const WORK: Record<WorkType, string> = { PETITION: "petition", CANVASS: "canvass" };
const ERRORS: Record<string, string> = {
  stale: "Your choices changed since this page opened (perhaps in another window). Check them, then press Done again.",
  invalid: "Your saved choices need a fix before they can be confirmed. Open Who sees what to fix them.",
};

/**
 * First-run setup (C2.6): four short steps, each with the current state and
 * a link to change it. It shows everything Who sees what covers (each part's
 * contents, being found and for what work), since Done records the choices
 * under the sharing wording. Skippable at any point; skipping keeps them.
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; from?: string; error?: string }> }) {
  const { workerId } = await requireWorker();
  const sp = await searchParams;
  const n = setupStep(sp.step);
  const from = setupOrigin(sp.from);
  // Own keys only: ?error=constructor must not reach the page as a function.
  const error = n === SETUP_STEPS.length && typeof sp.error === "string" && Object.hasOwn(ERRORS, sp.error) ? ERRORS[sp.error] : undefined;
  const [sharing, avail, creds] = await Promise.all([loadSharing(workerId), loadAvailability(workerId), loadCredentials(workerId)]);
  const c = sharing.choices;
  const today = new Date().toISOString().slice(0, 10);
  const step = (k: number) => `/profile/setup?step=${k}${from === "profile" ? "&from=profile" : ""}`;

  return (
    <main className="page max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Step {n} of {SETUP_STEPS.length}</p>
        <h1 className="page-title">{SETUP_STEPS[n - 1]}</h1>
        <ol className="flex gap-1.5" aria-label="Progress">
          {SETUP_STEPS.map((s, i) => (
            <li key={s} aria-current={i === n - 1 ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i < n ? "bg-[var(--focus)]" : "bg-surface-2"}`}>
              <span className="sr-only">{s}{i < n - 1 ? " (seen)" : i === n - 1 ? " (this step)" : ""}</span>
            </li>
          ))}
        </ol>
      </header>

      <section className="card space-y-3">
        {n === 1 && (
          <>
            <p className="text-muted-sm">Each part of your scorecard has its own audience. Anything not shared shows as &quot;not shared&quot;, never a zero.</p>
            <ul className="space-y-3">
              {SHARE_GROUPS.map((g) => (
                <li key={g} className="space-y-0.5 text-sm">
                  <span className="flex flex-wrap justify-between gap-x-4">
                    <span className="text-fg">{PART_DETAILS[g].label}</span>
                    <span className="text-muted">{SHORT[c.audiences[g]]}</span>
                  </span>
                  <span className="text-hint block">{PART_DETAILS[g].covers}</span>
                </li>
              ))}
            </ul>
            <Link href="/profile/sharing" className="link text-sm">Change who sees what</Link>
          </>
        )}
        {n === 2 && (
          <>
            <p className="text-muted-sm">When you&apos;re usually free, for schedulers. Never scored. It covers: {PART_DETAILS.availability.covers.toLowerCase()}.</p>
            <p className="text-muted-sm">Seen by: {SHORT[c.audiences.availability]}.</p>
            <p className="text-sm text-fg">{isEmptyAvailability(avail.availability) ? "Not set yet." : availabilitySummary(avail.availability, today).usual ?? "Only specific dates set."}</p>
            <Link href="/profile/availability" className="link text-sm">{isEmptyAvailability(avail.availability) ? "Set your availability" : "Change availability"}</Link>
          </>
        )}
        {n === 3 && (
          <>
            <p className="text-muted-sm">Registrations, notary status and training. Organizations see the {PART_DETAILS.credentials.covers.toLowerCase()}, never the number.</p>
            <p className="text-muted-sm">Seen by: {SHORT[c.audiences.credentials]}.</p>
            <p className="text-sm text-fg">{creds.length ? creds.map(credentialName).join(", ") : "None added yet."}</p>
            <Link href="/profile/credentials" className="link text-sm">{creds.length ? "Manage credentials" : "Add a credential"}</Link>
          </>
        )}
        {n === 4 && (
          <>
            <p className="text-muted-sm">
              Whether organizations can find you for work, and for which kind. Off unless you turn it on; it uses only a city or ZIP you type, never
              your phone&apos;s location.
            </p>
            <p className="text-sm text-fg">
              {c.findable ? `On: ${c.workTypes.map((t) => WORK[t]).join(" and ")} work, within ${c.travelMiles} miles of ${c.homeArea}.` : "Off."}
            </p>
            <Link href="/profile/sharing" className="link text-sm">Change</Link>
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="alert-warning">
          {error} {sp.error === "invalid" && <Link href="/profile/sharing" className="link">Who sees what</Link>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {n < SETUP_STEPS.length ? (
          <Link href={step(n + 1)} className="btn-primary">Next</Link>
        ) : (
          <form action={confirmSharing}>
            {/* The version on screen: Done confirms it, or is refused if a newer save landed meanwhile. */}
            <input type="hidden" name="version" value={sharing.version ?? ""} />
            <input type="hidden" name="from" value={from} />
            <PendingButton pendingLabel="Saving…">Done, keep these choices</PendingButton>
          </form>
        )}
        {n > 1 && <Link href={step(n - 1)} className="btn-ghost">Back</Link>}
        <form action={skipSetup}>
          <input type="hidden" name="from" value={from} />
          <PendingButton className="btn-ghost" pendingLabel="Skipping…">Skip for now</PendingButton>
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
