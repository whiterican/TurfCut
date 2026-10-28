import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, ClipboardCheck, MapPinned, ShieldCheck } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { db } from "@/lib/db";
import { openJobsEndAfter, payShort } from "@/lib/jobs";
import { day } from "@/components/DateRangeChip";
import Image from "next/image";
import { HeroPage } from "@/components/layout/Page";
import { JobPhoto } from "@/components/JobPhoto";

const steps = [
  { number: "01", title: "Find field work", description: "Browse canvassing and petition shifts with clear expectations before you commit.", icon: MapPinned },
  { number: "02", title: "Show up prepared", description: "Keep schedules, job details, and any required steps in one place.", icon: CalendarDays },
  { number: "03", title: "Build a work record", description: "Carry verified, job-specific experience forward without a universal worker score.", icon: ClipboardCheck },
];

/**
 * One real open job for the hero's card (green board's "featured" slot): the
 * soonest published job from an approved organization, or nothing. Never a
 * fixture; the page stands without it (and when no database is configured).
 */
async function featuredJob() {
  try {
    return await db().job.findFirst({
      where: { status: "PUBLISHED", org: { approved: true }, endsAt: { gt: openJobsEndAfter(new Date()) } },
      orderBy: [{ startsAt: "asc" }],
      select: { id: true, title: true, type: true, startsAt: true, endsAt: true, geography: true, compensationMethod: true, payRateCents: true, org: { select: { name: true } } },
    });
  } catch {
    return null;
  }
}

export default async function Home() {
  const [session, featured] = await Promise.all([getSessionProfile().catch(() => null), featuredJob()]);
  const geo = (featured?.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  return (
    <HeroPage>
      {/* The public hero (#111, screen 1): the photograph, the line, one Forest action, one real open job. */}
      <section className="landing-hero">
        <Image src="/photos/hero-neighborhood.jpg" alt="" fill priority sizes="100vw" className="landing-hero-art object-cover" />
        <div className="landing-hero-scrim" aria-hidden />
        <div className="landing-hero-body">
          <div className="landing-hero-copy">
            <h1 className="landing-hero-line">Field work that matters.</h1>
            <p className="landing-hero-proof">Get paid to support the causes and campaigns you believe in.</p>
            <Link href={session ? "/jobs" : "/signup"} className="btn-primary mt-6 inline-flex items-center gap-2 px-6">
              {session ? "Find jobs" : "Find jobs"} <ArrowRight aria-hidden className="size-4" />
            </Link>
            {!session && (
              <p className="mt-4 text-sm text-[var(--shell-muted)]">
                Already on Turfcut? <Link href="/login" className="link font-semibold text-[var(--shell-fg)]">Log in</Link>
              </p>
            )}
          </div>
          {featured && (
            <div className="landing-hero-featured">
              <p className="landing-hero-kicker">Open now</p>
              <Link href={`/jobs/${featured.id}`} className="landing-featured-card">
                <span className="landing-featured-art"><JobPhoto type={featured.type} sizes="64px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold leading-tight text-fg">{featured.title}</span>
                  <span className="mt-0.5 block text-sm font-bold text-fg tabular-nums">{payShort(featured.compensationMethod, featured.payRateCents, featured.type)}</span>
                  <span className="block text-xs text-muted">
                    {featured.startsAt ? `${day(featured.startsAt)} – ${day(featured.endsAt)}` : "Dates to be set"}
                    {place && ` · ${place}`}
                  </span>
                  <span className="block truncate text-xs text-muted">{featured.org.name}</span>
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 pb-32 pt-12 sm:px-8 lg:pb-20 lg:pt-20">
        <div className="grid items-start gap-10 border-b border-border pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.9fr)] lg:gap-20 lg:pb-20">
          <div className="min-w-0">
            <p className="eyebrow mb-4">The work behind every campaign.</p>
            <h2 className="max-w-[16ch] text-3xl font-bold leading-tight tracking-[-0.04em] text-fg sm:text-4xl">Discover field jobs, coordinate shifts, make verified work count.</h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">Built for the people on the ground, and for the organizations that hire them.</p>
          </div>
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
              <span className="min-w-0 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">How TurfCut works</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted"><span className="size-1.5 rounded-full bg-[var(--kicker)]" /> Private pilot</span>
            </div>
            <div className="divide-y divide-border">
              {steps.map(({ number, title, description, icon: Icon }) => (
                <div key={number} className="flex gap-4 px-6 py-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg"><Icon className="size-5" aria-hidden /></div>
                  <div>
                    <span className="text-[11px] font-semibold tracking-[0.12em] text-subtle">{number} / FIELD OPERATIONS</span>
                    <h3 className="mt-1 text-lg font-bold tracking-tight text-fg">{title}</h3>
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
      </div>
    </HeroPage>
  );
}
