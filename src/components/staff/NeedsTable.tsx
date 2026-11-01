import { StatusChip } from "@/components/StatusBadge";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import type { DeskItem } from "@/lib/desk-data";

/**
 * "Needs you" on the Desk (plan #78, Desk P1): one compact row per thing a
 * role can act on, most urgent first (lib/desk URGENCY), with its state,
 * what it's about, the time it rests on and the next step. A table on wide
 * screens; stacked rows below 64rem. Only items the role may act on reach it.
 * The explicit roles keep it a table for screen readers when the stacked
 * layout changes the cells' display (WebKit drops table semantics then).
 */
export function NeedsTable({ items }: { items: DeskItem[] }) {
  return (
    <div className="data-table-wrap ops-table-wrap">
      <table role="table" className="data-table ops-table">
        <caption className="sr-only">Things that need you, most urgent first</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">What needs you</th>
            <th role="columnheader" scope="col">State</th>
            <th role="columnheader" scope="col">About</th>
            <th role="columnheader" scope="col">When</th>
            <th role="columnheader" scope="col"><span className="sr-only">Next step</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((n) => (
            <tr role="row" key={n.key}>
              <th role="rowheader" scope="row" className="ops-title">{n.title}</th>
              <td role="cell" className="ops-state"><StatusChip state={n.state} label={n.tag} /></td>
              <td role="cell" className="ops-about">{n.sub}</td>
              <td role="cell" className="ops-when">
                {n.when ? (
                  <>
                    {n.when.label} <LocalTime iso={n.when.at.toISOString()} mode="short" />
                  </>
                ) : (
                  <>
                    <span aria-hidden>—</span>
                    <span className="sr-only">No time</span>
                  </>
                )}
              </td>
              <td role="cell" className="ops-action">
                <Link transitionTypes={["nav-forward"]} href={n.href} className="ops-link" aria-label={`${n.action}: ${n.title}`}>
                  {n.action}
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
