"use client";

/**
 * The phone's queue of field actions (offline field day, M6). Every field
 * action goes through it, online or not: it's saved here first with the
 * time it happened, then sent to /api/shifts/:id/sync. What the server
 * saved stays (marked saved, never sent again) until the page's own data
 * shows it, so the screen doesn't flicker back; what it refused stays with
 * the reason until the worker dismisses it. Kept in localStorage per
 * signed-in user, so it survives the app closing; cleared on sign-out.
 */
import { MAX_BATCH, type QueuedAction } from "@/lib/offline-sync";

export interface Pending extends QueuedAction {
  shiftId: string;
  /** Set when the server refused it. */
  rejected?: string;
  /** When the server saved it (it's dropped once the page shows it). */
  savedAt?: number;
}

const PREFIX = "turfcut-queue:";
const CLOCK = "turfcut-clock";
/** Requests stay well under the server's limit. */
const CHUNK = Math.min(50, MAX_BATCH);
/** A saved entry the page never showed is dropped after this anyway. */
const SAVED_TTL_MS = 10 * 60_000;
const key = (userId: string) => `${PREFIX}${userId}`;
const listeners = new Set<() => void>();
let memory: Record<string, Pending[]> = {};

function read(userId: string): Pending[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as Pending[]) : (memory[userId] ?? []);
  } catch {
    return memory[userId] ?? [];
  }
}

/** Returns false when the phone couldn't store it (kept for this page only). */
function write(userId: string, items: Pending[]): boolean {
  memory = { ...memory, [userId]: items };
  let stored = true;
  try {
    if (items.length) localStorage.setItem(key(userId), JSON.stringify(items));
    else localStorage.removeItem(key(userId));
  } catch {
    stored = false; // storage full or blocked
  }
  listeners.forEach((l) => l());
  return stored;
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => (e.key?.startsWith(PREFIX) || e.key === CLOCK) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** A shift's entries, in the order they were recorded. */
export function pendingFor(userId: string, shiftId: string): Pending[] {
  return read(userId).filter((p) => p.shiftId === shiftId);
}

/** How many of this user's entries haven't reached the server yet. */
export function unsentCount(userId: string): number {
  return read(userId).filter((p) => !p.rejected && !p.savedAt).length;
}

export function enqueue(userId: string, shiftId: string, action: QueuedAction["action"]): { item: Pending; stored: boolean } {
  const item: Pending = { clientId: crypto.randomUUID(), at: Date.now(), shiftId, action };
  return { item, stored: write(userId, [...read(userId), item]) };
}

export function dismiss(userId: string, clientId: string) {
  write(userId, read(userId).filter((p) => p.clientId !== clientId));
}

/**
 * Drops saved entries the page now shows (their ids are in `shown`), and
 * any saved long enough ago that the page must have them.
 */
export function prune(userId: string, shown: Set<string>, now = Date.now()) {
  const items = read(userId);
  const keep = items.filter((p) => !p.savedAt || (!shown.has(p.clientId) && now - p.savedAt < SAVED_TTL_MS));
  if (keep.length !== items.length) write(userId, keep);
}

/** Everything a signed-out phone must forget. */
export function clearAll() {
  memory = {};
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k === CLOCK) localStorage.removeItem(k);
  } catch {
    // nothing stored
  }
  listeners.forEach((l) => l());
}

/**
 * The server's clock minus this phone's, from the last sync (0 before any).
 * The phone's own checks ("check-in opens at…") use it, so a phone whose
 * clock is off judges like the server does — even offline.
 */
export function clockOffset(): number {
  try {
    const v = Number(localStorage.getItem(CLOCK));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Now on the server's clock, as best this phone knows it. */
export const serverClock = () => new Date(Date.now() + clockOffset());

function saveOffset(serverNow: unknown, sentAt: number, gotAt: number) {
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
  try {
    localStorage.setItem(CLOCK, String(Math.round(serverNow - (sentAt + gotAt) / 2)));
  } catch {
    // not stored: checks use the phone's clock
  }
}

/**
 * What happened. `offline`: no answer (no signal, timeout, server trouble),
 * try again later. `problem`: an answer that isn't about any one entry
 * (e.g. signed out) — the entries wait, with this shown.
 */
export type FlushResult = { saved: number; rejected: number; offline: boolean; problem: string | null };

const inFlight = new Set<string>();

async function post(shiftId: string, batch: Pending[]): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    return await fetch(`/api/shifts/${shiftId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceNow: Date.now(), actions: batch.map(({ clientId, at, action }) => ({ clientId, at, action })) }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a shift's unsent actions, in the order recorded. Safe to call often. */
export async function flush(userId: string, shiftId: string): Promise<FlushResult> {
  const result: FlushResult = { saved: 0, rejected: 0, offline: false, problem: null };
  if (inFlight.has(shiftId)) return result;
  inFlight.add(shiftId);
  try {
    for (;;) {
      const batch = pendingFor(userId, shiftId).filter((p) => !p.rejected && !p.savedAt).slice(0, CHUNK);
      if (!batch.length) return result;
      const sentAt = Date.now();
      let res: Response;
      try {
        res = await post(shiftId, batch);
      } catch {
        return { ...result, offline: true };
      }
      const body = (await res.json().catch(() => null)) as { results?: Array<{ clientId: string; status: string; reason?: string }>; serverNow?: unknown; error?: string } | null;
      if (!res.ok || !body?.results) {
        // Only a malformed request is final for these entries; anything
        // else (signed out, a hiccup finding the shift, rate limits, server
        // trouble) leaves them waiting for the next try.
        if (res.status === 400) {
          const why = body?.error ?? "The server couldn't read these.";
          const ids = new Set(batch.map((b) => b.clientId));
          write(userId, read(userId).map((p) => (ids.has(p.clientId) ? { ...p, rejected: why } : p)));
          result.rejected += batch.length;
          continue;
        }
        if (res.status === 401 || res.status === 403) return { ...result, problem: "Sign in again to sync." };
        if (res.status === 404) return { ...result, problem: body?.error ?? "The server couldn't find this shift. It'll try again." };
        return { ...result, offline: true };
      }
      saveOffset(body.serverNow, sentAt, Date.now());
      const by = new Map(body.results.map((r) => [r.clientId, r]));
      const now = Date.now();
      write(
        userId,
        read(userId).map((p) => {
          const r = by.get(p.clientId);
          if (!r) return p;
          if (r.status === "rejected") {
            result.rejected++;
            return { ...p, rejected: r.reason ?? "Couldn't be saved." };
          }
          result.saved++;
          return { ...p, savedAt: now };
        })
      );
      // An answer without these entries would loop forever: stop here.
      if (!batch.some((b) => by.has(b.clientId))) return result;
    }
  } finally {
    inFlight.delete(shiftId);
  }
}

/** Sends every shift's unsent actions (e.g. from Today or My shifts). */
export async function flushAll(userId: string): Promise<FlushResult> {
  const shifts = [...new Set(read(userId).filter((p) => !p.rejected && !p.savedAt).map((p) => p.shiftId))];
  const total: FlushResult = { saved: 0, rejected: 0, offline: false, problem: null };
  for (const s of shifts) {
    const r = await flush(userId, s);
    total.saved += r.saved;
    total.rejected += r.rejected;
    total.offline ||= r.offline;
    total.problem ??= r.problem;
    if (r.offline || r.problem) break;
  }
  return total;
}
