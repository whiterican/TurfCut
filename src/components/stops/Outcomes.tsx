import { Ban, Check, DoorClosed, RotateCcw, Truck, X, type LucideIcon } from "lucide-react";
import { OUTCOMES, outcomeLook, UNVISITED_COLOR, type OutcomeKind, type Progress } from "@/lib/stop-outcomes";

const GLYPH: Record<string, LucideIcon> = { check: Check, rotate: RotateCcw, door: DoorClosed, ban: Ban, x: X, truck: Truck };

export function OutcomeGlyph({ kind, className = "size-4" }: { kind: OutcomeKind; className?: string }) {
  const G = GLYPH[outcomeLook(kind).glyph];
  return <G aria-hidden className={className} />;
}

/** The colour-coded word for an outcome: a tinted pill with the glyph and the label, so colour is never the only cue. */
export function OutcomeChip({ kind, className = "" }: { kind: OutcomeKind | null; className?: string }) {
  if (!kind) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-semibold text-muted ${className}`}>
        <span aria-hidden className="size-2 rounded-full" style={{ background: UNVISITED_COLOR }} />
        To do
      </span>
    );
  }
  const o = outcomeLook(kind);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-fg ${className}`}
      style={{ borderColor: o.color, background: `color-mix(in srgb, ${o.color} 16%, transparent)` }}
    >
      <span className="grid size-4 place-items-center rounded-full" style={{ background: o.color, color: o.ink }}>
        <OutcomeGlyph kind={kind} className="size-3" />
      </span>
      {o.label}
    </span>
  );
}

/** The key to the colours, for a page that shows them. */
export function OutcomeLegend({ className = "" }: { className?: string }) {
  return (
    <ul aria-label="What the colours mean" className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`}>
      <li className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className="size-3 rounded-full" style={{ background: UNVISITED_COLOR }} />
        To do
      </li>
      {OUTCOMES.map((o) => (
        <li key={o.kind} className="flex items-center gap-1.5 text-xs text-fg">
          <span className="grid size-4 place-items-center rounded-full" style={{ background: o.color, color: o.ink }}>
            <OutcomeGlyph kind={o.kind} className="size-3" />
          </span>
          {o.label}
        </li>
      ))}
    </ul>
  );
}

const ORDER: OutcomeKind[] = ["DONE", "NOT_HOME", "REFUSED", "MOVED_VACANT", "DO_NOT_KNOCK", "COME_BACK"];

/** A book's progress as a segmented bar, with the sentence that says the same thing. */
export function ProgressBar({ progress, label = true }: { progress: Progress; label?: boolean }) {
  const parts = ORDER.filter((k) => progress.byKind[k] > 0);
  const text = `${progress.settled} of ${progress.total} settled${progress.byKind.COME_BACK ? ` · ${progress.byKind.COME_BACK} to come back to` : ""}${progress.byKind.DO_NOT_KNOCK ? ` · ${progress.byKind.DO_NOT_KNOCK} don't knock` : ""}`;
  return (
    <div className="space-y-1.5">
      <div role="img" aria-label={text} className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-2">
        {progress.total > 0 &&
          parts.map((k) => <span key={k} style={{ width: `${(progress.byKind[k] / progress.total) * 100}%`, background: outcomeLook(k).color }} />)}
      </div>
      {label && <p className="text-xs text-muted">{text}</p>}
    </div>
  );
}
