import { Circle, CircleCheck, CircleDashed, CircleDotDashed, CirclePause, Clock, ClockAlert, EyeOff, Hourglass, LockKeyhole, Minus, Send, Square, TriangleAlert, type LucideIcon } from "lucide-react";
import { STATUS_LOOK, type Status, type StatusState } from "@/lib/status";

const GLYPHS: Record<string, LucideIcon | null> = {
  dot: null,
  "circle-check": CircleCheck,
  circle: Circle,
  lock: LockKeyhole,
  send: Send,
  "circle-dashed": CircleDashed,
  clock: Clock,
  "clock-alert": ClockAlert,
  "circle-dot-dashed": CircleDotDashed,
  hourglass: Hourglass,
  "triangle-alert": TriangleAlert,
  "circle-pause": CirclePause,
  square: Square,
  "eye-off": EyeOff,
  minus: Minus,
};

/**
 * One status, said in words with a glyph shape beside it (redesign §4.1.3):
 * paid, approved and pending never look alike, and colour is never the only
 * cue. Takes a worded state from the domain functions (statusLabel, the shift
 * replay, the engagement labels), never a colour.
 */
export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return <StatusChip state={status.state} label={status.label} className={className} />;
}

export function StatusChip({ state, label, className = "" }: { state: StatusState; label: string; className?: string }) {
  return (
    <span className={`status status-${state} ${className}`.trim()} data-state={state}>
      <StatusGlyph state={state} />
      {label}
    </span>
  );
}

/** The state's glyph alone, for chips that compose their own face (the pay morph, the connection pill). */
export function StatusGlyph({ state }: { state: StatusState }) {
  const Glyph = GLYPHS[STATUS_LOOK[state].glyph];
  return Glyph ? <Glyph aria-hidden className="status-glyph" strokeWidth={2.25} /> : <span aria-hidden className="status-dot" />;
}
