/**
 * Keyset pagination helpers. A cursor is an opaque base64url string holding
 * the sort key and the id of the last row returned, so the next page starts
 * strictly after it (stable under inserts, no OFFSET scans).
 */
export const DEFAULT_PAGE = 100;
export const MAX_PAGE = 200;

/** `?limit=` → a page size in [1, max]; missing or junk → the default. */
export function parseLimit(raw: string | null | undefined, def = DEFAULT_PAGE, max = MAX_PAGE): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.at.toISOString(), c.id])).toString("base64url");
}

/** Undefined for a missing cursor; null for a malformed one (the caller answers 400). */
export function decodeCursor(raw: string | null | undefined): Cursor | null | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "string" || typeof v[1] !== "string") return null;
    const at = new Date(v[0]);
    if (Number.isNaN(at.getTime()) || !v[1]) return null;
    return { at, id: v[1] };
  } catch {
    return null;
  }
}

/**
 * Fetch `limit + 1` rows, then split: the extra row only tells us there is a
 * next page. `key` picks the sort timestamp the cursor resumes after.
 */
export function page<T extends { id: string }>(rows: T[], limit: number, key: (r: T) => Date): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor({ at: key(last), id: last.id }) : null };
}
