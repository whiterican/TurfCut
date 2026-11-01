import { CalendarDays } from "lucide-react";

/** A job date as "Oct 24", in UTC so the same day prints the same everywhere. */
export const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

/**
 * A job's dates, the same on every card and page: a lavender chip with a
 * calendar (never lime: a date is not live), so it reads as a date and never
 * as a party chip beside it (party chips name the party in words).
 */
export function DateRangeChip({ startsAt, endsAt }: { startsAt: Date | null; endsAt: Date | null }) {
  return (
    <span className="tag-accent">
      <CalendarDays aria-hidden className="size-3.5 shrink-0" />
      {startsAt || endsAt ? `${day(startsAt)} – ${day(endsAt)}` : "Dates to be set"}
    </span>
  );
}
