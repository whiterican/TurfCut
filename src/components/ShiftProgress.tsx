import type { ProgressStep } from "@/lib/field-day";
import { LocalTime } from "@/components/LocalTime";

/** The mockup's five-step field-day timeline. */
export function ShiftProgress({ steps }: { steps: ProgressStep[] }) {
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <div className="card space-y-1">
      <p className="flex items-center justify-between pb-2 font-bold text-fg">
        Shift progress <span className="text-xs font-medium text-subtle">{done} of {steps.length}</span>
      </p>
      <ol className="relative space-y-4 border-l border-border pl-5">
        {steps.map((s) => (
          <li key={s.key} className="relative">
            <span
              aria-hidden
              className={`absolute top-1 -left-[1.6rem] size-3 rounded-full border-2 ${
                s.state === "done" ? "border-[var(--ring-2)] bg-accent" : s.state === "current" ? "border-[var(--focus)] bg-surface ring-4 ring-accent/40" : "border-border bg-surface"
              }`}
            />
            <p className={`text-sm font-semibold ${s.state === "todo" ? "text-subtle" : "text-fg"}`}>
              {s.label}
              <span className="sr-only"> — {s.state === "done" ? "done" : s.state === "current" ? "in progress" : "not yet"}</span>
            </p>
            <p className="text-xs text-muted">
              {s.at && (
                <>
                  <LocalTime iso={s.at.toISOString()} mode="time" /> ·{" "}
                </>
              )}
              {s.detail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
