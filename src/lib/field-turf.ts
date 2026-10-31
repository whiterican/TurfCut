import type { FieldRow } from "@/lib/field-view";
import { onGround, zoneId } from "@/lib/field-live";

/**
 * The Field map's turf cards (#111, screen 11): one card per distinct turf
 * drawn on a shift in the window, keyed exactly as the live summary keys its
 * zones, so the card's figures can follow the map's. What a card says is what
 * the data holds: how many shifts were given the turf and how many of them
 * are on the ground now. No stops, no completion, no positions: a stop
 * inventory is the stop feature (#110), and nobody's position is tracked.
 */
export interface TurfCard {
  /** The zone id from `summarizeField` (a hash of the polygon). */
  id: string;
  /** The staging point the turf is worked from, else "Turf n" in list order. */
  name: string;
  jobId: string;
  jobTitle: string;
  /** Distinct jobs the turf is drawn on; above one, the card says so. */
  jobs: number;
  /** Shifts in the window given this turf, cancelled ones aside. */
  total: number;
  /** Of them, checked in and not out right now. */
  onGround: number;
  signatures: number;
  doors: number;
  /** The window's first start among the turf's shifts, for ordering and the card's time line. */
  startsAt: Date;
  endsAt: Date;
}

export function turfCards(rows: FieldRow[]): TurfCard[] {
  const by = new Map<string, TurfCard & { jobIds: Set<string> }>();
  for (const r of rows) {
    if (r.state.cancelled || !r.turf) continue;
    const id = zoneId(r.turf);
    let c = by.get(id);
    if (!c) {
      by.set(id, (c = { id, name: r.staging ?? "", jobId: r.jobId, jobTitle: r.jobTitle, jobs: 0, total: 0, onGround: 0, signatures: 0, doors: 0, startsAt: r.startsAt, endsAt: r.endsAt, jobIds: new Set() }));
    }
    c.jobIds.add(r.jobId);
    c.total++;
    if (onGround(r)) c.onGround++;
    c.signatures += r.state.signatures;
    c.doors += r.state.doors;
    if (r.startsAt < c.startsAt) {
      // The earliest shift names the card: its job and staging point lead.
      c.startsAt = r.startsAt;
      c.jobId = r.jobId;
      c.jobTitle = r.jobTitle;
      c.name = r.staging ?? "";
    }
    if (r.endsAt > c.endsAt) c.endsAt = r.endsAt;
  }
  const cards = [...by.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  // Turfs without a staging point are numbered among themselves, in list order.
  let unnamed = 0;
  return cards.map(({ jobIds, ...c }) => ({ ...c, jobs: jobIds.size, name: c.name || `Turf ${++unnamed}` }));
}

/** A job id as the Field map's `?job=` filter carries it: the id itself, else null (anything else is ignored, never an error). */
export function readJobFilter(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

/**
 * The job the Field map is narrowed to: the asked id only when it is one of the window's jobs.
 * Anything else (a stale link, another organization's id) is no filter, so the page, its
 * control and the polled figures agree.
 */
export function knownJob(asked: string | null, jobs: Array<{ id: string }>): string | null {
  return asked && jobs.some((j) => j.id === asked) ? asked : null;
}
