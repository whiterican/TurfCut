/* M6 acceptance checks: offline sync, against a fresh database (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { syncWorkerActions } from "@/lib/field-day-data";
import { verifiedWork } from "@/lib/scorecard";

const [W1, W2] = ["101", "102"].map((n) => `00000000-0000-0000-0000-000000000${n}`);
const ENG = "00000000-0000-0000-0000-000000000031";
const H = 3_600_000, M = 60_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const w1 = { workerId: W1, profileId: W1 };

(async () => {
  const p = db();
  const now = new Date();
  const start = new Date(now.getTime() - 5 * H);
  const shift = await p.shift.create({ data: { engagementId: ENG, startsAt: start, endsAt: new Date(start.getTime() + 4 * H) } });
  const slow = 10 * M; // the phone's clock is 10 minutes slow
  const phone = (t: number) => t - slow;
  const q = (offset: number, action: object) => ({ clientId: randomUUID(), at: phone(start.getTime() + offset), action: action as never });
  const batch = [
    q(5 * M, { kind: "log", unit: "signatures", count: 3 }), // before check-in: refused
    q(6 * M, { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 250 m" } }),
    q(60 * M, { kind: "log", unit: "signatures", count: 20 }),
    q(120 * M, { kind: "pause" }),
    q(140 * M, { kind: "resume" }),
    q(200 * M, { kind: "log", unit: "signatures", count: 12 }),
    q(236 * M, { kind: "check_out" }),
  ];
  const r = await syncWorkerActions(w1, shift.id, { deviceNow: phone(now.getTime()), actions: batch }, now);
  check("sync accepted the batch", r.ok, r);
  const res = r.ok ? r.results : [];
  check("a log before check-in is refused with a reason", res[0]?.status === "rejected" && /Check in/.test(res[0].reason ?? ""), res[0]);
  check("the rest are saved", res.slice(1).every((x) => x.status === "saved"), res);
  const evs = await p.workEvent.findMany({ where: { shiftId: shift.id }, orderBy: { createdAt: "asc" } });
  check("times corrected for the slow clock", evs[0]?.type === "CHECK_IN" && evs[0].createdAt.getTime() === start.getTime() + 6 * M, evs[0]);
  check("every offline action keeps its phone id and when it arrived", evs.every((e) => e.clientId && e.receivedAt?.getTime() === now.getTime()));
  { const pl = evs[0].payload as Record<string, unknown>; check("the check-in stored only yes/no and a band", Object.keys(pl).sort().join() === "atStaging,distance" && pl.atStaging === true && pl.distance === "under 250 m", pl); }
  const s = await p.shift.findUniqueOrThrow({ where: { id: shift.id } });
  check("shift completed at the offline times", s.status === "COMPLETED" && s.checkInAt?.getTime() === start.getTime() + 6 * M && s.checkOutAt?.getTime() === start.getTime() + 236 * M, s);
  const w = verifiedWork(evs.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: e.createdAt })), []);
  check("verified hours use the real times (230 min − 20 min break)", w.activeMs === 210 * M && w.submitted === 32, w);

  const again = await syncWorkerActions(w1, shift.id, { deviceNow: phone(Date.now()), actions: batch.slice(1) }, new Date());
  check("re-sending is harmless: all duplicates", again.ok && again.results.every((x) => x.status === "duplicate"), again);
  check("…and nothing new was saved", (await p.workEvent.count({ where: { shiftId: shift.id } })) === evs.length);

  check("another worker can't sync to this shift", !(await syncWorkerActions({ workerId: W2, profileId: W2 }, shift.id, { deviceNow: Date.now(), actions: [q(1, { kind: "pause" })] })).ok);

  // A second shift today for the limits.
  const s2 = await p.shift.create({ data: { engagementId: ENG, startsAt: new Date(now.getTime() - 30 * M), endsAt: new Date(now.getTime() + 3 * H) } });
  const ci = { clientId: randomUUID(), at: Date.now() - 20 * M, action: { kind: "check_in" as const, location: { checked: false as const } } };
  const old = { clientId: randomUUID(), at: Date.now() - 25 * H, action: { kind: "log" as const, unit: "signatures" as const, count: 1 } };
  const future = { clientId: randomUUID(), at: Date.now() + 30 * M, action: { kind: "log" as const, unit: "signatures" as const, count: 1 } };
  const live = { clientId: randomUUID(), at: Date.now(), action: { kind: "log" as const, unit: "signatures" as const, count: 4 } };
  const r2 = await syncWorkerActions(w1, s2.id, { deviceNow: Date.now(), actions: [ci, old, future, live] });
  const by = (id: string) => (r2.ok ? r2.results.find((x) => x.clientId === id) : undefined);
  check("offline check-in saved", by(ci.clientId)?.status === "saved", r2);
  check("…older than 24 hours is refused", by(old.clientId)?.status === "rejected" && /24 hours/.test(by(old.clientId)?.reason ?? ""), by(old.clientId));
  // (order is kept: the future one comes after the old one, so it's judged as future)
  check("…a time in the future is refused", by(future.clientId)?.status === "rejected", by(future.clientId));
  const liveEv = await p.workEvent.findUnique({ where: { clientId: live.clientId } });
  check("a live action has no arrival mark", by(live.clientId)?.status === "saved" && liveEv?.receivedAt === null, liveEv);
  const reuse = await syncWorkerActions(w1, s2.id, { deviceNow: Date.now(), actions: [{ ...batch[2] }] });
  check("an id used on another shift is refused", reuse.ok && reuse.results[0].status === "rejected", reuse);

  // --- Review fixes: a phone clock can't rewrite recorded time ---
  const id = () => randomUUID();
  const backdated = (minutesAgo: number, action: object) => ({ clientId: id(), at: Date.now() - minutesAgo * M, action: action as never });
  const sync = (shiftId: string, actions: Array<{ clientId: string; at: number; action: never }>) => syncWorkerActions(w1, shiftId, { deviceNow: Date.now(), actions });
  const status = (r: Awaited<ReturnType<typeof syncWorkerActions>>, i = 0) => (r.ok ? r.results[i] : undefined);
  // The first shift is checked out (at its corrected times, hours ago).
  const before = await p.workEvent.count({ where: { shiftId: shift.id } });
  const earlyIn = await sync(shift.id, [backdated(5 * 60 - 1, { kind: "check_in", location: { checked: false } })]);
  check("a backdated second check-in on a finished shift is refused", status(earlyIn)?.status === "rejected", status(earlyIn));
  const lateLog = await sync(shift.id, [backdated(4 * 60, { kind: "log", unit: "signatures", count: 500 })]);
  check("backdated counts on a finished shift are refused", status(lateLog)?.status === "rejected", status(lateLog));
  check("…and nothing was added to it", (await p.workEvent.count({ where: { shiftId: shift.id } })) === before);

  // A live break, then a phone claiming the break ended earlier.
  const s3 = await p.shift.create({ data: { engagementId: ENG, startsAt: new Date(now.getTime() + 4 * H), endsAt: new Date(now.getTime() + 8 * H) } });
  await p.workEvent.createMany({
    data: [
      { shiftId: s3.id, type: "CHECK_IN", payload: {}, createdAt: new Date(Date.now() - 50 * M) },
      { shiftId: s3.id, type: "PAUSE_START", payload: {}, createdAt: new Date(Date.now() - 30 * M) },
      { shiftId: s3.id, type: "PAUSE_END", payload: {}, createdAt: new Date(Date.now() - 2 * M) },
    ],
  });
  await p.shift.update({ where: { id: s3.id }, data: { status: "ACTIVE", checkInAt: new Date(Date.now() - 50 * M) } });
  const earlyResume = await sync(s3.id, [backdated(29, { kind: "resume" })]);
  check("a backdated end-of-break inside a recorded break is refused", status(earlyResume)?.status === "rejected" && /not on a break/i.test(status(earlyResume)?.reason ?? ""), status(earlyResume));
  const pauseNow = await sync(s3.id, [backdated(20, { kind: "pause" })]);
  const placed = await p.workEvent.findUnique({ where: { clientId: pauseNow.ok ? pauseNow.results[0].clientId : "" } });
  check("a backdated action goes after what the shift already has", status(pauseNow)?.status === "saved" && !!placed && placed.createdAt.getTime() > Date.now() - 2 * M - 1000, placed?.createdAt);

  // Two entries clamped to "now" keep their order.
  const tie = await syncWorkerActions(w1, s3.id, { deviceNow: Date.now() - 60_000, actions: [{ clientId: id(), at: Date.now(), action: { kind: "resume" } as never }, { clientId: id(), at: Date.now(), action: { kind: "pause" } as never }] });
  const tieEvs = await p.workEvent.findMany({ where: { clientId: { in: tie.ok ? tie.results.map((x) => x.clientId) : [] } }, orderBy: { createdAt: "asc" } });
  check("entries clamped to now keep their order with distinct times", tieEvs.length === 2 && tieEvs[0].type === "PAUSE_END" && tieEvs[1].type === "PAUSE_START" && tieEvs[0].createdAt < tieEvs[1].createdAt, tieEvs.map((e) => [e.type, e.createdAt]));

  // Once a supervisor has reviewed a shift, nothing more syncs into it.
  await p.validation.create({ data: { shiftId: shift.id, workEventId: null, status: "APPROVED", reviewerId: null } });
  const afterReview = await sync(shift.id, [backdated(1, { kind: "pause" })]);
  check("nothing syncs into a reviewed shift", status(afterReview)?.status === "rejected" && /reviewed/.test(status(afterReview)?.reason ?? ""), status(afterReview));


  // --- Other people's events don't move the worker's offline times ---
  // A: a packet handed out live in the middle of the worker's offline break.
  const s4 = await p.shift.create({ data: { engagementId: ENG, startsAt: new Date(Date.now() - 5 * H), endsAt: new Date(Date.now() + 2 * H), status: "ACTIVE", checkInAt: new Date(Date.now() - 4 * H) } });
  await p.workEvent.createMany({
    data: [
      { shiftId: s4.id, type: "CHECK_IN", payload: {}, actorId: W1, createdAt: new Date(Date.now() - 4 * H) },
      { shiftId: s4.id, type: "PACKET_PICKUP", payload: { packetId: "18A", sheets: 20 }, actorId: null, createdAt: new Date(Date.now() - 135 * M) },
    ],
  });
  const brk = await sync(s4.id, [backdated(150, { kind: "pause" }), backdated(120, { kind: "resume" })]);
  const brkEvs = await p.workEvent.findMany({ where: { shiftId: s4.id, type: { in: ["PAUSE_START", "PAUSE_END"] } }, orderBy: { createdAt: "asc" } });
  const brkMin = brkEvs.length === 2 ? (brkEvs[1].createdAt.getTime() - brkEvs[0].createdAt.getTime()) / M : -1;
  check("a packet handed out during an offline break doesn't shorten it (30 min stays 30 min)", brk.ok && Math.round(brkMin) === 30, { brkMin, brk });
  const ret = await sync(s4.id, [backdated(140, { kind: "return_packet", packetId: "18A", sheetsReturned: 20, signatures: 15 })]);
  const retEv = await p.workEvent.findFirst({ where: { shiftId: s4.id, type: "PACKET_RETURN" } });
  check("a packet return goes after the packet was handed out", status(ret)?.status === "saved" && !!retEv && retEv.createdAt.getTime() > Date.now() - 135 * M - 5 * M, retEv?.createdAt);
  // B: a check-out made offline hours ago, then a map pin right before the sync.
  const s5 = await p.shift.create({ data: { engagementId: ENG, startsAt: new Date(Date.now() - 6 * H), endsAt: new Date(Date.now() - 2 * H), status: "ACTIVE", checkInAt: new Date(Date.now() - 6 * H) } });
  await p.workEvent.createMany({
    data: [
      { shiftId: s5.id, type: "CHECK_IN", payload: {}, actorId: W1, createdAt: new Date(Date.now() - 6 * H) },
      { shiftId: s5.id, type: "NOTE", payload: { kind: "pin", category: "good_spot", lat: 39.74, lng: -104.99 }, actorId: W1, createdAt: new Date(Date.now() - M) },
    ],
  });
  const co = await sync(s5.id, [backdated(180, { kind: "check_out" })]);
  const coEv = await p.workEvent.findFirst({ where: { shiftId: s5.id, type: "CHECK_OUT" } });
  check("a map pin doesn't move an offline check-out to now", status(co)?.status === "saved" && !!coEv && Math.abs(coEv.createdAt.getTime() - (Date.now() - 180 * M)) < 2 * M, coEv?.createdAt);
  check("…and it's marked as recorded offline for the reviewer", !!coEv?.receivedAt, coEv?.receivedAt);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
