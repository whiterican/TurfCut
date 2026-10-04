import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { loadFieldWindow } from "@/lib/field-day-data";
import { dayWindow, shiftDay } from "@/lib/field-view";
import { Masthead } from "@/components/staff/Masthead";
import { FieldBoard } from "@/components/staff/FieldBoard";

/** One day's shifts (C1.4), by job and staging point. Days are UTC calendar days; times show in your zone. */
export default async function FieldDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const win = dayWindow(date);
  if (!win) notFound();
  const session = await requireArea("field", "read");
  const rows = await loadFieldWindow(session.orgId, win.from, win.to);
  const label = win.from.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  return (
    <main className="page max-w-4xl">
      <Masthead eyebrow="Field" title={label} meta={`${rows.length} ${rows.length === 1 ? "shift" : "shifts"} on this UTC day (midnight to midnight UTC). Times show in your time zone.`}>
        <Link href={`/field/${shiftDay(date, -1)}`} className="btn-ghost btn-sm" aria-label="Previous day">←</Link>
        <Link href="/field" className="btn-secondary btn-sm">Now</Link>
        <Link href={`/field/${shiftDay(date, 1)}`} className="btn-ghost btn-sm" aria-label="Next day">→</Link>
      </Masthead>
      <FieldBoard rows={rows} empty="No shifts this day." />
    </main>
  );
}
