import Link from "next/link";

import { listStatements } from "@/lib/statements-data";
import { money } from "@/lib/pay";
import { requireArea } from "@/lib/employer-session";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Statements · Turfcut" };

/** The organization's monthly statements (M9.3): owners and finance. */
export default async function StatementsPage() {
  const s = await requireArea("pay");
  if (!s.orgId) {
    return (
      <main className="page max-w-2xl">
        <div className="empty-state">
          <p className="empty-state-title">No organization yet</p>
          <p className="empty-state-body">
            Statements belong to an organization&apos;s owner and finance team.
          </p>
        </div>
      </main>
    );
  }
  const statements = await listStatements({
    profileId: s.userId,
    orgId: s.orgId,
    role: s.role, grants: s.grants,
  });
  return (
    <main className="page max-w-2xl">
      <Masthead eyebrow={<><Link href="/pay" className="link">
              Pay
            </Link></>} title="Statements" meta={<>One for each calendar month (UTC): the pay recorded, the payments
            sent, corrections to earlier months, and how disputes were handled.
            A month&apos;s totals are fixed once it ends.</>} />
      {/* The running month is always listed, so there is always at least one. */}
      <ul className="list-card">
        {statements.map((st) => (
          <li key={st.period}>
            <Link
              href={`/pay/statements/${st.period}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2"
            >
              <span className="min-w-0 space-y-0.5">
                <span className="block font-semibold text-fg">{st.label}</span>
                <span className="text-muted-sm block">
                  {st.number} · {money(st.grossCents)} recorded ·{" "}
                  {money(st.paidCents)} sent
                </span>
              </span>
              <span
                className={
                  st.status === "closed" ? "badge-neutral" : "badge-butter"
                }
              >
                {st.status === "closed" ? "Closed" : "In progress"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
