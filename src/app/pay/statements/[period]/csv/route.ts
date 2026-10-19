import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { PAY_ROLES } from "@/lib/access";
import { loadStatement, statementCsv } from "@/lib/statements-data";

/** The statement as CSV (M9.3): the same lines, payments and corrections as the page, then its totals. Owners and finance only. */
export async function GET(_req: Request, { params }: { params: Promise<{ period: string }> }) {
  const s = await getSessionProfile();
  if (!s) return new NextResponse("Sign in to download a statement.", { status: 401 });
  if (!PAY_ROLES.includes(s.role) || !s.orgId) return new NextResponse("Only owners and finance can download statements.", { status: 403 });
  const { period } = await params;
  const st = await loadStatement({ profileId: s.userId, orgId: s.orgId, role: s.role }, period);
  if (!st) return new NextResponse("No such statement.", { status: 404 });
  return new NextResponse(statementCsv(st), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turfcut-statement-${st.number}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
