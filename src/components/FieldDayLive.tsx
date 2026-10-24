"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Coffee, DoorOpen, LogIn, LogOut, PackageCheck, PackageOpen, PenLine, Play, RefreshCw, Smartphone, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { shiftState, workerAction, type FieldEvent, type ShiftFacts } from "@/lib/field-day";
import { stagingCheck, type QueuedAction } from "@/lib/offline-sync";
import { ConnectionPill } from "@/components/Moments";
import { pillState } from "@/lib/moments";
import { clockOffset, dismiss, enqueue, flush, isFlushing, pendingFor, prune, serverClock, subscribe, type Pending } from "@/lib/offline-queue";
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
      return `+${a.count} ${a.unit}`;
    case "return_packet":
      return `Packet ${a.packetId} returned`;
    case "hold_packet":
      return `Packet ${a.packetId} kept for next shift`;
    case "app_counts":
      return `${appLabel(a.app)} totals: ${a.doors} doors · ${a.contacts} contacts`;
  }
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [locating, setLocating] = useState(false);
  // "Keep until next shift" changes custody: it asks once before recording.
  const [keeping, setKeeping] = useState<string | null>(null);
  // Hydration-safe: the queue only exists in the browser.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

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
  const facts = useMemo(
    () => withPending(base, pending.filter((p) => !p.rejected && !shown.has(p.clientId)), mounted ? clockOffset() : 0, shift.carriedIn),
    [base, pending, shown, mounted, shift.carriedIn]
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

  function record(action: Action): boolean {
    // Judged on the server's clock (as of the last sync), like the server will.
    const out = workerAction(facts, action, serverClock());
    if (!out.ok) {
      setMessage({ ok: false, text: out.reason });
      return false;
    }
    const { stored } = enqueue(shift.userId, shift.shiftId, action);
    // Checking in is the moment the day starts: a firmer haptic and words that say so.
    const checkedIn = action.kind === "check_in";
    haptic(checkedIn ? "success" : "tap");
    setMessage(
      !stored
        ? { ok: false, text: "This phone's storage is full, so this is only kept while the page is open. Keep it open until it syncs." }
        : checkedIn
          ? { ok: true, text: navigator.onLine ? "You're checked in. The clock is running." : "Check-in saved on this phone. The clock started when you tapped; it'll sync when you have signal." }
          : { ok: true, text: navigator.onLine ? "Saved." : "Saved on this phone. It'll sync when you have signal." }
    );
    void sync();
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
  // The app's totals for the shift (C4.4): entered once the day's work is
  // done, on shift or after checking out; the newest entry replaces what
  // was logged by hand here.
  const app = shift.canvassApp;
  const appForm = !petition && app && !st.closeout && (
    <form
      key={`${st.appCounts?.doors ?? ""}-${st.appCounts?.contacts ?? ""}`}
      onSubmit={submit((fd) => ({ kind: "app_counts", app, doors: num(fd, "doors"), contacts: num(fd, "contacts") }))}
      className="space-y-2 rounded-xl border border-border p-3"
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
  const pill = !mounted ? null : pillState({ online, reachable: !((unreachable || problem) && waiting.length), syncing, waiting: waiting.length, refused: refused.length });
  const status = !pill
    ? null
    : {
        state: pill,
        text:
          pill === "refused"
            ? `${refused.length} couldn't be saved`
            : pill === "offline"
              ? waiting.length
                ? problem
                  ? `${problem} ${waiting.length} saved on this phone.`
                  : `No signal — ${waiting.length} saved on this phone`
                : "No signal — you can keep working"
              : pill === "syncing"
                ? "Syncing…"
                : pill === "waiting"
                  ? `${waiting.length} waiting to sync`
                  : "All saved",
      };

  return (
    <section className="card space-y-4" aria-label="Field day controls">
      {status && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ConnectionPill state={status.state} text={status.text} />
          {waiting.length > 0 && online && !syncing && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => void sync()}>
              <RefreshCw aria-hidden className="btn-icon" />
              Sync now
            </button>
          )}
        </div>
      )}
      {mounted && waiting.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {waiting.map((p) => (
            <li key={p.clientId}>
              {describe(p.action)} · {new Date(p.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · waiting to sync
            </li>
          ))}
        </ul>
      )}
      {mounted && refused.length > 0 && (
        <ul className="space-y-2">
          {refused.map((p) => (
            <li key={p.clientId} className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-semibold text-fg">{describe(p.action)}</span>{" "}
                <span className="text-muted">({new Date(p.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}) wasn&apos;t saved: {p.rejected}</span>
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
          <p className="text-muted-sm">{waiting.length ? "Checked out — it'll sync when you have signal." : "Checked out."}</p>
          {appForm}
        </div>
      ) : st.paused ? (
        <button type="button" className="btn-primary" onClick={() => record({ kind: "resume" })}>
          <Play aria-hidden className="btn-icon" />
          End break
        </button>
      ) : (
        <div className="space-y-5">
          {petition ? (
            <form onSubmit={submit((fd) => ({ kind: "log", unit: "signatures", count: num(fd, "count") }))} className="flex flex-wrap items-end gap-3">
              <label className="w-32 space-y-1.5">
                <span className="label">Signatures</span>
                <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required placeholder="5" />
              </label>
              <button className="btn-primary"><PenLine aria-hidden className="btn-icon" />Add signatures</button>
            </form>
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
          {waiting.length > 0 ? " including what's waiting to sync." : " including entries synced since this page loaded."}
        </p>
      )}
      {message && <p role="status" className={message.ok ? "text-success-msg" : "text-danger-msg"}>{message.text}</p>}
    </section>
  );
}
