import Link from "next/link";
import { notFound } from "next/navigation";

import { loadStatement } from "@/lib/statements-data";
import { StatementView } from "@/components/StatementView";
import { PrintButton } from "@/components/PrintButton";
import { requireArea } from "@/lib/employer-session";

export const metadata = { title: "Statement · Turfcut" };

/** One month's statement (M9.3), printable, with a matching CSV. */
export default async function StatementPage({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const s = await requireArea("pay");
  if (!s.orgId) notFound();
  const st = await loadStatement({ profileId: s.userId, orgId: s.orgId, role: s.role, grants: s.grants }, period);
  if (!st) notFound();
  return (
    <main className="page max-w-3xl">
      <header className="page-header no-print">
        <div className="space-y-1">
          <p className="eyebrow"><Link href="/pay/statements" className="link">Statements</Link></p>
          <h1 className="page-title">{st.label}</h1>
          <p className="text-muted-sm">Statement {st.number}. Every line links to the record behind it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/pay/statements/${st.period}/csv`} className="btn-secondary btn-sm">Download CSV</a>
          <PrintButton />
        </div>
      </header>
      <StatementView s={st} />
    </main>
  );
}
