"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { assignTurfAction } from "@/app/field/actions";
import { LocalTime } from "@/components/LocalTime";
import { TurfMap } from "@/components/TurfMap";
import { useTurfPick } from "@/components/staff/TurfPick";
import { MAX_SHIFTS_PER_ASSIGNMENT } from "@/lib/turf-assign";

export interface AssignableShift {
  id: string;
  worker: string;
  jobTitle: string;
  startsAt: string;
  endsAt: string;
  hasTurf: boolean;
  /** The zone id of the shift's turf now (the map's and the cards' id), so a picked turf can say which shifts already have it. */
  zoneId: string | null;
}

/**
 * Give turf to workers from the Field map (Caden, Nov 17): draw a zone, tick whose shifts get it, save.
 * Shifts that are over or cancelled are not offered. The server checks everything again and changes
 * all the ticked shifts or none. Nobody's position is involved: the zone is where the work is.
 * A turf already on the map can be the start (a tap on its zone, or its card's button): the panel opens
 * with that turf drawn, to give to more shifts as it is or with its corners changed.
 */
export function AssignTurfPanel({ shifts, center }: { shifts: AssignableShift[]; center: { lat: number; lng: number } | null }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Where the map first looked: it must not jump while the organizer draws, whatever zones appear meanwhile.
  const [startCenter] = useState(center);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const panel = useRef<HTMLElement>(null);
  // A turf picked on the map or a card opens the panel starting from it; each pick counts, the same turf twice too.
  const turfPick = useTurfPick();
  const preset = turfPick?.picked ?? null;
  const [seenPick, setSeenPick] = useState(preset?.nonce ?? 0);
  if (preset && preset.nonce !== seenPick) {
    setSeenPick(preset.nonce);
    setOpen(true);
    setMsg(null);
  }
  // The pick was made somewhere else on the page (the map above, a card beside it): bring the panel to it.
  useEffect(() => {
    if (preset && open) {
      panel.current?.scrollIntoView({ block: "nearest" });
      panel.current?.focus({ preventScroll: true });
    }
  }, [preset, open]);

  // A shift that finished or was cancelled while the panel was open leaves the list; it must leave the picks too,
  // or it would be counted, could not be unticked, and would fail the whole save.
  const offered = new Set(shifts.map((s) => s.id));
  const ids = [...picked].filter((id) => offered.has(id));

  const toggle = (id: string) => {
    setMsg(null);
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  function send(clear: boolean) {
    let polygon: unknown = null;
    if (!clear) {
      const raw = form.current ? String(new FormData(form.current).get("turfArea") ?? "") : "";
      if (!raw) return setMsg({ ok: false, text: "Draw the turf first: tap the map to add at least three corners." });
      try {
        polygon = JSON.parse(raw);
      } catch {
        return setMsg({ ok: false, text: "Couldn't read the turf. Clear it and draw it again." });
      }
    }
    start(async () => {
      try {
        const r = await assignTurfAction(ids, polygon);
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) setPicked(new Set());
      } catch {
        setMsg({ ok: false, text: "Couldn't save the turf. Nothing was changed. Try again." });
      }
    });
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
          Assign turf
        </button>
      </div>
    );
  }
  const jobs = [...new Set(shifts.map((s) => s.jobTitle))];
  const tooMany = ids.length > MAX_SHIFTS_PER_ASSIGNMENT;
  return (
    <section ref={panel} tabIndex={-1} className="card space-y-4 outline-none" aria-labelledby="assign-turf-heading">
      {/* On a phone the two buttons sit under the words, not beside them: beside, they squeezed the hint to a few words a line. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div>
          <h3 id="assign-turf-heading" className="text-base font-semibold">{preset ? `Assign ${preset.name}` : "Assign turf"}</h3>
          <p className="text-hint">
            {preset ? "This turf is drawn below: keep it, or change its corners. Then pick whose shifts get it." : "Draw the zone, then pick whose shifts get it."} A worker sees it on their shift. Nobody&apos;s position is used.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
          {preset && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => turfPick?.clear()}>
              Draw a new turf
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setOpen(false);
              turfPick?.clear();
            }}
          >
            Close
          </button>
        </div>
      </div>
      <form ref={form} onSubmit={(e) => e.preventDefault()} className="space-y-3">
        {/* Keyed by the pick: the map starts over from the picked turf, or blank again, instead of keeping the last drawing. */}
        <TurfMap key={preset ? `${preset.id}:${preset.nonce}` : "new"} editable allowStaging={false} turf={preset?.turf ?? null} center={startCenter} className="h-80" />
      </form>
      <fieldset className="space-y-3">
        <legend className="label">Whose shifts get this turf</legend>
        {jobs.map((job) => {
          const ofJob = shifts.filter((s) => s.jobTitle === job);
          const all = ofJob.every((s) => picked.has(s.id));
          return (
            <div key={job} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{job}</p>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setMsg(null);
                    setPicked((p) => {
                      const n = new Set(p);
                      for (const s of ofJob) {
                        if (all) n.delete(s.id);
                        else n.add(s.id);
                      }
                      return n;
                    });
                  }}
                >
                  {all ? "None" : "All"}
                </button>
              </div>
              <ul className="space-y-1">
                {ofJob.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-11 items-center gap-3">
                      <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                      <span className="min-w-0">
                        <span className="font-semibold">{s.worker}</span>{" "}
                        <span className="text-sm text-subtle">
                          <LocalTime iso={s.startsAt} mode="short" /> – <LocalTime iso={s.endsAt} mode="time" from={s.startsAt} />
                          {preset && s.zoneId === preset.id ? " · has this turf" : s.hasTurf && " · has turf (it will be replaced)"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={pending || ids.length === 0 || tooMany} onClick={() => send(false)}>
          {pending ? "Saving…" : ids.length === 0 ? "Give turf to the ticked shifts" : `Give turf to ${ids.length} ${ids.length === 1 ? "shift" : "shifts"}`}
        </button>
        <button type="button" className="btn-ghost" disabled={pending || ids.length === 0 || tooMany} onClick={() => send(true)}>
          Clear their turf
        </button>
        {tooMany && <span className="text-sm text-danger">Pick at most {MAX_SHIFTS_PER_ASSIGNMENT} at a time.</span>}
      </div>
      <p role={msg && !msg.ok ? "alert" : "status"} className={msg ? (msg.ok ? "text-sm font-semibold" : "text-sm text-danger") : "sr-only"}>
        {msg?.text ?? ""}
      </p>
    </section>
  );
}
