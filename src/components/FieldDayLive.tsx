"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { shiftState, workerAction, type FieldEvent, type ShiftFacts } from "@/lib/field-day";
import { stagingCheck, type QueuedAction } from "@/lib/offline-sync";
import { clockOffset, dismiss, enqueue, flush, isFlushing, pendingFor, prune, serverClock, subscribe, type Pending } from "@/lib/offline-queue";
import { haptic } from "@/lib/haptics";
import { refreshSavedPage } from "@/components/OfflineBrief";

export interface LiveShift {
  shiftId: string;
  userId: string;
  workType: "PETITION" | "CANVASS";
  status: ShiftFacts["status"];
  startsAt: string;
  endsAt: string;
  staging: { lat: number; lng: number } | null;
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
function withPending(base: ShiftFacts, pending: Pending[], offset: number): ShiftFacts {
  let f = base;
  for (const p of pending) {
    const at = new Date(p.at + offset);
    const out = workerAction(f, p.action, at);
    if (!out.ok || !out.event) continue;
    const ev: FieldEvent = { type: out.event.type, payload: out.event.payload, actorId: null, createdAt: at };
    f = { ...f, events: [...f.events, ev], status: out.status ?? f.status };
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
    }),
    [shift]
  );
  // Entries the page already shows (saved and reloaded) aren't replayed again.
  const shown = useMemo(() => new Set(shift.events.map((e) => e.clientId).filter((x): x is string => !!x)), [shift.events]);
  const facts = useMemo(
    () => withPending(base, pending.filter((p) => !p.rejected && !shown.has(p.clientId)), mounted ? clockOffset() : 0),
    [base, pending, shown, mounted]
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
    haptic();
    setMessage(
      !stored
        ? { ok: false, text: "This phone's storage is full, so this is only kept while the page is open. Keep it open until it syncs." }
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
  const status = !mounted
    ? null
    : refused.length
      ? { tone: "badge-coral", text: `${refused.length} couldn't be saved` }
      : waiting.length
        ? problem
          ? { tone: "badge-butter", text: `${problem} ${waiting.length} saved on this phone.` }
          : !online || unreachable
          ? { tone: "badge-butter", text: `No signal — ${waiting.length} saved on this phone` }
          : { tone: "badge-sky", text: syncing ? "Syncing…" : `${waiting.length} waiting to sync` }
        : !online
          ? { tone: "badge-butter", text: "No signal — you can keep working" }
          : null;

  return (
    <section className="card space-y-4" aria-label="Field day controls">
      {status && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span role="status" className={status.tone}>{status.text}</span>
          {waiting.length > 0 && online && !syncing && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => void sync()}>
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
        <p className="text-muted-sm">{waiting.length ? "Checked out — it'll sync when you have signal." : "Checked out."}</p>
      ) : st.paused ? (
        <button type="button" className="btn-primary" onClick={() => record({ kind: "resume" })}>
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
              <button className="btn-primary">Add signatures</button>
            </form>
          ) : (
            <>
              <form onSubmit={submit((fd) => ({ kind: "log", unit: "doors", count: num(fd, "count") }))} className="flex flex-wrap items-end gap-3">
                <label className="w-32 space-y-1.5">
                  <span className="label">Doors knocked</span>
                  <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
                </label>
                <button className="btn-primary">Add doors</button>
              </form>
              <form onSubmit={submit((fd) => ({ kind: "log", unit: "contacts", count: num(fd, "count") }))} className="flex flex-wrap items-end gap-3">
                <label className="w-32 space-y-1.5">
                  <span className="label">Contacts</span>
                  <input name="count" inputMode="numeric" pattern="[0-9]*" className="field" required />
                </label>
                <button className="btn-secondary">Add contacts</button>
              </form>
            </>
          )}
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
              <button className="btn-secondary">Return packet {packetId}</button>
            </form>
          ))}
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            <button type="button" className="btn-secondary" onClick={() => record({ kind: "pause" })}>
              Take a break
            </button>
            <button type="button" className="btn-primary" disabled={st.packetsOut.length > 0} onClick={() => record({ kind: "check_out" })}>
              Check out
            </button>
          </div>
          {st.packetsOut.length > 0 && <p className="text-hint">Return your packets before checking out.</p>}
        </div>
      )}
      {live && (waiting.length > 0 || savedUnseen) && (
        <p className="text-hint">
          On this phone: {petition ? `${st.signatures} signatures` : `${st.doors} doors · ${st.contacts} contacts`}
          {waiting.length > 0 ? " including what's waiting to sync." : " including entries synced since this page loaded."}
        </p>
      )}
      {message && <p role="status" className={message.ok ? "text-success-msg" : "text-danger-msg"}>{message.text}</p>}
    </section>
  );
}
