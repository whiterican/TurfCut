import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PAY_ROLES } from "@/lib/access";
import { listStatements } from "@/lib/statements-data";
import { money } from "@/lib/pay";

export const metadata = { title: "Statements · Turfcut" };

/** The organization's monthly statements (M9.3): owners and finance. */
export default async function StatementsPage() {
  const s = await requireRole(PAY_ROLES);
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
    role: s.role,
  });
  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">
            <Link href="/pay" className="link">
              Pay
            </Link>
          </p>
          <h1 className="page-title">Statements</h1>
          <p className="text-muted-sm">
            One for each calendar month (UTC): the pay recorded, the payments
            sent, corrections to earlier months, and how disputes were handled.
            A month&apos;s totals are fixed once it ends.
          </p>
        </div>
      </header>
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
