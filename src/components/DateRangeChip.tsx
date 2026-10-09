import { CalendarDays } from "lucide-react";

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

/**
 * A job's dates, the same on every card and page: sky blue with a calendar,
 * so it reads as a date and never as a party chip beside it (party chips
 * name the party in words).
 */
export function DateRangeChip({ startsAt, endsAt }: { startsAt: Date | null; endsAt: Date | null }) {
  return (
    <span className="badge-sky">
      <CalendarDays aria-hidden className="size-3.5 shrink-0" />
      {startsAt || endsAt ? `${day(startsAt)} – ${day(endsAt)}` : "Dates to be set"}
    </span>
  );
}
