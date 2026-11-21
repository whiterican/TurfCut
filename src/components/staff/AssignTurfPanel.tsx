"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { assignTurfAction } from "@/app/field/actions";
import { LocalTime } from "@/components/LocalTime";
import { TurfMap } from "@/components/TurfMap";
import { useTurfPick } from "@/components/staff/TurfPick";
import { MAX_SHIFTS_PER_ASSIGNMENT, saveOutcome } from "@/lib/turf-assign";

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
 * A turf already on the map can be the start (its card's button, or the one under the map for a tapped zone):
 * the panel opens with that turf drawn, to give to more shifts as it is or with its corners changed.
 * `names` is each turf's name on its card now, by zone id. Unnamed turfs are numbered by position, so a name
 * kept from the moment of the pick could come to mean another card after a save. A picked turf that no card
 * shows any more (its last shift was given other turf) is "this turf".
 */
export function AssignTurfPanel({ shifts, center, names = {} }: { shifts: AssignableShift[]; center: { lat: number; lng: number } | null; names?: Record<string, string> }) {
  // A turf picked on the map or a card opens the panel starting from it.
  const turfPick = useTurfPick();
  const preset = turfPick?.picked ?? null;
  const turfId = preset?.id ?? null;
  const presetName = preset ? names[preset.id] || "this turf" : "";
  // Counts the panel's changes of turf, for a save that comes back after the organizer has moved on (to another turf,
  // or away and back to the same one).
  const turfChanges = useRef(0);
  useEffect(() => {
    turfChanges.current += 1;
  }, [turfId]);
  const [open, setOpen] = useState(preset !== null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Where the map first looked: it must not jump while the organizer draws, whatever zones appear meanwhile.
  const [startCenter] = useState(center);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // While a save is on its way nothing here or on the cards can change the panel's turf or close it: an answer that
  // landed on another turf, or on a closed panel, was easy to miss or to wipe with the next pick.
  const setSaving = turfPick?.setSaving;
  useEffect(() => {
    setSaving?.(pending);
    return () => setSaving?.(false);
  }, [pending, setSaving]);
  const form = useRef<HTMLFormElement>(null);
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Every pick opens the panel, the same turf again and the first pick after Close too.
  const [seenNonce, setSeenNonce] = useState(preset?.nonce ?? 0);
  if (preset && preset.nonce !== seenNonce) {
    setSeenNonce(preset.nonce);
    setOpen(true);
  }
  // A different turf (or back to a blank map) starts over: the ticks and the last message were for the turf before.
  // Picking the same turf again keeps them, and keeps corners already moved.
  const [seenTurf, setSeenTurf] = useState(turfId);
  if (turfId !== seenTurf) {
    setSeenTurf(turfId);
    setPicked(new Set());
    setMsg(null);
  }
  // Focus follows the panel: to it when it opens or its turf changes (the button pressed is elsewhere on the page, or
  // has just gone), and back to "Assign turf" when it closes. Only a pick scrolls: it was made at the map or a card.
  const nonce = preset?.nonce ?? 0;
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open) {
      if (nonce) panel.current?.scrollIntoView({ block: "nearest" });
      panel.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [nonce, turfId, open]);

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
    const sentAt = turfChanges.current;
    start(async () => {
      // The answer belongs to the turf it was sent for; the panel may be on another by now, or closed (saveOutcome).
      const result = await assignTurfAction(ids, polygon).catch(() => null);
      const { msg: answer, clearTicks, reopen } = saveOutcome(turfChanges.current !== sentAt, result);
      setMsg(answer);
      if (clearTicks) setPicked(new Set());
      if (reopen) setOpen(true);
    });
  }

  if (!open) {
    return (
      <div>
        <button ref={opener} type="button" className="btn-secondary" onClick={() => setOpen(true)}>
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
          <h3 id="assign-turf-heading" className="text-base font-semibold">{preset ? `Assign ${presetName}` : "Assign turf"}</h3>
          <p className="text-hint">
            {preset ? "This turf is drawn below: keep it, or change its corners. Then tick whose shifts get it. Only the shifts you tick change." : "Draw the zone, then pick whose shifts get it."} A worker sees it on their shift. Nobody&apos;s position is used.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
          {preset && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => turfPick?.clear()}>
              Draw a new turf
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={pending}
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
        {/* Keyed by the turf: the map starts over from a newly picked turf, or blank again, instead of keeping the last drawing. */}
        <TurfMap key={turfId ?? "new"} editable allowStaging={false} turf={preset?.turf ?? null} center={startCenter} className="h-80" />
      </form>
      {/* Held still while a save is on its way: ticks made then would be cleared when it lands. */}
      <fieldset className="space-y-3" disabled={pending}>
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
                          {/* What the shift has now, by the turf's name: true whatever is drawn above, corners moved or not. */}
                          {preset && s.zoneId === preset.id ? ` · already has ${presetName}` : s.hasTurf && " · has turf (it will be replaced)"}
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
