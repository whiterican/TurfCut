import Link from "next/link";
import type { Metadata } from "next";
import { requireWorker } from "@/lib/worker-session";
import { Masthead } from "@/components/Masthead";
import { ReadingPage } from "@/components/layout/Page";

export const metadata: Metadata = { title: "Guide" };

/**
 * The worker's guide (Caden, Nov 10): the explanations that used to sit on every screen, in one
 * place. Screens keep the figure, the action and one short line; they link here for the rest.
 * Every statement is one the app already made on Home, Jobs, Earnings or a shift page.
 */
const SECTIONS: { id: string; title: string; points: string[]; link?: { href: string; label: string } }[] = [
  {
    id: "jobs",
    title: "Finding jobs",
    points: [
      "Every open job shows its gross rate, the credentials it needs and who to call before you apply.",
      "Swipe a job right to save it and left to hide it, or use the buttons.",
      "Saving and hiding are private to you. Neither is ever used to rank jobs or people.",
    ],
    link: { href: "/jobs", label: "Open Jobs" },
  },
  {
    id: "shifts",
    title: "Shifts",
    points: [
      "The organization schedules your shifts. They appear on Home and under Work.",
      "While you're checked in, the timer counts from your check-in. It is not your verified pay time.",
      "Pay counts verified time only.",
      "If a shift has ended and you're still checked in, open the shift to check out, or ask your organizer to correct the end time.",
    ],
    link: { href: "/shifts", label: "Open Work" },
  },
  {
    id: "pay",
    title: "Getting paid",
    points: [
      "Earnings shows gross pay for shifts your supervisors approved.",
      "Each amount is worked out from your verified hours or accepted work at the job's posted rate.",
      "Turfcut never takes a cut of your pay. Campaigns pay the platform fee.",
      "An amount is never changed after it's approved. A correction shows up as an adjustment.",
      "Set up payouts once and approved pay goes to your bank through Stripe. Stripe collects your bank and tax details; Turfcut never sees them.",
      "You get a receipt for every payment sent to you.",
      "If a line looks wrong, dispute it from Earnings.",
    ],
    link: { href: "/earnings", label: "Open Earnings" },
  },
  {
    id: "privacy",
    title: "Who sees what",
    points: [
      "You choose who sees each part of your scorecard, your availability and your credentials.",
      "You choose whether organizations can find you.",
      "Your political-fit answers are used only as you authorize. Turfcut never guesses them.",
    ],
    link: { href: "/profile/sharing", label: "Open Who sees what" },
  },
];

export default async function GuidePage() {
  await requireWorker();
  return (
    <ReadingPage gap={6} head={<Masthead title="Guide" meta="How Turfcut works, in one place." />}>
      <nav aria-label="Guide sections">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} className="filter-chip">{s.title}</a></li>
          ))}
        </ul>
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="card scroll-mt-24 space-y-3">
          <h2 id={`${s.id}-heading`} className="t-headline text-fg">{s.title}</h2>
          <ul className="list-disc space-y-1.5 ps-5 text-sm text-fg">
            {s.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
          {s.link && <p><Link href={s.link.href} className="link text-sm">{s.link.label}</Link></p>}
        </section>
      ))}
    </ReadingPage>
  );
}
