import type { TurfPolygon } from "@/lib/field-day";
import type { FieldRow } from "@/lib/field-view";

/**
 * P1.7: the organizer's live figures. The field page and the Desk hero poll
 * `/api/field/summary` every FIELD_POLL_MS while the tab is visible and
 * tween each figure to its new value. The summary is counts only: no shift
 * ids, no names, no positions. Turf zones carry the polygon the organizer
 * drew and how many of its shifts are on the ground, never who (decision 3).
 */

export const FIELD_POLL_MS = 10_000;

export interface FieldTotals {
  /** Shifts that have started or checked in early, finished ones included (the Desk's "under way"). */
  due: number;
  /** Of `due`, the ones that checked in at some point. */
  dueCheckedIn: number;
  /** Checked in and not out, or due now and not checked in (the field page's "under way"). */
  underWay: number;
  /** Of `underWay`, the ones that have checked in: on the ground right now. */
  onGround: number;
  /** Starting later in the window. */
  upcoming: number;
  signatures: number;
  doors: number;
  packetsOut: number;
}

export interface GroupTotals {
  /** `${jobId}\u0000${staging ?? ""}`, as groupField keys its groups. */
  key: string;
  total: number;
  checkedIn: number;
  packetsOut: number;
  packetsHeld: number;
  signatures: number;
}

export interface ZoneSummary {
  /** A hash of the polygon: stable across polls, meaningless on its own. */
  id: string;
  turf: TurfPolygon;
  /** Shifts in the window assigned this turf, cancelled ones aside. */
  total: number;
  /** Of them, on the ground right now (checked in and not out). */
  onGround: number;
}

export interface FieldSummary {
  /** When the server counted (ISO). */
  at: string;
  /** Changes whenever any shift's state does: the page then refreshes its lists. */
  version: string;
  today: FieldTotals;
  groups: GroupTotals[];
  zones: ZoneSummary[];
}

/** What the live summary is built from: the field page's rows (turf included). */
export type LiveRow = FieldRow;

/** FNV-1a, 32-bit, as 8 hex digits: a short stable key for a string. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const groupKey = (r: { jobId: string; staging: string | null }) => `${r.jobId}\u0000${r.staging ?? ""}`;

/** A zone's id: a hash of its polygon, the same wherever a turf is keyed (the map's zones, the Field map's cards). */
export const zoneId = (turf: TurfPolygon) => shortHash(JSON.stringify(turf.coordinates));

export const onGround = (r: LiveRow) => r.state.checkedInAt !== null && r.state.checkedOutAt === null;

/** Everything the live views show, from the rows the field page already loads. */
export function summarizeField(rows: LiveRow[], now: Date): FieldSummary {
  const live = rows.filter((r) => !r.state.cancelled);
  const due = live.filter((r) => r.state.checkedInAt || r.startsAt <= now);
  const underWay = live.filter((r) => !r.state.checkedOutAt && (r.state.checkedInAt || (r.startsAt <= now && r.endsAt > now)));

  const groups = new Map<string, GroupTotals>();
  for (const r of live) {
    const k = groupKey(r);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: k, total: 0, checkedIn: 0, packetsOut: 0, packetsHeld: 0, signatures: 0 }));
    g.total++;
    if (r.state.checkedInAt) g.checkedIn++;
    g.packetsOut += r.state.packetsOut.length;
    g.packetsHeld += r.state.packetsHeld.length;
    g.signatures += r.state.signatures;
  }

  const zones = new Map<string, ZoneSummary>();
  for (const r of live) {
    if (!r.turf) continue;
    const id = zoneId(r.turf);
    let z = zones.get(id);
    if (!z) zones.set(id, (z = { id, turf: r.turf, total: 0, onGround: 0 }));
    z.total++;
    if (onGround(r)) z.onGround++;
  }

  // Sorted by id so the same facts always hash the same way, whatever order the rows came in. Whether a shift
  // is due yet is a fact too: the clock moving one into "under way" changes the words around the figures.
  const facts = live
    .map(
      (r) =>
        `${r.shiftId}:${r.state.checkedInAt ? 1 : 0}${r.state.checkedOutAt ? 1 : 0}${r.state.paused ? 1 : 0}${r.startsAt <= now ? 1 : 0}:${r.state.signatures}:${r.state.doors}:${r.state.packetsOut.length}:${r.state.packetsHeld.length}:${r.state.closeout?.status ?? ""}`
    )
    .sort();

  return {
    at: now.toISOString(),
    version: shortHash(facts.join("\n")),
    today: {
      due: due.length,
      dueCheckedIn: due.filter((r) => r.state.checkedInAt).length,
      underWay: underWay.length,
      onGround: underWay.filter((r) => r.state.checkedInAt).length,
      upcoming: live.length - due.length,
      signatures: live.reduce((n, r) => n + r.state.signatures, 0),
      doors: live.reduce((n, r) => n + r.state.doors, 0),
      packetsOut: live.reduce((n, r) => n + r.state.packetsOut.length, 0),
    },
    groups: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)),
    zones: [...zones.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** How full a zone draws: a floor so an empty zone is still visible, rising with the share on the ground. */
export const zoneFill = (z: { total: number; onGround: number }) => (z.total === 0 ? 0 : z.onGround / z.total);

/** How solid a zone draws: faint when empty so the turf is still on the map, near-solid when everyone assigned is out. */
export const fillOpacity = (fill: number) => 0.12 + 0.6 * Math.min(1, Math.max(0, fill));

/** Reads a summary off the wire; anything malformed is ignored (the page keeps what it has). */
export function readSummary(v: unknown): FieldSummary | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t = o.today as Record<string, unknown> | undefined;
  if (typeof o.at !== "string" || typeof o.version !== "string" || !t || !Array.isArray(o.groups) || !Array.isArray(o.zones)) return null;
  const keys: (keyof FieldTotals)[] = ["due", "dueCheckedIn", "underWay", "onGround", "upcoming", "signatures", "doors", "packetsOut"];
  if (!keys.every((k) => Number.isInteger(t[k]))) return null;
  const rec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
  if (!o.groups.every((g) => rec(g) && typeof g.key === "string" && ["total", "checkedIn", "packetsOut", "packetsHeld", "signatures"].every((k) => Number.isInteger(g[k])))) return null;
  if (!o.zones.every((z) => rec(z) && typeof z.id === "string" && Number.isInteger(z.total) && Number.isInteger(z.onGround) && rec(z.turf) && Array.isArray(z.turf.coordinates) && Array.isArray(z.turf.coordinates[0]))) return null;
  return o as unknown as FieldSummary;
}
