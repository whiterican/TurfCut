import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import type { DeskItem } from "@/lib/desk-data";

/**
 * "Needs you" on the Desk (plan #78, Desk P1): one compact row per thing a
 * role can act on, most urgent first, with what it's about, the time it rests
 * on and the next step. A table from tablet width up; stacked rows on a phone.
 * Only items the role may act on reach it (lib/desk-data).
 */
export function NeedsTable({ items }: { items: DeskItem[] }) {
  return (
    <div className="data-table-wrap ops-table-wrap">
      <table className="data-table ops-table">
        <caption className="sr-only">Things that need you, most urgent first</caption>
        <thead>
          <tr>
            <th scope="col">State</th>
            <th scope="col">What needs you</th>
            <th scope="col">About</th>
            <th scope="col">Since</th>
            <th scope="col"><span className="sr-only">Next step</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.key}>
              <td className="ops-state"><span className={n.badge}>{n.tag}</span></td>
              <th scope="row" className="ops-title">{n.title}</th>
              <td className="ops-about">{n.sub}</td>
              <td className="ops-when">
                {n.when ? (
                  <>
                    {n.when.label} <LocalTime iso={n.when.at.toISOString()} />
                  </>
                ) : (
                  <span aria-label="No time">—</span>
                )}
              </td>
              <td className="ops-action">
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
