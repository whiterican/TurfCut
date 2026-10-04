"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { nextSort, sortRows, type SortDir, type TableColumn, type TableRow } from "@/lib/table";

/**
 * Dense staff table: sticky header, tabular numbers, one sortable column at
 * a time. Rows come from the server as plain data (lib/table).
 */
export function DataTable({
  caption,
  columns,
  rows,
  empty = "Nothing here yet.",
  initialSort = null,
}: {
  /** Read by screen readers; visually hidden. */
  caption: string;
  columns: TableColumn[];
  rows: TableRow[];
  empty?: string;
  initialSort?: { key: string; dir: SortDir } | null;
}) {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>(initialSort ?? { key: null, dir: "asc" });
  const shown = sortRows(rows, sort.key, sort.dir);
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort.key === c.key;
              const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : c.sortable ? "none" : undefined;
              const Arrow = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort} className={c.numeric ? "text-right" : undefined}>
                  {c.sortable ? (
                    <button type="button" className={`data-table-sort ${c.numeric ? "flex-row-reverse" : ""}`} onClick={() => setSort((s) => nextSort(s, c.key))}>
                      {c.label}
                      <Arrow aria-hidden className={`size-3.5 ${active ? "" : "opacity-50"}`} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center text-muted">{empty}</td>
            </tr>
          ) : (
            shown.map((r) => (
              <tr key={r.id}>
                {columns.map((c, i) => {
                  const cell = r.cells[c.key];
                  const content = cell?.href ? <Link href={cell.href} className="link">{cell.text}</Link> : (cell?.text ?? "");
                  return i === 0 ? (
                    <th key={c.key} scope="row" className={c.numeric ? "num" : undefined}>{content}</th>
                  ) : (
                    <td key={c.key} className={c.numeric ? "num" : undefined}>{content}</td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
