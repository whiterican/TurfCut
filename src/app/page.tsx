import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, ClipboardCheck, MapPinned, ShieldCheck } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";

const steps = [
  { number: "01", title: "Find field work", description: "Browse canvassing and petition shifts with clear expectations before you commit.", icon: MapPinned },
  { number: "02", title: "Show up prepared", description: "Keep schedules, job details, and any required steps in one place.", icon: CalendarDays },
  { number: "03", title: "Build a work record", description: "Carry verified, job-specific experience forward without a universal worker score.", icon: ClipboardCheck },
];

export default async function Home() {
  const session = await getSessionProfile().catch(() => null);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-32 pt-10 sm:px-8 lg:pb-20 lg:pt-20">
      <div className="grid items-end gap-10 border-b border-border pb-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)] lg:gap-20 lg:pb-20">
        <div>
          <p className="eyebrow mb-5">TurfCut / Field work, connected</p>
          <h1 className="max-w-[14ch] text-[clamp(3.3rem,8vw,7.5rem)] font-bold leading-[0.94] tracking-[-0.065em] text-fg">
            The work behind every campaign.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
            A better way to discover political field jobs, coordinate shifts, and make verified work count. Built for the people on the ground.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={session ? "/dashboard" : "/signup"} className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              {session ? "Open your workspace" : "Get started"} <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href={session ? "/jobs" : "/login"} className="btn-secondary px-6 py-3">
              {session ? "Browse jobs" : "Log in"}
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">How TurfCut works</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><span className="size-1.5 rounded-full bg-[var(--kicker)]" /> Private pilot</span>
          </div>
          <div className="divide-y divide-border">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <div key={number} className="flex gap-4 px-6 py-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg"><Icon className="size-5" aria-hidden /></div>
                <div>
                  <span className="text-[11px] font-semibold tracking-[0.12em] text-subtle">{number} / FIELD OPERATIONS</span>
                  <h2 className="mt-1 text-lg font-bold tracking-tight text-fg">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <section aria-labelledby="principles-heading" className="grid gap-7 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20 lg:py-16">
        <div>
          <p className="eyebrow">Built for accountability</p>
          <h2 id="principles-heading" className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-[-0.04em] text-fg sm:text-4xl">Serious tools for work that matters.</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <BadgeCheck className="size-5 text-fg" aria-hidden />
            <h3 className="font-semibold text-fg">Evidence over ratings</h3>
            <p className="text-sm leading-relaxed text-muted">Transparent, role-specific work records. No opaque overall worker score.</p>
          </div>
          <div className="space-y-2">
            <ShieldCheck className="size-5 text-fg" aria-hidden />
            <h3 className="font-semibold text-fg">Clarity before commitment</h3>
            <p className="text-sm leading-relaxed text-muted">See requirements and outstanding steps before taking on a shift.</p>
          </div>
        </div>
      </section>
      <p className="border-t border-border pt-5 text-xs leading-relaxed text-subtle">TurfCut is in private pilot. Features and availability vary by role and organization.</p>
    </main>
  );
}
