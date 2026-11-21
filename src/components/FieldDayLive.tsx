"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Coffee, DoorOpen, LogIn, LogOut, PackageCheck, PackageOpen, PenLine, Play, Plus, RefreshCw, Smartphone, Undo2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { AREA_CONSENT_VERSION, shiftState, snapArea, workerAction, type FieldEvent, type ShiftFacts } from "@/lib/field-day";
import { stagingCheck, type QueuedAction } from "@/lib/offline-sync";
import { ConnectionPill } from "@/components/Moments";
import { entryMessage, pillState, pillText, sendState } from "@/lib/moments";
import { clockOffset, dismiss, enqueue, flush, isFlushing, memoryOnlyFor, pendingFor, prune, serverClock, subscribe, type Pending } from "@/lib/offline-queue";
import { haptic } from "@/lib/haptics";
import { appLabel, type CanvassApp } from "@/lib/job-tools";
import { refreshSavedPage } from "@/components/OfflineBrief";

export interface LiveShift {
  shiftId: string;
  userId: string;
  workType: "PETITION" | "CANVASS";
  status: ShiftFacts["status"];
  startsAt: string;
  endsAt: string;
  staging: { lat: number; lng: number; radiusM: number } | null;
  /** Packets kept from the worker's last shift on this job (C4.5): they come out at check-in, so the phone shows them as the server will. */
  carriedIn: Array<{ packetId: string; sheets: number | null; carriedFrom: string }>;
  /** The app the job's canvassing runs in (C4.4): its totals are entered at the end of the shift. */
  canvassApp: CanvassApp | null;
  /** The scheduled end had passed when the page was made. */
  ended: boolean;
  events: Array<{ id: string; type: string; payload: unknown; clientId: string | null; createdAt: string }>;
  validations: Array<{ workEventId: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED"; reason: string | null; createdAt: string }>;
}

type Action = QueuedAction["action"];

const noop = () => () => {};

/**
 * The shift as the phone sees it: the server's events plus entries not on
 * the page yet (waiting, or saved since it loaded), in the order recorded,
 * on the server's clock.
 */
function withPending(base: ShiftFacts, pending: Pending[], offset: number, carriedIn: LiveShift["carriedIn"] = []): ShiftFacts {
  let f = base;
  for (const p of pending) {
    const at = new Date(p.at + offset);
    const out = workerAction(f, p.action, at);
    if (!out.ok || !out.event) continue;
    const ev: FieldEvent = { type: out.event.type, payload: out.event.payload, actorId: null, createdAt: at };
    f = { ...f, events: [...f.events, ev], status: out.status ?? f.status };
    // The packets kept from the last shift come out with the check-in, as the server records them.
    if (p.action.kind === "check_in") {
      const carried: FieldEvent[] = carriedIn.map((c, i) => ({ type: "PACKET_PICKUP", payload: { packetId: c.packetId, sheets: c.sheets, carriedFrom: c.carriedFrom }, actorId: null, createdAt: new Date(at.getTime() + i + 1) }));
      f = { ...f, events: [...f.events, ...carried] };
    }
  }
  return f;
}

/** The tally's pending send, per shift (a timer, not render state). */
const tallySends = new Map<string, ReturnType<typeof setTimeout>>();

/** One of each counted unit, for "+1 signature". */
const ONE = { signatures: "signature", doors: "door", contacts: "contact" } as const;

/**
 * The entries waiting to be sent, as lines: a run of counts of the same unit is one line ("+12 signatures",
 * from the first one's time), so a tally kept with no signal doesn't push the +1 button down the page a line per tap.
 */
export function waitingLines(waiting: Pick<Pending, "clientId" | "action" | "at">[]): Array<{ key: string; what: string; at: number }> {
  const lines: Array<{ key: string; what: string; at: number; unit?: string; count?: number }> = [];
  for (const p of waiting) {
    const a = p.action as Action;
    const last = lines[lines.length - 1];
    if (a.kind === "log" && last?.unit === a.unit && last.count !== undefined) {
      last.count += a.count;
      last.what = describe({ ...a, count: last.count });
    } else if (a.kind === "log") lines.push({ key: p.clientId, what: describe(a), at: p.at, unit: a.unit, count: a.count });
    else lines.push({ key: p.clientId, what: describe(a), at: p.at });
  }
  return lines.map(({ key, what, at }) => ({ key, what, at }));
}

function describe(a: Action): string {
  switch (a.kind) {
    case "check_in":
      return "Check-in";
    case "pause":
      return "Break started";
    case "resume":
      return "Break ended";
    case "check_out":
      return "Check-out";
    case "log":
      return `+${a.count} ${a.count === 1 ? ONE[a.unit] : a.unit}`;
    case "undo_signature":
      return "1 signature taken back";
    case "share_area":
      return a.on ? "Area sharing on" : "Area sharing off";
    case "return_packet":
      return `Packet ${a.packetId} returned`;
    case "hold_packet":
      return `Packet ${a.packetId} kept for next shift`;
    case "app_counts":
      return `${appLabel(a.app)} totals: ${a.doors} doors · ${a.contacts} contacts`;
  }
}

/** An entry's time; with the day when it wasn't today (a refusal can be about an older entry). */
function when(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true
  );
}

/**
 * The worker's field-day controls. Every action is saved on the phone
 * first and sent when there's signal (lib/offline-queue), so the field loop
 * keeps working in dead zones; the controls update right away.
 */
export function FieldDayLive({ shift, beforeCheckIn }: { shift: LiveShift; beforeCheckIn?: React.ReactNode }) {
  const router = useRouter();
  const online = useOnline();
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(pendingFor(shift.userId, shift.shiftId)),
    () => "[]"
  );
  const pending = useMemo(() => JSON.parse(snapshot) as Pending[], [snapshot]);
  const [syncing, setSyncing] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The latest thing to say under the controls: a refusal on the phone, or the
  // entry just recorded, whose words follow its real state (S1).
  const [note, setNote] = useState<{ kind: "refused"; text: string } | { kind: "entry"; id: string; what: string; checkIn: boolean } | null>(null);
  const [locating, setLocating] = useState(false);
  // "Keep until next shift" changes custody: it asks once before recording.
  const [keeping, setKeeping] = useState<string | null>(null);
  // Hydration-safe: the queue only exists in the browser.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // The phone couldn't store the latest entries: only this page holds them, and the pill must say so (P0).
  const memoryOnly = useSyncExternalStore(subscribe, () => memoryOnlyFor(shift.userId), () => false);

  const base = useMemo<ShiftFacts>(
    () => ({
      status: shift.status,
      startsAt: new Date(shift.startsAt),
      endsAt: new Date(shift.endsAt),
      workType: shift.workType,
      events: shift.events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, actorId: null, createdAt: new Date(e.createdAt) })),
      validations: shift.validations.map((v) => ({ ...v, createdAt: new Date(v.createdAt) })),
      canvassApp: shift.canvassApp,
    }),
    [shift]
  );
  // Entries the page already shows (saved and reloaded) aren't replayed again.
  const shown = useMemo(() => new Set(shift.events.map((e) => e.clientId).filter((x): x is string => !!x)), [shift.events]);
  // Entry times on the server's clock, as the activity log shows them.
  const offset = mounted ? clockOffset() : 0;
  const facts = useMemo(
    () => withPending(base, pending.filter((p) => !p.rejected && !shown.has(p.clientId)), offset, shift.carriedIn),
    [base, pending, shown, offset, shift.carriedIn]
  );
  const st = shiftState(facts);
  const waiting = pending.filter((p) => !p.rejected && !p.savedAt);
  const refused = pending.filter((p) => p.rejected);

  // Forget saved entries once the page shows them.
  useEffect(() => prune(shift.userId, shown), [shift.userId, shown]);
  // Saved entries the page doesn't show yet (synced here, from another tab
  // or from Today) need its fresh data. Refresh once per set of them, and
  // again when signal comes back: a failed refresh makes Next.js reload the
  // page (from the copy saved for dead zones), and the reloaded page must
  // not try again straight away. The entries stay on screen meanwhile.
  const savedUnseen = pending.filter((p) => p.savedAt && !shown.has(p.clientId)).map((p) => p.clientId).join(",");
  const triedKey = `turfcut-refreshed:${shift.shiftId}`;
  // One more try each time signal returns or the app comes back to the front.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const again = () => {
      try {
        sessionStorage.removeItem(triedKey);
      } catch {
        // nothing remembered
      }
      setRetry((n) => n + 1);
    };
    const onVisible = () => document.visibilityState === "visible" && again();
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [triedKey]);
  useEffect(() => {
    if (!savedUnseen || !online) return;
    try {
      if (sessionStorage.getItem(triedKey) === savedUnseen) return; // tried for these already
      sessionStorage.setItem(triedKey, savedUnseen);
    } catch {
      return; // can't remember the try: don't risk a reload loop (the entries stay on screen)
    }
    router.refresh();
  }, [savedUnseen, online, retry, router, triedKey]);

  const sync = useCallback(async () => {
    if (!pendingFor(shift.userId, shift.shiftId).some((p) => !p.rejected && !p.savedAt)) return;
    // Another send for this shift is under way: leave the badge as it is.
    if (isFlushing(shift.shiftId)) return;
    setSyncing(true);
    const r = await flush(shift.userId, shift.shiftId);
    setSyncing(false);
    if (r.busy) return;
    setUnreachable(r.offline);
    setProblem(r.problem);
    // (The page refreshes itself once saved entries are waiting to show.)
    // The copy saved for dead zones should show what just synced too.
    if (r.saved > 0) refreshSavedPage(shift.userId, `/shifts/${shift.shiftId}`);
  }, [shift.shiftId, shift.userId]);

  // Send whenever there's a chance: on load, when signal returns, when the
  // app comes back to the front, and every 20 seconds while anything waits.
  useEffect(() => {
    const first = setTimeout(() => void sync(), 0);
    const onBack = () => document.visibilityState === "visible" && void sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onBack);
    const t = setInterval(() => void sync(), 20_000);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onBack);
      clearInterval(t);
      clearTimeout(first);
    };
  }, [sync]);

  // The tally sends after a short pause in the tapping, not on every tap: one send for a burst, well inside
  // the sync route's limit (60 a minute), and one refresh of the page instead of one per signature.
  // Leaving the page with a burst still waiting sends it now (flush needs no component), so the board doesn't lag.
  useEffect(
    () => () => {
      const waiting = tallySends.get(shift.shiftId);
      if (waiting === undefined) return;
      clearTimeout(waiting);
      tallySends.delete(shift.shiftId);
      void flush(shift.userId, shift.shiftId);
    },
    [shift.shiftId, shift.userId],
  );

  function record(action: Action, o: { what?: string; batched?: boolean } = {}): boolean {
    // Judged on the server's clock (as of the last sync), like the server will.
    const out = workerAction(facts, action, serverClock());
    if (!out.ok) {
      setNote({ kind: "refused", text: out.reason });
      return false;
    }
    const { item } = enqueue(shift.userId, shift.shiftId, action);
    // A tick now; the firmer success buzz waits until a check-in is recorded.
    haptic("tap");
    const checkIn = action.kind === "check_in";
    setNote({ kind: "entry", id: item.clientId, what: o.what ?? (checkIn ? `Check-in at ${when(item.at + clockOffset())}` : describe(action)), checkIn });
    if (o.batched) {
      clearTimeout(tallySends.get(shift.shiftId));
      tallySends.set(shift.shiftId, setTimeout(() => {
        tallySends.delete(shift.shiftId);
        void sync();
      }, 1500));
    } else void sync();
    return true;
  }

  function checkIn() {
    if (!shift.staging || !navigator.geolocation) return record({ kind: "check_in", location: { checked: false } });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // Compared here and dropped: only yes/no and a band are kept.
        record({ kind: "check_in", location: stagingCheck(shift.staging, { lat: pos.coords.latitude, lng: pos.coords.longitude }) });
      },
      () => {
        setLocating(false);
        record({ kind: "check_in", location: { checked: false } });
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  }

  const num = (fd: FormData, k: string) => (/^\d+$/.test(String(fd.get(k) ?? "").trim()) ? Number(String(fd.get(k)).trim()) : NaN);
  const submit = (build: (fd: FormData) => Action) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (record(build(new FormData(form)))) form.reset();
  };

  const live = !!st.checkedInAt && !st.checkedOutAt;
  const petition = shift.workType === "PETITION";
  // Area sharing (F2, opt-in): while it's on, the phone keeps only the grid cell it's in (about 1 km), in memory,
  // and each signature takes that cell if it's recent. The position itself is never stored or sent.
  const cell = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [areaProblem, setAreaProblem] = useState<string | null>(null);
  // Not watched on a break: no signature can be added then, so there is nothing to note an area for.
  const sharing = petition && live && st.sharingArea && !st.paused;
  useEffect(() => {
    cell.current = null;
    if (!sharing || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = snapArea({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        cell.current = c && { ...c, at: Date.now() };
        setAreaProblem(null);
      },
      (err) => {
        cell.current = null;
        setAreaProblem(
          err.code === err.PERMISSION_DENIED
            ? "Your phone isn't letting Turfcut see its location, so signatures are counted without an area. You can allow it in the phone's settings."
            : "Can't find your area right now. Signatures are counted without one until it's found."
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [sharing]);
  // Only after hydration: the server has no navigator.
  const areaNote = !mounted || !sharing ? null : (areaProblem ?? (!("geolocation" in navigator) ? "This phone can't share its area. Signatures are counted without one." : null));
  // The switch, on a break too ("turn it off any time"). Opt-in, this shift only, off by default (Caden, Nov 21).
  // These words are version AREA_CONSENT_VERSION, sent with the choice: change them, raise it.
  const areaSwitch = petition && live && (
    <div className="space-y-1.5">
      <label className="toggle">
        <input
          type="checkbox"
          role="switch"
          switch=""
          checked={st.sharingArea}
          aria-describedby="area-sharing-hint"
          onChange={(e) => record({ kind: "share_area", on: e.target.checked, consent: AREA_CONSENT_VERSION })}
        />
        Share my area with my manager
      </label>
      <p id="area-sharing-hint" className="text-hint">
        {st.sharingArea ? "On for this shift. Each" : "Off. If you turn it on, just for this shift, each"} signature you add notes the area you&apos;re in, a square about 1 km across, never your exact spot. Each one&apos;s area is kept in the
        shift&apos;s record, and your manager and the campaign&apos;s field staff see the latest while you&apos;re on shift. Turn it off any time.
      </p>
      {areaNote && <p className="text-hint">{areaNote}</p>}
    </div>
  );
  /** The area a signature takes now: the cell from the last five minutes, or none. */
  const areaNow = () => (sharing && cell.current && Date.now() - cell.current.at < 5 * 60_000 ? { lat: cell.current.lat, lng: cell.current.lng } : undefined);
  // The app's totals for the shift (C4.4): entered once the day's work is
  // done, on shift or after checking out; the newest entry replaces what
  // was logged by hand here.
  const app = shift.canvassApp;
  const appForm = !petition && app && !st.closeout && (
    <form
      key={`${st.appCounts?.doors ?? ""}-${st.appCounts?.contacts ?? ""}`}
      onSubmit={submit((fd) => ({ kind: "app_counts", app, doors: num(fd, "doors"), contacts: num(fd, "contacts") }))}
      className="space-y-2 rounded-[var(--radius-inner)] border border-border p-3"
      aria-labelledby="app-totals-heading"
      aria-describedby="app-totals-hint"
    >
      <p id="app-totals-heading" className="text-sm font-semibold text-fg">{st.appCounts ? `Totals from ${appLabel(app)}: ${st.appCounts.doors} doors · ${st.appCounts.contacts} contacts` : `Totals from ${appLabel(app)}`}</p>
      <p id="app-totals-hint" className="text-hint">At the end of the day, copy the shift totals the app shows. They replace what you logged by hand here.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="w-28 space-y-1.5">
          <span className="label">Doors</span>
          <input name="doors" inputMode="numeric" pattern="[0-9]*" className="field" required defaultValue={st.appCounts?.doors} />
        </label>
        <label className="w-28 space-y-1.5">
          <span className="label">Contacts</span>
          <input name="contacts" inputMode="numeric" pattern="[0-9]*" className="field" required defaultValue={st.appCounts?.contacts} />
        </label>
        <button className="btn-secondary"><Smartphone aria-hidden className="btn-icon" />{st.appCounts ? "Update totals" : "Enter totals"}</button>
      </div>
    </form>
  );
  // One pill, always there once the page is live on the phone, sliding between states (P1.4).
  const send = sendState({ syncing, online, unreachable, problem: !!problem });
  const pill = !mounted ? null : pillState({ online, reachable: !((unreachable || problem) && waiting.length), syncing, waiting: waiting.length, refused: refused.length, memoryOnly });
  // The pill's lead names why entries wait (no signal, can't connect, a problem), not a retry under way.
  const status = pill && { state: pill, text: pillText(pill, { waiting: waiting.length, refused: refused.length, send: sendState({ syncing: false, online, unreachable, problem: !!problem }) }) };
  // Worked out from the queue on every render, so it can't stick on "Sending…"
  // when Today's send, another tab or a failed try decided otherwise.
  const noted = note?.kind === "entry" ? pending.find((p) => p.clientId === note.id) : undefined;
  const message =
    note?.kind === "refused"
      ? { tone: "problem" as const, text: note.text }
      : note && entryMessage({ what: note.what, entry: noted, shownOnPage: shown.has(note.id), stored: !memoryOnly, send });
  // The check-in recorded: now the day has started, a firmer buzz.
  const checkInRecorded = note?.kind === "entry" && note.checkIn && (noted ? !!noted.savedAt : shown.has(note.id)) ? note.id : null;
  useEffect(() => {
    if (checkInRecorded) haptic("success");
  }, [checkInRecorded]);

  return (
    <section className="card space-y-4" aria-label="Field day controls">
      {status && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ConnectionPill state={status.state} text={status.text} waiting={waiting.length} />
          {waiting.length > 0 && online && !syncing && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => void sync()}>
              <RefreshCw aria-hidden className="btn-icon" />
              Send now
            </button>
          )}
        </div>
      )}
      {mounted && problem && waiting.length > 0 && <p className="text-hint">{problem}</p>}
      {mounted && waiting.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {waitingLines(waiting).map((l) => (
            <li key={l.key}>
              {l.what} · {when(l.at + offset)} · {memoryOnly ? "only on this page" : "not sent yet"}
            </li>
          ))}
        </ul>
      )}
      {mounted && refused.length > 0 && (
        <ul className="space-y-2">
          {refused.map((p) => (
            <li key={p.clientId} className="flex items-start justify-between gap-3 rounded-[var(--radius-inner)] border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-semibold text-fg">{describe(p.action)}</span>{" "}
                <span className="text-muted">({when(p.at + offset)}) wasn&apos;t recorded: {p.rejected}</span>
              </span>
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => dismiss(shift.userId, p.clientId)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}

      {st.cancelled ? (
        <p className="text-muted-sm">This shift was cancelled.</p>
      ) : !st.checkedInAt && shift.ended ? (
        <p className="text-muted-sm">This shift has ended without a check-in.</p>
      ) : !st.checkedInAt ? (
        <div className="space-y-2">
          <button type="button" onClick={checkIn} className="btn-primary w-full sm:w-auto" disabled={locating}>
            <LogIn aria-hidden className="btn-icon" />
            {locating ? "Checking location…" : "Check in"}
          </button>
          {shift.staging && (
            <p className="text-hint">
              Your phone compares its location with the staging point once, right here. Only &ldquo;at staging: yes/no&rdquo; is kept — never where you were. Works without signal.
            </p>
          )}
          {!waiting.length && beforeCheckIn}
        </div>
      ) : st.checkedOutAt ? (
        <div className="space-y-4">
          <p className="text-muted-sm">{waiting.length ? `Checked out. ${waiting.length} not sent yet — ${memoryOnly ? "only on this page" : "saved on this phone"}.` : "Checked out."}</p>
          {appForm}
        </div>
      ) : st.paused ? (
        <div className="space-y-5">
          <button type="button" className="btn-primary" onClick={() => record({ kind: "resume" })}>
            <Play aria-hidden className="btn-icon" />
            End break
          </button>
          {areaSwitch}
        </div>
      ) : (
        <div className="space-y-5">
          {petition ? (
            <>
              {/* The tally (Caden, Nov 17): one tap per signature, counted on this phone first, so it works without signal.
                  Each tap is its own entry in the shift's record. A tap too many is taken back with a new entry (Caden, Nov 21):
                  the +1 stays in the record, and the supervisor still corrects any count at review. */}
              <div className="signature-tally">
                <div className="min-w-0">
                  <p>
                    <span className="label block">Signatures this shift</span>
                    <span className="signature-tally-figure">{st.signatures}</span>
                  </p>
                  {/* Small and away from the +1, so taking one back is never the tap that was meant for adding one. Always there
                      (marked off at none, not disabled, so focus stays on it; a tap then says there's none to take back), so the +1
                      doesn't move on the first tap and focus isn't lost taking back the last one. */}
                  <button
                    type="button"
                    className="btn-ghost btn-sm signature-tally-undo"
                    aria-disabled={st.signatures < 1}
                    onClick={() => record({ kind: "undo_signature" }, { what: `Signature ${st.signatures} taken back`, batched: true })}
                    aria-label="Take back 1 signature"
                  >
                    <Undo2 aria-hidden className="btn-icon" />
                    Take back 1
                  </button>
                </div>
                {/* The message names the running count ("Signature 18"), so each tap reads differently and is announced. */}
                <button
                  type="button"
                  className="btn-primary signature-tally-plus"
                  onClick={() => record({ kind: "log", unit: "signatures", count: 1, area: areaNow() }, { what: `Signature ${st.signatures + 1}`, batched: true })}
                  aria-label="+1 signature"
                >
                  <Plus aria-hidden className="size-7" />1
                </button>
              </div>
              {areaSwitch}
              <form onSubmit={(e) => submit((fd) => ({ kind: "log", unit: "signatures", count: num(fd, "count"), area: areaNow() }))(e)} className="flex flex-wrap items-end gap-3">
                <label className="w-32 space-y-1.5">
                  <span className="label">Several at once</span>
                  <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required placeholder="5" />
                </label>
                <button className="btn-secondary"><PenLine aria-hidden className="btn-icon" />Add signatures</button>
              </form>
            </>
          ) : (
            <>
              <form onSubmit={submit((fd) => ({ kind: "log", unit: "doors", count: num(fd, "count") }))} className="flex flex-wrap items-end gap-3">
                <label className="w-32 space-y-1.5">
                  <span className="label">Doors knocked</span>
                  <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
                </label>
                <button className="btn-primary"><DoorOpen aria-hidden className="btn-icon" />Add doors</button>
              </form>
              <form onSubmit={submit((fd) => ({ kind: "log", unit: "contacts", count: num(fd, "count") }))} className="flex flex-wrap items-end gap-3">
                <label className="w-32 space-y-1.5">
                  <span className="label">Contacts</span>
                  <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
                </label>
                <button className="btn-secondary"><UserCheck aria-hidden className="btn-icon" />Add contacts</button>
              </form>
            </>
          )}
          {appForm}
          {st.packetsOut.map((packetId) => (
            <form
              key={packetId}
              onSubmit={submit((fd) => ({ kind: "return_packet", packetId, sheetsReturned: num(fd, "sheetsReturned"), signatures: num(fd, "signatures") }))}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="w-32 space-y-1.5">
                <span className="label">Sheets returned</span>
                <input name="sheetsReturned" inputMode="numeric" pattern="[0-9]*" className="field" required />
              </label>
              <label className="w-32 space-y-1.5">
                <span className="label">Signatures on it</span>
                <input name="signatures" inputMode="numeric" pattern="[0-9]*" className="field" required />
              </label>
              <button className="btn-secondary"><PackageCheck aria-hidden className="btn-icon" />Return packet {packetId}</button>
              {keeping === packetId ? (
                <span className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={`Keep packet ${packetId}?`}>
                  <span>Keep {packetId} until your next shift on this job? Return it instead if you&apos;re handing it in now.</span>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setKeeping(null);
                      record({ kind: "hold_packet", packetId });
                    }}
                  >
                    Yes, keep {packetId}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" autoFocus onClick={() => setKeeping(null)}>
                    No
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => setKeeping(packetId)}>
                  <PackageOpen aria-hidden className="btn-icon" />Keep {packetId} until next shift
                </button>
              )}
            </form>
          ))}
          {st.packetsHeld.length > 0 && (
            <p className="text-hint">
              Kept for your next shift on this job: packet{st.packetsHeld.length > 1 ? "s" : ""} {st.packetsHeld.join(", ")}. {st.packetsHeld.length > 1 ? "They come" : "It comes"} back out when you check in; the sheets stay with you until then. Handing {st.packetsHeld.length > 1 ? "one" : "it"} in now? Return it below.
            </p>
          )}
          {st.packetsHeld.map((packetId) => (
            <form
              key={`held-${packetId}`}
              onSubmit={submit((fd) => ({ kind: "return_packet", packetId, sheetsReturned: num(fd, "sheetsReturned"), signatures: num(fd, "signatures") }))}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="w-32 space-y-1.5">
                <span className="label">Sheets returned</span>
                <input name="sheetsReturned" inputMode="numeric" pattern="[0-9]*" className="field" required />
              </label>
              <label className="w-32 space-y-1.5">
                <span className="label">Signatures on it</span>
                <input name="signatures" inputMode="numeric" pattern="[0-9]*" className="field" required />
              </label>
              <button className="btn-ghost"><PackageCheck aria-hidden className="btn-icon" />Return kept packet {packetId}</button>
            </form>
          ))}
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <button type="button" className="btn-secondary" onClick={() => record({ kind: "pause" })}>
              <Coffee aria-hidden className="btn-icon" />
              Take a break
            </button>
            <button type="button" className="btn-primary" disabled={st.packetsOut.length > 0} onClick={() => record({ kind: "check_out" })}>
              <LogOut aria-hidden className="btn-icon" />
              Check out
            </button>
          </div>
          {st.packetsOut.length > 0 && <p className="text-hint">Return your packets, or keep them for your next shift, before checking out.</p>}
        </div>
      )}
      {live && (waiting.length > 0 || savedUnseen) && (
        <p className="text-hint">
          On this phone: {petition ? `${st.signatures} signatures` : `${st.doors} doors · ${st.contacts} contacts${st.appCounts ? `, from ${appLabel(st.appCounts.app as CanvassApp)}` : ""}`}
          {waiting.length > 0 ? " including what hasn't been sent yet." : " including entries sent since this page loaded."}
        </p>
      )}
      {message && <p role="status" className={message.tone === "done" ? "text-success-msg" : message.tone === "problem" ? "text-danger-msg" : "text-sm text-fg"}>{message.text}</p>}
    </section>
  );
}
