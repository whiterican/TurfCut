"use client";

/**
 * The phone's queue of field actions (offline field day, M6). Every field
 * action goes through it, online or not: it's saved here first with the
 * time it happened, then sent to /api/shifts/:id/sync. What the server
 * saved (or already had) is dropped; what it refused stays with the reason
 * until the worker dismisses it. Kept in localStorage per signed-in user,
 * so it survives the app closing; cleared on sign-out.
 */
import type { QueuedAction } from "@/lib/offline-sync";

export interface Pending extends QueuedAction {
  shiftId: string;
  /** Set when the server refused it. */
  rejected?: string;
}

const PREFIX = "turfcut-queue:";
const key = (userId: string) => `${PREFIX}${userId}`;
const listeners = new Set<() => void>();
let memory: Record<string, Pending[]> = {};

function read(userId: string): Pending[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as Pending[]) : [];
  } catch {
    return memory[userId] ?? [];
  }
}

function write(userId: string, items: Pending[]) {
  memory = { ...memory, [userId]: items };
  try {
    if (items.length) localStorage.setItem(key(userId), JSON.stringify(items));
    else localStorage.removeItem(key(userId));
  } catch {
    // Storage full or blocked: kept in memory for this page.
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(PREFIX) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function pendingFor(userId: string, shiftId: string): Pending[] {
  return read(userId).filter((p) => p.shiftId === shiftId);
}

export function enqueue(userId: string, shiftId: string, action: QueuedAction["action"]): Pending {
  const p: Pending = { clientId: crypto.randomUUID(), at: Date.now(), shiftId, action };
  write(userId, [...read(userId), p]);
  return p;
}

export function dismiss(userId: string, clientId: string) {
  write(userId, read(userId).filter((p) => p.clientId !== clientId));
}

/** Everything a signed-out phone must forget. */
export function clearAll() {
  memory = {};
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // nothing stored
  }
  listeners.forEach((l) => l());
}

export type FlushResult = { sent: number; saved: number; rejected: number; offline: boolean };

const inFlight = new Set<string>();

/** Sends a shift's waiting actions (oldest first). Safe to call often. */
export async function flush(userId: string, shiftId: string): Promise<FlushResult> {
  const waiting = pendingFor(userId, shiftId).filter((p) => !p.rejected).sort((a, b) => a.at - b.at);
  if (!waiting.length || inFlight.has(shiftId)) return { sent: 0, saved: 0, rejected: 0, offline: false };
  inFlight.add(shiftId);
  try {
    const res = await fetch(`/api/shifts/${shiftId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceNow: Date.now(), actions: waiting.map(({ clientId, at, action }) => ({ clientId, at, action })) }),
    });
    if (!res.ok) {
      // A refusal of the whole batch (e.g. signed out, shift gone): keep it and say so.
      if (res.status >= 400 && res.status < 500) {
        const why = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "The server refused these.";
        write(userId, read(userId).map((p) => (waiting.some((w) => w.clientId === p.clientId) ? { ...p, rejected: why } : p)));
        return { sent: waiting.length, saved: 0, rejected: waiting.length, offline: false };
      }
      return { sent: waiting.length, saved: 0, rejected: 0, offline: true };
    }
    const { results } = (await res.json()) as { results: Array<{ clientId: string; status: string; reason?: string }> };
    const by = new Map(results.map((r) => [r.clientId, r]));
    let saved = 0;
    let rejected = 0;
    const next: Pending[] = [];
    for (const p of read(userId)) {
      const r = by.get(p.clientId);
      if (!r) next.push(p);
      else if (r.status === "rejected") {
        rejected++;
        next.push({ ...p, rejected: r.reason ?? "Couldn't be saved." });
      } else saved++;
    }
    write(userId, next);
    return { sent: waiting.length, saved, rejected, offline: false };
  } catch {
    return { sent: waiting.length, saved: 0, rejected: 0, offline: true };
  } finally {
    inFlight.delete(shiftId);
  }
}
