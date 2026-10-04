import type { ShiftState } from "@/lib/field-day";

/**
 * The organization's field views (C1.4): shifts grouped by job and staging
 * point, and the queue of shifts waiting for a closeout. Pure; the data
 * comes from lib/field-day-data.
 */

/** A calendar day from a URL ("2026-10-04"), as [from, to) in UTC; null when malformed. */
export function dayWindow(date: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const from = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || from.toISOString().slice(0, 10) !== date) return null;
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const shiftDay = (date: string, days: number) => isoDay(new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86_400_000));

export interface FieldRow {
  shiftId: string;
  jobId: string;
  jobTitle: string;
  staging: string | null;
  worker: string;
  startsAt: Date;
  endsAt: Date;
  state: ShiftState;
}

export interface FieldGroup {
  jobId: string;
  jobTitle: string;
  staging: string | null;
  rows: FieldRow[];
  checkedIn: number;
  packetsOut: number;
  signatures: number;
}

/** Shifts grouped by job, then staging point (unset last), each group by start time. */
export function groupField(rows: FieldRow[]): FieldGroup[] {
  const by = new Map<string, FieldGroup>();
  for (const r of rows) {
    const k = `${r.jobId}\u0000${r.staging ?? ""}`;
    let g = by.get(k);
    if (!g) by.set(k, (g = { jobId: r.jobId, jobTitle: r.jobTitle, staging: r.staging, rows: [], checkedIn: 0, packetsOut: 0, signatures: 0 }));
    g.rows.push(r);
    if (r.state.checkedInAt) g.checkedIn++;
    g.packetsOut += r.state.packetsOut.length;
    g.signatures += r.state.signatures;
  }
  for (const g of by.values()) g.rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return [...by.values()].sort(
    (a, b) => a.jobTitle.localeCompare(b.jobTitle) || (a.staging === null ? 1 : 0) - (b.staging === null ? 1 : 0) || (a.staging ?? "").localeCompare(b.staging ?? "")
  );
}

/** Waiting for a closeout: checked out, not cancelled, not yet approved or rejected. */
export const needsReview = (st: ShiftState) => !st.cancelled && st.checkedOutAt !== null && st.closeout === null;

/** The review queue: shifts waiting for a closeout, the longest-waiting first. */
export function reviewQueue<T extends { state: ShiftState }>(rows: T[]): T[] {
  return rows.filter((r) => needsReview(r.state)).sort((a, b) => a.state.checkedOutAt!.getTime() - b.state.checkedOutAt!.getTime());
}
