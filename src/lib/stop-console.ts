/**
 * The walkbook console (W3), the pure half: what the URL asks for, and the
 * CSV an export writes. The database half is stop-console-data.ts.
 */
import { csvCell } from "@/lib/pay-data";
import { isOutcomeKind, outcomeLook, type OutcomeKind } from "@/lib/stop-outcomes";
import { UUID_RE } from "@/lib/jobs";

export const CONSOLE_PAGE_SIZE = 50;
/** Pins drawn at once; a map with more than this would be a smear. */
export const CONSOLE_MAP_PINS = 500;
/** Rows one export writes. A bigger job is exported book by book. */
export const EXPORT_MAX_ROWS = 20_000;

export type OutcomeFilter = OutcomeKind | "todo";

export interface ConsoleQuery {
  /** One outcome, or "todo" for stops with none yet. */
  outcome: OutcomeFilter | null;
  bookId: string | null;
  /** The engagement of the worker holding the book now, or "none" for books held by nobody. */
  holderId: string | null;
  /** A stop whose history the inspector shows. */
  stopId: string | null;
  page: number;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const uuid = (v: string | string[] | undefined) => {
  const s = one(v).trim().toLowerCase();
  return UUID_RE.test(s) ? s : null;
};

/** Reads a query string. Anything that isn't a known value is ignored, never trusted or echoed. */
export function parseConsoleQuery(sp: Record<string, string | string[] | undefined>): ConsoleQuery {
  const o = one(sp.outcome);
  const page = /^\d{1,6}$/.test(one(sp.page)) ? Math.max(1, Number(one(sp.page))) : 1;
  return {
    outcome: o === "todo" ? "todo" : isOutcomeKind(o) ? o : null,
    bookId: uuid(sp.book),
    holderId: one(sp.worker) === "none" ? "none" : uuid(sp.worker),
    stopId: uuid(sp.stop),
    page,
  };
}

/** The same query as a string, with changes: `null` removes a key. The inspector and the page number don't carry over a filter change. */
export function consoleHref(base: string, q: ConsoleQuery, change: Partial<Record<"outcome" | "book" | "worker" | "stop" | "page", string | null>> = {}): string {
  const p = new URLSearchParams();
  const cur: Record<string, string | null> = { outcome: q.outcome, book: q.bookId, worker: q.holderId, stop: q.stopId, page: q.page > 1 ? String(q.page) : null };
  const filterChanged = "outcome" in change || "book" in change || "worker" in change;
  if (filterChanged) {
    cur.page = null;
    cur.stop = null;
  }
  for (const [k, v] of Object.entries({ ...cur, ...change })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export const filterLabel = (f: OutcomeFilter) => (f === "todo" ? "To do" : outcomeLook(f).label);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportRow {
  bookNumber: number;
  stopNumber: number;
  line1: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  /** The source system's id for the row (VanID, Ecanvasser Contact ID); empty when the file had none or the addresses were deleted. */
  sourceRecordId: string | null;
  outcome: OutcomeKind | null;
  talkedTo: boolean | null;
  leftLiterature: boolean | null;
  signatures: number | null;
  recordedAt: Date | null;
  holder: string | null;
  /** The poll answers on this stop, by question id, in words ("Support", "Declined"). Only when the exporter may read poll answers. */
  poll?: Record<string, string>;
}

/** The current poll questions an export adds a column for, in order. */
export interface PollColumn {
  id: string;
  prompt: string;
}

const yn = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

export const EXPORT_HEADER = ["Walkbook", "Stop", "Address", "Unit", "City", "State", "ZIP", "Source record ID", "Outcome", "Talked with someone", "Left literature", "Signatures", "Recorded at (UTC)", "Held by"];

/** One CSV line per stop. Every cell goes through the finance export's guard, so a value shaped like a formula is never read as one. */
export function exportCsv(rows: readonly ExportRow[], pollColumns: readonly PollColumn[] = []): string {
  // With poll answers in the file, the worker's name and the time are left out: address, opinion and a named worker together are a per-worker breakdown of what residents said (CLAUDE.md rule 5).
  const withPoll = pollColumns.length > 0;
  const head = withPoll ? EXPORT_HEADER.slice(0, -2) : EXPORT_HEADER;
  const lines = [[...head, ...pollColumns.map((q, i) => `Poll ${i + 1}: ${q.prompt}`)].map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.bookNumber, r.stopNumber, r.line1, r.unit, r.city, r.state, r.zip, r.sourceRecordId, r.outcome ? outcomeLook(r.outcome).label : "To do", yn(r.talkedTo), yn(r.leftLiterature), r.signatures, ...(withPoll ? [] : [r.recordedAt ? r.recordedAt.toISOString().slice(0, 19).replace("T", " ") : "", r.holder]), ...pollColumns.map((q) => r.poll?.[q.id] ?? "")]
        .map(csvCell)
        .join(",")
    );
  }
  // The byte-order mark tells spreadsheet apps the file is UTF-8, so a street name with an accent stays intact (the finance export does the same).
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
