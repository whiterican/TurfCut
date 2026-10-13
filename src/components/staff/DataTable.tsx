"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { nextSort, sortRows, splitWithheld, type SortDir, type TableColumn, type TableRow } from "@/lib/table";

/**
 * Dense staff table: sticky header, tabular numbers, one sortable column at
 * a time. Rows come from the server as plain data (lib/table). Rows whose
 * sorted value the worker doesn't share sit in their own group under a
 * label, never ranked. With `select`, selectable rows get a checkbox that
 * belongs to the form `select.form` (bulk actions).
 */
export function DataTable({
  caption,
  columns,
  rows,
  empty = "Nothing here yet.",
  initialSort = null,
  select,
}: {
  /** Read by screen readers; visually hidden. */
  caption: string;
  columns: TableColumn[];
  rows: TableRow[];
  empty?: string;
  initialSort?: { key: string; dir: SortDir } | null;
  /** Checkboxes named `name` (value: the row id) in the form with id `form`, each labelled "Select <first cell>". */
  select?: { form: string; name: string };
}) {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>(initialSort ?? { key: null, dir: "asc" });
  const shown = sortRows(rows, sort.key, sort.dir);
  // The first withheld row of the sorted column starts the "not shared" group.
  const withheldFrom = sort.key ? shown.length - splitWithheld(rows, sort.key).withheld.length : shown.length;
  const sortedLabel = columns.find((c) => c.key === sort.key)?.label ?? "";
  const span = columns.length + (select ? 1 : 0);
  return (
    // Focusable and named, so keyboard users can scroll it even with no links inside.
    <div className="data-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      {/* Three columns or fewer can fit a phone if the row label gives a little. */}
      <table className={columns.length <= 3 ? "data-table data-table-compact" : "data-table"}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {select && <th scope="col"><span className="sr-only">Select</span></th>}
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
              <td colSpan={span} className="py-8 text-center text-muted">{empty}</td>
            </tr>
          ) : (
            shown.flatMap((r, ri) => [
              ...(ri === withheldFrom
                ? [
                    <tr key="__withheld">
                      <th scope="rowgroup" colSpan={span} className="text-muted-sm py-2 font-normal">Not shared: {sortedLabel}. Not ranked on this column; in the order they arrived.</th>
                    </tr>,
                  ]
                : []),
              <tr key={r.id}>
                {select && (
                  <td>
                    {r.selectable && <input type="checkbox" form={select.form} name={select.name} value={r.id} aria-label={`Select ${r.cells[columns[0]?.key]?.text ?? "row"}`} className="size-4" />}
                  </td>
                )}
                {columns.map((c, i) => {
                  const cell = r.cells[c.key];
                  const content = cell?.href ? <Link href={cell.href} className="link">{cell.text}</Link> : (cell?.text ?? "");
                  return i === 0 ? (
                    <th key={c.key} scope="row" className={c.numeric ? "num" : undefined}>{content}</th>
                  ) : (
                    <td key={c.key} className={c.numeric ? "num" : undefined}>{content}</td>
                  );
                })}
              </tr>,
            ])
          )}
        </tbody>
      </table>
    </div>
  );
}
