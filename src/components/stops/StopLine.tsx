import { Navigation } from "lucide-react";
import { OutcomeChip } from "@/components/stops/Outcomes";
import { answerWords, outcomeLook, UNVISITED_COLOR, UNVISITED_INK, type StopState } from "@/lib/stop-outcomes";

export interface StopView {
  id: string;
  stopNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  /** The import's names and addresses were deleted (30 days, or sooner): the stop stays, with its number and its outcomes, and no address. */
  purged?: boolean;
  result: StopState;
  /** The worker's own poll answers at this stop (a worker's view only). */
  poll?: Array<{ questionId: string; choiceId: string | null; declined: boolean }>;
}

export const streetOf = (s: StopView) => (s.purged ? `Stop ${s.stopNumber}` : `${s.line1}${s.unit ? `, ${s.unit}` : ""}`);
export const placeOf = (s: StopView) => (s.purged ? "Address deleted" : `${s.city}, ${s.state} ${s.zip}`);
/** The phone's own maps app, opened by the reader tapping it; the address goes nowhere until then. */
export const directionsTo = (s: StopView) => `https://maps.apple.com/?q=${encodeURIComponent(`${s.line1}, ${placeOf(s)}`)}`;

/** The stop's colour: its outcome's, or the book's own purple while it is still to do. */
export const stopColor = (s: StopView) => (s.result.outcome ? outcomeLook(s.result.outcome).color : UNVISITED_COLOR);
/** The text on that colour, 4.5:1 or better (stop-outcomes.test.ts). */
export const stopInk = (s: StopView) => (s.result.outcome ? outcomeLook(s.result.outcome).ink : UNVISITED_INK);

/** The number badge, address, outcome chip and what was recorded: one stop's face, the same on every screen. */
export function StopFace({ stop, extra }: { stop: StopView; extra?: string | null }) {
  const words = answerWords(stop.result);
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums" style={{ background: stopColor(stop), color: stopInk(stop) }} aria-hidden>
        {stop.stopNumber}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="sr-only">Stop {stop.stopNumber}: </span>
        <span className="block truncate font-semibold text-fg">{streetOf(stop)}</span>
        <span className="block truncate text-sm text-muted">{placeOf(stop)}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <OutcomeChip kind={stop.result.outcome} />
          {(words.length > 0 || extra) && <span className="text-xs text-muted">{[...words, extra].filter(Boolean).join(" · ")}</span>}
        </span>
      </span>
    </>
  );
}

export function DirectionsLink({ stop }: { stop: StopView }) {
  // Nowhere to go once the address is deleted; keep the row's width so stops line up.
  if (stop.purged) return <span aria-hidden className="size-11 shrink-0" />;
  return (
    <a
      href={directionsTo(stop)}
      target="_blank"
      rel="noopener noreferrer"
      className="no-print grid size-11 shrink-0 place-items-center rounded-full text-link hover:bg-surface-2 focus-visible:outline-2"
      aria-label={`Directions to stop ${stop.stopNumber}, ${streetOf(stop)}`}
    >
      <Navigation aria-hidden className="size-5" />
    </a>
  );
}
