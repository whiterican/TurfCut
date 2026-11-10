import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Masthead } from "@/components/Masthead";
import { ReadingPage } from "@/components/layout/Page";
import { GUIDE_SECTIONS } from "@/lib/guide";

export const metadata: Metadata = { title: "Guide" };

/** The worker's guide: screens keep the figure, the action and one short line, and link here for the rest (lib/guide). */

export default async function GuidePage() {
  // No worker data is read: any worker login may open it, linked to a profile or not.
  await requireRole(["WORKER"]);
  return (
    <ReadingPage gap={6} head={<Masthead title="Guide" meta="How Turfcut works, in one place." />}>
      <nav aria-label="Guide sections">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {GUIDE_SECTIONS.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} className="link text-sm">{s.title}</a></li>
          ))}
        </ul>
      </nav>
      {GUIDE_SECTIONS.map((s) => (
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
