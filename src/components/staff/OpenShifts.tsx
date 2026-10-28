import { StatusBadge } from "@/components/StatusBadge";
import { ActionButton } from "@/components/ActionButton";
import { LocalTime } from "@/components/LocalTime";
import { assignSlotAction, closeSlotAction, slotSeatsAction } from "@/app/shifts/actions";
import { seatsLeft, slotStateLabel } from "@/lib/shift-slots";
import type { loadJobSlots } from "@/lib/shift-slots-data";

type Slot = Awaited<ReturnType<typeof loadJobSlots>>[number];

/**
 * The job's open shifts for staff (M8.2): seats taken and by whom, and the
 * three things staff do: change the seats, close to sign-ups, place a hired
 * worker by hand.
 */
export function OpenShifts({ slots, hired, now }: { slots: Slot[]; hired: Array<{ engagementId: string; name: string }>; now: Date }) {
  if (!slots.length) return <p className="text-muted-sm">No open shifts yet. Post one below and hired workers can take a seat.</p>;
  return (
    <ul className="space-y-3">
      {slots.map((s) => {
        const b = slotStateLabel(s.state, seatsLeft(s.facts));
        const holding = new Set(s.shifts.map((x) => x.engagementId));
        const free = hired.filter((h) => !holding.has(h.engagementId));
        // Started is judged by time: a closed slot reads "Closed" but can't be changed once under way either.
        const live = now < s.startsAt;
        return (
          <li key={s.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="eyebrow"><LocalTime iso={s.startsAt.toISOString()} mode="date" /></p>
                <p className="font-bold text-fg">
                  <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
                  {s.stagingLocation ? ` · ${s.stagingLocation}` : ""}
                </p>
                <p className="text-muted-sm">{s.facts.taken} of {s.headcount} {s.headcount === 1 ? "seat" : "seats"} taken</p>
                {s.notes && <p className="text-sm text-fg">{s.notes}</p>}
              </div>
              <StatusBadge status={b} />
            </div>
            {s.shifts.length > 0 && (
              <p className="text-sm text-fg">
                <span className="font-semibold">Signed up:</span> {s.shifts.map((x) => x.engagement.worker.displayName).join(", ")}
              </p>
            )}
            {live && (
              <div className="flex flex-wrap items-start gap-4">
                <ActionButton action={slotSeatsAction} fields={{ slotId: s.id }} label="Set seats" pendingLabel="Saving…" variant="btn-secondary btn-sm">
                  <label className="space-y-1.5">
                    <span className="label">Seats</span>
                    <input name="headcount" type="number" inputMode="numeric" min={Math.max(1, s.facts.taken)} max={200} step={1} defaultValue={s.headcount} className="field w-24" required />
                  </label>
                </ActionButton>
                {free.length > 0 && seatsLeft(s.facts) > 0 && (
                  <ActionButton action={assignSlotAction} fields={{ slotId: s.id }} label="Place worker" pendingLabel="Placing…" variant="btn-secondary btn-sm">
                    <label className="space-y-1.5">
                      <span className="label">Hired worker</span>
                      <select name="engagementId" className="field" required defaultValue="">
                        <option value="" disabled>Choose…</option>
                        {free.map((h) => <option key={h.engagementId} value={h.engagementId}>{h.name}</option>)}
                      </select>
                    </label>
                  </ActionButton>
                )}
                {s.status === "OPEN" && (
                  <ActionButton
                    action={closeSlotAction}
                    fields={{ slotId: s.id }}
                    label="Close to sign-ups"
                    pendingLabel="Closing…"
                    variant="btn-ghost btn-sm"
                    confirm={{ text: "No one else can take a seat. Everyone already signed up stays scheduled; you can still place people by hand.", label: "Close it" }}
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
