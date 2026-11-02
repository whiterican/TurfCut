import Link from "next/link";
import { ReadingPage } from "@/components/layout/Page";
import { ProfileNav } from "@/components/ProfileNav";
import { db } from "@/lib/db";
import { requireWorker } from "@/lib/worker-session";
import { loadCampaignHistory, loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { VISIBILITY_OPTIONS } from "@/lib/political-fit";
import { ExperienceForm } from "@/components/ExperienceForm";
import { ExperienceList } from "@/components/ExperienceList";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { ALL_SHARED, shareScorecardPeriods } from "@/lib/shared-scorecard";
import { removeExperience } from "./actions";
import { PhoneForm } from "@/components/PhoneForm";
import { loadSharing } from "@/lib/sharing-data";
import { loadAvailability } from "@/lib/availability-data";
import { isEmptyAvailability } from "@/lib/availability";
import { loadCredentials } from "@/lib/credentials-data";
import { expiryToday } from "@/lib/credentials";
import { RELATIONSHIP_PHRASE, unplacedAreaWarning, type ShareAudience } from "@/lib/sharing";
import { UrlNotice } from "@/components/UrlNotice";
import { geoTables, resolveArea } from "@/lib/geo";
import { Avatar } from "@/components/chat/Avatar";
import { payoutCta, payoutReadiness } from "@/lib/pay";
import { stripeProvider } from "@/lib/payout-provider";
import { expiryReminder } from "@/lib/credentials";
import { BadgeCheck, CalendarCheck, ChevronRight, Eye, Plus, Scale, ScanEye, SlidersHorizontal, Wallet } from "lucide-react";

const AUDIENCE_SHORT: Record<ShareAudience, string> = {
  RELATIONSHIP: `Organizations you ${RELATIONSHIP_PHRASE}`,
  ANY_APPROVED_ORG: "Any approved organization",
  NOBODY: "Nobody",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { workerId } = await requireWorker();
  const setupDone = (await searchParams).setup === "done";
  const [worker, records, scorecard, fit, history, sharing, avail, creds] = await Promise.all([
    db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { displayName: true, phone: true, payoutsEnabled: true, stripeAccountId: true } }),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecardPeriods(workerId),
    loadLatestPreference(workerId),
    loadCampaignHistory(workerId),
    loadSharing(workerId),
    loadAvailability(workerId),
    loadCredentials(workerId),
  ]);
  const mode = fit && VISIBILITY_OPTIONS.find((o) => o.value === fit.visibilityMode);
  // Matches (C3.4) need a home area Turfcut can place; say so rather than leave the worker unfindable.
  const homePlaced = !sharing.choices.findable || !!resolveArea(sharing.choices.homeArea, await geoTables());

  // The menu's status words (#111, screen 9), each from the record it names; nothing is a generic check mark.
  const expiryDay = expiryToday();
  const expired = creds.filter((c) => expiryReminder(c.expiresOn, expiryDay) === "expired").length;
  const soon = creds.filter((c) => ["30", "7"].includes(expiryReminder(c.expiresOn, expiryDay) ?? "")).length;
  const credStatus = creds.length === 0 ? "None yet" : expired ? `${expired} expired` : soon ? `${soon} expiring soon` : `${creds.length} on file`;
  const availStatus = isEmptyAvailability(avail.availability) ? "Not set" : "Set";
  const readiness = payoutReadiness(stripeProvider().configured(), worker.payoutsEnabled);
  const payoutStatus = readiness === "off" ? "Not available yet" : payoutCta(readiness, !!worker.stripeAccountId)?.label ?? "Ready";
  const sharingStatus = sharing.version === null ? "Defaults" : sharing.current ? "Set" : "Needs confirming";
  // Political fit: a lapsed or reworded consent is never shown as a mode (until reconfirmed nothing is used or shown).
  const fitStatus = !fit || !mode ? "Not set yet" : fit.status.state !== "current" ? "Needs reconfirming" : mode.label;
  // Rows name the sections as the desktop sub-nav does (lib/profile-nav), except Political fit: the sharing page's
  // versioned hint sends workers "under Political fit on your profile", so the row keeps that name.
  const menu = [
    { href: "/profile/credentials", icon: BadgeCheck, label: "Credentials", status: credStatus, alert: expired > 0 },
    { href: "/profile/availability", icon: CalendarCheck, label: "Availability", status: availStatus, alert: false },
    { href: "/earnings#payouts", icon: Wallet, label: "Payout setup", status: payoutStatus, alert: false },
    // The defaults are a choice not yet made, not an error; a confirmation that lapsed under new wording is.
    { href: "/profile/sharing", icon: Eye, label: "Who sees what", status: sharingStatus, alert: sharing.version !== null && !sharing.current },
    { href: "/profile/preferences", icon: Scale, label: "Political fit", status: fitStatus, alert: !!fit && !!mode && fit.status.state !== "current" },
    { href: "/profile/preview", icon: ScanEye, label: "What organizations see", status: "", alert: false },
    { href: "/settings", icon: SlidersHorizontal, label: "Settings & sign out", status: "", alert: false },
  ];

  // A ReadingPage with the profile's sections as a sub-nav: on the left from 1024, rows on a phone (redesign §5).
  return (
    <ReadingPage
      panelStart
      gap={6}
      panelLabel="Profile sections"
      aside={<ProfileNav />}
      head={
        <header className="profile-head">
          <Avatar name={worker.displayName} size="lg" />
          <h1 className="t-headline text-fg">{worker.displayName}</h1>
          {/* The home area the worker saved for matching, when they set one; never guessed. */}
          {sharing.choices.homeArea && <p className="text-sm text-subtle">{sharing.choices.homeArea}</p>}
        </header>
      }
    >
      {/* The concept's menu (#111, screen 9): each row names a real record and says where it stands. */}
      <nav aria-label="Profile menu" className="-mt-2">
        <ul className="profile-menu">
          {menu.map((m) => (
            <li key={m.href}>
              <Link transitionTypes={["nav-forward"]} href={m.href} className="profile-row">
                <m.icon aria-hidden className={`size-5 shrink-0 ${m.alert ? "text-[var(--danger)]" : "text-muted"}`} />
                <span className="font-semibold">{m.label}</span>
                {m.status && <span className={`profile-row-status ${m.alert ? "text-[var(--danger)]" : ""}`}>{m.status}</span>}
                <ChevronRight aria-hidden className={`size-4 shrink-0 text-subtle ${m.status ? "" : "ms-auto"}`} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Findable, but the home area Turfcut can't place (from the saved choices): nobody can find them, so say so here. */}
      {sharing.choices.findable && !homePlaced && (
        <p className="alert-warning text-sm">
          {unplacedAreaWarning(sharing.choices.homeArea ?? "")}{" "}
          <Link href="/profile/sharing" className="link font-semibold">Fix it</Link>
        </p>
      )}

      {/* Only when a confirmed choice is really on record: a hand-typed ?setup=done claims nothing. */}
      {setupDone && sharing.current && <UrlNotice param="setup" message="Saved. These are your choices now; change them any time under Who sees what." />}
      {!sharing.current && (
        // Until the worker saves a sharing choice under today's wording (C2-Q4): a reminder, every visit.
        <section className="card space-y-2" aria-label="Set up who sees what">
          <p className="font-semibold text-fg">{sharing.version === null ? "Choose who sees what" : "Check who sees what"}</p>
          <p className="text-muted-sm">
            {sharing.version === null
              ? `You're on the defaults: organizations you ${RELATIONSHIP_PHRASE} see your profile, and nobody can find you.`
              : "We've changed how Turfcut explains who sees what since you chose. Your choices stay as they are; take a look and confirm them. If you let organizations find you, they can't until you confirm."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link transitionTypes={["nav-forward"]} href="/profile/setup?from=profile" className="btn-primary btn-sm">{sharing.version === null ? "Set it up" : "Check your choices"}</Link>
            <Link href="/profile/preview" className="btn-ghost btn-sm">See what organizations see</Link>
          </div>
        </section>
      )}

      <section className="section" id="record">
        <h2 className="section-title">Work record</h2>
        <ScorecardPanel periods={shareScorecardPeriods(scorecard, ALL_SHARED)} history={history} ringScope={workerId} />
      </section>

      <section className="section" id="experience">
        <h2 className="section-title">Experience</h2>
        <p className="text-hint">
          Seen by: {AUDIENCE_SHORT[sharing.choices.audiences.history]} (experience goes with hours and history). Organizations that see it
          never see a reference&apos;s contact details, only that you gave one.{" "}
          <Link href="/profile/sharing" className="link">Change</Link>
        </p>
        <ExperienceList
          records={records.map((r) => ({ ...r, hasReference: r.referenceContact !== null }))}
          removeAction={removeExperience}
          showReference
        />
        {/* The form waits behind its button, even with no records (#114: each section stays focused). */}
        <details className="group">
          <summary className="btn-secondary btn-sm w-fit cursor-pointer list-none">
            {/* One name in both states: the expanded state already says whether the form is open. */}
            <Plus aria-hidden className="btn-icon transition group-open:rotate-45" />
            Add a campaign
          </summary>
          <div className="card mt-3">
            <ExperienceForm />
          </div>
        </details>
      </section>

      <section className="section">
        <h2 className="section-title">Contact</h2>
        <PhoneForm phone={worker.phone} />
      </section>
    </ReadingPage>
  );
}
