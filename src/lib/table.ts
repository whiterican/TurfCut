/**
 * Staff data tables (C1): plain, serializable rows so a server page can hand
 * them to the client table. One column sorts at a time.
 */
export interface TableColumn {
  key: string;
  label: string;
  /** Numbers: right-aligned, tabular figures. */
  numeric?: boolean;
  /** Offer sorting on this column. */
  sortable?: boolean;
}

export interface TableCell {
  /** What the cell shows. */
  text: string;
  /** What it sorts by, when that differs from the text (a date, a count). null sorts last. */
  sort?: string | number | null;
  /** A same-site link for the cell. */
  href?: string;
  /**
   * The worker doesn't share this value with the viewer (C2). Never ranked:
   * a sort on this column puts these rows in their own group, in their
   * original order, after everyone with a value or "no data yet".
   */
  withheld?: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, TableCell>;
  /** Offer a checkbox for bulk actions on this row (DataTable `select`). */
  selectable?: boolean;
}

export type SortDir = "asc" | "desc";

const valueOf = (row: TableRow, key: string): string | number | null => {
  const c = row.cells[key];
  if (!c) return null;
  return c.sort !== undefined ? c.sort : c.text === "" ? null : c.text;
};

/** Rows sorted by one column. Stable; empty values always sort last, whichever way, and withheld ones after those. */
export function sortRows(rows: TableRow[], key: string | null, dir: SortDir): TableRow[] {
  if (!key) return rows;
  const { ranked, withheld } = splitWithheld(rows, key);
  return [...sortRanked(ranked, key, dir), ...withheld];
}

/** Rows whose cell in `key` is withheld, apart from the rest, each in original order. */
export function splitWithheld(rows: TableRow[], key: string): { ranked: TableRow[]; withheld: TableRow[] } {
  return { ranked: rows.filter((r) => !r.cells[key]?.withheld), withheld: rows.filter((r) => r.cells[key]?.withheld) };
}

function sortRanked(rows: TableRow[], key: string, dir: SortDir): TableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: valueOf(row, key) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.row);
}

/** The next sort after a header press: a new column starts ascending; the same column flips. */
export function nextSort(current: { key: string | null; dir: SortDir }, key: string): { key: string; dir: SortDir } {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}
