/* M10.1 acceptance checks: the staff gate and the staff ledger on real Postgres — staff is a flag independent of role, the ledger needs a reason and never changes, the overview reads the queues (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { checkReason, loadAdminOverview, recordAdminAction } from "@/lib/admin-data";
import { orgNav } from "@/lib/nav";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SUP = "00000000-0000-0000-0000-0000000000ab";
const WORKER = "00000000-0000-0000-0000-000000000101";

let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const fails_ = async (f: () => Promise<unknown>): Promise<string> => { try { await f(); return ""; } catch (e) { return e instanceof Error ? e.message : String(e); } };

(async () => {
  const p = db();
  const now = new Date("2026-10-20T15:00:00Z");
  // The seed makes workers only; organization logins are created by /signup. Make two, as the other checks do.
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: SUP, role: "SUPERVISOR", orgId: ORG, displayName: "Sam Ortiz" }] });

  // 1. Nobody is staff until someone sets the flag by hand; the flag is independent of role.
  const before = await p.profile.count({ where: { staffSince: { not: null } } });
  check("the seed makes nobody staff", before === 0, before);
  await p.profile.update({ where: { id: OWNER }, data: { staffSince: now } });
  await p.profile.update({ where: { id: WORKER }, data: { staffSince: now } });
  const staff = await p.profile.findMany({ where: { staffSince: { not: null } }, select: { id: true, role: true } });
  check("an owner and a worker can both be staff; their roles are untouched", staff.length === 2 && staff.every((s) => s.role === (s.id === OWNER ? "OWNER" : "WORKER")), staff);
  // The session's rule: staff when staffSince is set.
  const sessionStaff = (await p.profile.findUnique({ where: { id: OWNER }, select: { staffSince: true } }))!.staffSince !== null;
  const sessionNot = (await p.profile.findUnique({ where: { id: SUP }, select: { staffSince: true } }))!.staffSince !== null;
  check("the session reads the flag: set is staff, null is not", sessionStaff && !sessionNot);
  // Staff reach the console from the rail and More; nobody else sees it.
  check("staff owners get Admin in the rail and More, not the phone bar", orgNav("OWNER", true, true).rail.at(-1)?.href === "/admin" && orgNav("OWNER", true, true).more.at(-1)?.href === "/admin" && !orgNav("OWNER", true, true).phone.some((t) => t.href === "/admin"));
  check("non-staff owners never see Admin", !orgNav("OWNER", true, false).rail.some((t) => t.href === "/admin"));

  // 2. The ledger: a reason is required, trimmed, and the row never changes.
  const asOwner = { userId: OWNER, staff: true as const };
  const noReason = await fails_(() => recordAdminAction(p, { staff: asOwner, action: "org.approved", targetType: "Organization", targetId: ORG, orgId: ORG, reason: "  " }, now));
  check("recording without a reason throws before anything is written", /without a reason/.test(noReason) && (await p.adminAction.count()) === 0, noReason);
  check("checkReason tells the person what to say", checkReason("").ok === false);
  const sqlNoReason = await fails_(() => p.$executeRaw`INSERT INTO "AdminAction" ("id", "staffId", "action", "targetType", "targetId", "reason") VALUES (gen_random_uuid(), ${OWNER}::uuid, 'org.approved', 'Organization', ${ORG}, '   ')`);
  check("the database refuses a blank reason too", /AdminAction_reason_given/.test(sqlNoReason), sqlNoReason);
  const row = await recordAdminAction(p, { staff: asOwner, action: "org.approved", targetType: "Organization", targetId: ORG, orgId: ORG, reason: "  Pilot partner, terms signed on the call  ", metadata: { approved: true } }, now);
  const stored = await p.adminAction.findUnique({ where: { id: row.id } });
  check("a staff act records who, what, on which record, for which organization and why, trimmed", stored?.staffId === OWNER && stored.action === "org.approved" && stored.targetType === "Organization" && stored.targetId === ORG && stored.orgId === ORG && stored.reason === "Pilot partner, terms signed on the call" && stored.createdAt.getTime() === now.getTime(), stored);
  const upd = await fails_(() => p.adminAction.update({ where: { id: row.id }, data: { reason: "changed my mind" } }));
  const del = await fails_(() => p.adminAction.delete({ where: { id: row.id } }));
  check("the ledger is append-only: UPDATE and DELETE are refused by the database", /append-only/.test(upd) && /append-only/.test(del), { upd, del });
  const stillThere = await p.adminAction.findUnique({ where: { id: row.id }, select: { reason: true } });
  check("the row is unchanged after the refused update and delete", stillThere?.reason === "Pilot partner, terms signed on the call");
  const other = await recordAdminAction(p, { staff: { userId: WORKER, staff: true }, action: "profile.support_note", targetType: "Profile", targetId: WORKER, reason: "Checked sync status with the worker on the phone" }, new Date(now.getTime() + 1000));
  check("an act with no organization records a null orgId", (await p.adminAction.findUnique({ where: { id: other.id } }))?.orgId === null);

  // 3. The overview reads the queues the later slices manage, and the last acts newest first.
  const o = await loadAdminOverview(OWNER, now);
  const orgs = await p.organization.groupBy({ by: ["approved"], _count: true });
  const awaiting = orgs.find((g) => !g.approved)?._count ?? 0;
  const approved = orgs.find((g) => g.approved)?._count ?? 0;
  check("the overview counts organizations awaiting and approved", o.orgsAwaiting === awaiting && o.orgsApproved === approved, o);
  check("the overview counts current jurisdiction profiles and the ones the publish gate refuses", o.jurisdictionsCurrent === (await p.jurisdictionProfile.count({ where: { isCurrent: true } })) && o.jurisdictionsBlocked === 0, o);
  check("the overview lists the last acts newest first, naming a worker by their worker name and a member by their chat name, never an email", o.recent.length === 2 && o.recent[0].action === "profile.support_note" && o.recent[0].staffName === "Alex Rivera" && o.recent[1].action === "org.approved" && o.recent[1].staffName === "Maya Chen" && o.recent.every((a) => !a.staffName.includes("@")), o.recent);
  check("the overview shows when the viewer became staff", o.staffSince?.getTime() === now.getTime());
  // The same rule as the publish gate: a lapsed approval, or an effective date still ahead, counts as blocked.
  await p.jurisdictionProfile.updateMany({ where: { isCurrent: true }, data: { approvalExpiresAt: new Date(now.getTime() - 1000) } });
  check("a current profile whose counsel approval has expired counts as blocked", (await loadAdminOverview(OWNER, now)).jurisdictionsBlocked === 1);
  await p.jurisdictionProfile.updateMany({ where: { isCurrent: true }, data: { approvalExpiresAt: null, effectiveFrom: new Date(now.getTime() + 86_400_000) } });
  check("a current profile not yet effective counts as blocked too", (await loadAdminOverview(OWNER, now)).jurisdictionsBlocked === 1);

  // 4. No Data API path to the ledger.
  const grants = await p.$queryRaw<{ grantee: string }[]>`SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'AdminAction' AND grantee IN ('anon', 'authenticated')`;
  const rls = await p.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'AdminAction'`;
  check("AdminAction has RLS on and no grant to the API roles", grants.length === 0 && rls[0]?.relrowsecurity === true, { grants, rls });

  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
