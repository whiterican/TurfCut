import { StatementView } from "@/components/StatementView";
import type { StatementView as View, StatementLine } from "@/lib/statements-data";
const totals = { grossCents: 124500, feeCents: 1245, lineCount: 2, paidCents: 0, paidCount: 0, reversedCents: 0, correctionsCents: 0 };
const lines: StatementLine[] = ["Alex", "Alexandra Montgomery-Reyes"].map((worker, i) => ({
  id: `line-${i}`, kind: "SHIFT", workerId: `worker-${i}`, worker,
  jobId: `job-${i}`, jobTitle: i ? "Community outreach and neighborhood voter registration" : "Canvassing",
  shiftId: null, shiftStartsAt: new Date("2026-11-10T12:00:00Z"),
  formula: i ? "8 hours × $130.63 · adjustment for additional approved time" : "8 hours × $25.00",
  amountCents: i ? 104500 : 20000, feeCents: i ? 1045 : 200,
  status: "APPROVED", recordedAt: new Date("2026-11-10T12:00:00Z"), paidAt: null,
  receipt: null, corrects: null, withdrawnAfterClose: false,
}));
const s: View = { period: "2026-11", number: "S-2026-11", label: "November 2026", status: "open", closedAt: null, closedBy: null,
  totals, live: totals, parts: { adjustmentsToEarlierCents: 0, withdrawnEarlierCents: 0 }, lines,
  campaigns: lines.map(l => ({ jobId: l.jobId, title: l.jobTitle!, grossCents: l.amountCents, feeCents: l.feeCents, lineCount: 1 })),
  payments: [], corrections: [], disputes: [],
};
export default function Fixture() { return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}><h1>Statement component · synthetic fixture</h1><StatementView s={s} /></div>; }
