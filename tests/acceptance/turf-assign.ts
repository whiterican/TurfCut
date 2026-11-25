/* Assigning turf from the Field map, on real Postgres: assignShiftTurf changes all the chosen shifts or none, keeps each
   shift's previous turf in the audit trail, and leaves alone a shift that already has exactly what is asked (no write,
   no audit entry: an entry whose before and after are equal records a change that never happened). */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assignShiftTurf } from "@/lib/field-day-data";
import { readTurf } from "@/lib/field-day";

const ENG = "00000000-0000-0000-0000-000000000031"; // the seeded engagement
const W2 = "00000000-0000-0000-0000-000000000102";
const ORG2 = "00000000-0000-0000-0000-0000000009a0";
const OWNER = "00000000-0000-0000-0000-0000000009a1";
const JUR = "00000000-0000-0000-0000-000000000021";
const H = 3_600_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const ring = (dLat = 0): [number, number][] => [[-104.999, 39.738], [-104.989, 39.738], [-104.989, 39.744 + dLat], [-104.999, 39.744 + dLat], [-104.999, 39.738]];
const polygon = (dLat = 0) => { const t = readTurf({ type: "Polygon", coordinates: [ring(dLat)] }); if (!t) throw new Error("fixture turf"); return t; };

(async () => {
  const p = db();
  const orgId = (await p.engagement.findUniqueOrThrow({ where: { id: ENG }, select: { job: { select: { orgId: true } } } })).job.orgId;
  await p.profile.create({ data: { id: OWNER, role: "OWNER", orgId, displayName: "Turf Owner" } });
  const actor = { profileId: OWNER, orgId };
  const soon = () => ({ startsAt: new Date(Date.now() + H), endsAt: new Date(Date.now() + 4 * H) });
  const a = await p.shift.create({ data: { engagementId: ENG, ...soon(), turfArea: polygon() as unknown as Prisma.InputJsonValue } });
  const b = await p.shift.create({ data: { engagementId: ENG, ...soon() } });
  const c = await p.shift.create({ data: { engagementId: ENG, ...soon() } });
  // Another organization's shift.
  await p.organization.create({ data: { id: ORG2, name: "Other Field Co", approved: true, updatedAt: new Date() } });
  const job2 = await p.job.create({ data: { orgId: ORG2, jurisdictionId: JUR, type: "CANVASS", title: "Other canvass", status: "PUBLISHED", hiringMethod: { modes: ["invite"] }, headcount: 5, geography: { city: "Denver", state: "CO" }, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 24 * H) } });
  const eng2 = await p.engagement.create({ data: { jobId: job2.id, workerId: W2, status: "ACTIVE" } });
  const foreign = await p.shift.create({ data: { engagementId: eng2.id, ...soon() } });

  const audits = (id?: string) => p.auditEvent.count({ where: { action: { in: ["shift.turf_assigned", "shift.turf_cleared"] }, ...(id ? { entityId: id } : {}) } });
  const stamp = async (id: string) => (await p.$queryRaw<{ x: string; t: string | null }[]>`select xmin::text x, "turfArea"::text t from "Shift" where id = ${id}::uuid`)[0];
  const turfOf = async (id: string) => (await p.shift.findUniqueOrThrow({ where: { id }, select: { turfArea: true } })).turfArea;

  // --- A shift that already has the turf is left alone ---
  const aBefore = await stamp(a.id);
  let r = await assignShiftTurf(actor, [a.id, b.id], polygon());
  check("giving A's own turf to A and B changes B only", r.ok && r.count === 1 && r.unchanged === 1, r);
  check("B has the turf now", JSON.stringify(await turfOf(b.id)) === JSON.stringify(polygon()));
  const bAudit = await p.auditEvent.findMany({ where: { entityId: b.id } });
  const meta = (bAudit[0]?.metadata ?? {}) as { previous?: unknown; next?: unknown; shifts?: number };
  check("one audit entry, B's: previous null, next the turf, counting the one shift that changed", bAudit.length === 1 && bAudit[0].action === "shift.turf_assigned" && bAudit[0].actorId === OWNER && meta.previous === null && JSON.stringify(meta.next) === JSON.stringify(polygon()) && meta.shifts === 1, bAudit);
  check("A got no audit entry", (await audits(a.id)) === 0);
  check("A's row was not written at all", JSON.stringify(await stamp(a.id)) === JSON.stringify(aBefore), [aBefore, await stamp(a.id)]);

  let n = await audits();
  r = await assignShiftTurf(actor, [a.id, b.id], polygon());
  check("the same save again changes nothing and says so", r.ok && r.count === 0 && r.unchanged === 2, r);
  check("…and adds no audit entry", (await audits()) === n);

  // --- Clearing ---
  n = await audits();
  r = await assignShiftTurf(actor, [b.id, c.id], null);
  check("clearing B and C changes B only: C had no turf", r.ok && r.count === 1 && r.unchanged === 1 && (await turfOf(b.id)) === null, r);
  const cleared = await p.auditEvent.findFirst({ where: { entityId: b.id, action: "shift.turf_cleared" } });
  check("the cleared turf stays in the audit entry as previous", (await audits()) === n + 1 && JSON.stringify((cleared?.metadata as { previous?: unknown } | null)?.previous) === JSON.stringify(polygon()) && (await audits(c.id)) === 0, cleared);
  n = await audits();
  r = await assignShiftTurf(actor, [b.id, c.id], null);
  check("clearing again changes nothing, no audit entry", r.ok && r.count === 0 && r.unchanged === 2 && (await audits()) === n, r);

  // --- A different turf is a change, however small ---
  n = await audits();
  r = await assignShiftTurf(actor, [a.id, b.id], polygon(0.0001));
  check("a turf with one corner moved changes both", r.ok && r.count === 2 && r.unchanged === 0 && (await audits()) === n + 2, r);
  const aMoved = await p.auditEvent.findFirst({ where: { entityId: a.id } });
  check("A's entry keeps the turf it had", JSON.stringify((aMoved?.metadata as { previous?: unknown } | null)?.previous) === JSON.stringify(polygon()), aMoved);

  // --- All or nothing still holds when some shifts are unchanged ---
  n = await audits();
  r = await assignShiftTurf(actor, [a.id, c.id, foreign.id], polygon(0.0001));
  check("another organization's shift refuses the lot", !r.ok && r.reason === "Shift not found." && (await turfOf(c.id)) === null && (await audits()) === n, r);
  await p.shift.update({ where: { id: a.id }, data: { startsAt: new Date(Date.now() - 5 * H), endsAt: new Date(Date.now() - H) } });
  r = await assignShiftTurf(actor, [a.id, c.id], polygon(0.0001));
  check("an ended shift that already has the turf still refuses the lot", !r.ok && /has already ended; nothing was changed\.$/.test(r.ok ? "" : r.reason) && (await turfOf(c.id)) === null && (await audits()) === n, r);
  await p.shift.update({ where: { id: a.id }, data: { status: "CANCELLED", ...soon() } });
  r = await assignShiftTurf(actor, [a.id, c.id], polygon(0.0001));
  check("…and so does a cancelled one", !r.ok && /is cancelled; nothing was changed\.$/.test(r.ok ? "" : r.reason) && (await turfOf(c.id)) === null && (await audits()) === n, r);
  r = await assignShiftTurf(actor, [c.id], polygon(0.0001));
  check("without it, C takes the turf", r.ok && r.count === 1 && r.unchanged === 0 && (await audits()) === n + 1, r);

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
