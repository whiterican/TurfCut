"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { useSyncExternalStore } from "react";
import { ActionButton } from "@/components/ActionButton";
import { LocalTime } from "@/components/LocalTime";
import { claimSlotAction } from "@/app/shifts/actions";
import { SLOT_FIT_LABELS, seatsLeft, slotFit, slotStateLabel, sortForWorker, type SlotFacts, type SlotFit, type SlotState } from "@/lib/shift-slots";
import type { Availability } from "@/lib/availability";

export interface OpenShiftItem {
  id: string;
  job: { id: string; title: string; orgName: string };
  startsAt: string;
  endsAt: string;
  stagingLocation: string | null;
  notes: string | null;
  facts: Omit<SlotFacts, "startsAt" | "endsAt">;
  state: SlotState;
  blocked: string | null;
}

const noop = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Open shifts on the jobs the worker is hired on (M8.2). Their availability
 * only orders this list and labels each shift, in their own time zone, here
 * in their browser; nobody else sees it, and it never decides who gets a seat.
 */
export function OpenShiftList({ items, availability }: { items: OpenShiftItem[]; availability: Availability }) {
  // The server doesn't know the zone: it renders by state and time, the browser adds the fit.
  const zone = useSyncExternalStore(noop, browserZone, () => null);
  const withFit = items.map((s) => ({
    ...s,
    startsAt: new Date(s.startsAt),
    endsAt: new Date(s.endsAt),
    fit: (zone ? slotFit({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) }, availability, zone) : "unknown") as SlotFit,
  }));
  const sorted = sortForWorker(withFit);
  return (
    <ul className="space-y-3">
      {sorted.map((s) => {
        const left = seatsLeft({ ...s.facts, startsAt: s.startsAt, endsAt: s.endsAt });
        const b = slotStateLabel(s.state, left);
        return (
          <li key={s.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="eyebrow"><LocalTime iso={s.startsAt.toISOString()} mode="date" /></p>
                <p className="font-bold text-fg">{s.job.title}</p>
                <p className="text-muted-sm">
                  <LocalTime iso={s.startsAt.toISOString()} mode="time" /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
                  {s.stagingLocation ? ` · ${s.stagingLocation}` : ""} · {s.job.orgName}
                </p>
                {s.fit !== "unknown" && <p className="text-hint">{SLOT_FIT_LABELS[s.fit]}</p>}
                {s.notes && <p className="text-sm text-fg">{s.notes}</p>}
              </div>
              <StatusBadge status={b} />
            </div>
            {s.state === "open" &&
              (s.blocked ? (
                <p className="text-muted-sm">{s.blocked}</p>
              ) : (
                <ActionButton
                  action={claimSlotAction}
                  fields={{ slotId: s.id }}
                  label="Take a seat"
                  pendingLabel="Taking it…"
                  variant="btn-secondary btn-sm"
                  ariaLabel={`Take a seat: ${s.job.title}, ${s.startsAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(zone ? {} : { timeZone: "UTC" }) })}`}
                />
              ))}
          </li>
        );
      })}
    </ul>
  );
}
