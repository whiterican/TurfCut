/**
 * Receipts and statements (M9): the small pure rules the pages and the data
 * layer share. A receipt is one payout transfer; a statement is one
 * organization's calendar month (UTC). Both are read from the ledger when
 * shown; nothing here recomputes pay.
 */

/** "R-000123": the per-organization receipt counter, zero-padded. */
export const receiptNumber = (n: number) => `R-${String(n).padStart(6, "0")}`;

/** A statement period is a calendar month, keyed "2026-10". */
export type Period = string;
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePeriod(s: unknown): Period | null {
  return typeof s === "string" && PERIOD_RE.test(s) ? s : null;
}

/** The UTC month a moment falls in. */
export function periodOf(d: Date): Period {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) of the month in UTC. */
export function periodBounds(p: Period): { start: Date; end: Date } {
  const m = PERIOD_RE.exec(p);
  if (!m) throw new Error(`bad period: ${p}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(y, mo, 1)), end: new Date(Date.UTC(y, mo + 1, 1)) };
}

/** "October 2026". */
export function periodLabel(p: Period): string {
  return periodBounds(p).start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "S-2026-10": a statement's number is its period; one per organization per month. */
export const statementNumber = (p: Period) => `S-${p}`;

/** Whether a month is over (its statement can close) at `now`. */
export const periodClosed = (p: Period, now: Date) => now >= periodBounds(p).end;

/** The months from `from` up to and including the month of `to`, newest first. */
export function periodsBetween(from: Date, to: Date): Period[] {
  const out: Period[] = [];
  let y = to.getUTCFullYear();
  let m = to.getUTCMonth();
  const stop = periodOf(from);
  for (let i = 0; i < 240; i++) {
    const p = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.push(p);
    if (p === stop) break;
    if (--m < 0) { m = 11; y--; }
  }
  return out;
}
