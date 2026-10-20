/* M10 acceptance checks on real Postgres: the staff gate and ledger (M10.1: staff is a flag independent of role, the ledger needs a reason and never changes, the overview reads the queues), the organization approval queue (M10.2: decisions, notices, the publish gate) and jurisdiction rule profiles (M10.3: proposals, approval that moves what fits and freezes the rest, withdrawal, retirement, the place lock). The runner applies prisma/m10-admin.sql on top of the full setup first, so the migration's re-run safety is checked too (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { checkReason, loadAdminOverview, recordAdminAction } from "@/lib/admin-data";
import { approvalStanding, decideOrganization, listOrganizationsForAdmin, loadOrganizationForAdmin } from "@/lib/admin-orgs-data";
import { approveJurisdictionVersion, listJurisdictionsForAdmin, loadJurisdictionForAdmin, proposeJurisdictionVersion, retireJurisdictionProposal, withdrawJurisdictionApproval } from "@/lib/admin-jurisdictions-data";
import { readRules } from "@/lib/jurisdiction-rules";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { canScheduleShift, jurisdictionProblems, publishBlockers, type PublishFacts } from "@/lib/jobs";
import { orgNoticeText } from "@/lib/notification-text";
import { loadNotifications, unreadNotifications } from "@/lib/notifications-data";
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

  // 5. The approval queue (M10.2): a second organization signs up and waits.
  const ORG_B = "00000000-0000-0000-0000-0000000000b2";
  const OWNER_B = "00000000-0000-0000-0000-0000000000b3";
  await p.organization.create({ data: { id: ORG_B, name: "Boulder Canvass Co" } });
  await p.profile.create({ data: { id: OWNER_B, role: "OWNER", orgId: ORG_B, displayName: "Riley Park" } });
  await p.$executeRaw`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES (${OWNER_B}::uuid, 'riley@boulder.test', now())`;
  const q1 = await listOrganizationsForAdmin();
  const b1 = q1.awaiting.find((o) => o.id === ORG_B);
  check("a new organization waits in the queue with its owner's email, no gate item done and no jobs", !!b1 && b1.owners.length === 1 && b1.owners[0].email === "riley@boulder.test" && b1.owners[0].name === "Riley Park" && !b1.gate.contractorTerms && !b1.gate.classificationReview && !b1.gate.legalContact && b1.members === 1 && b1.jobs.draft + b1.jobs.published + b1.jobs.other === 0, b1);
  const a1 = q1.approved.find((o) => o.id === ORG);
  check("the seed organization is in the approved list with its own counts", !!a1 && !q1.awaiting.some((o) => o.id === ORG) && a1.members === 2 && a1.jobs.published >= 1, a1);
  check("a decision without a reason is refused before anything changes", !(await decideOrganization(asOwner, ORG_B, "approve", "  ")).ok && (await p.adminAction.count({ where: { orgId: ORG_B } })) === 0 && !(await p.organization.findUnique({ where: { id: ORG_B } }))?.approved);
  const t1 = new Date(now.getTime() + 5_000);
  const ap = await decideOrganization(asOwner, ORG_B, "approve", "  Pilot partner, terms on the call  ", t1);
  const bApproved = await p.organization.findUnique({ where: { id: ORG_B } });
  const ledger1 = await p.adminAction.findFirst({ where: { orgId: ORG_B, action: "org.approved" } });
  check("approving records the standing and the date, the ledger row with the trimmed reason, and one notice to the owner", ap.ok && bApproved?.approved === true && bApproved.approvedAt?.getTime() === t1.getTime() && ledger1?.reason === "Pilot partner, terms on the call" && ledger1.staffId === OWNER && (await p.notification.count({ where: { recipientId: OWNER_B, kind: "ORG_APPROVED" } })) === 1, { ap, bApproved, ledger1 });
  check("the other organization's owner is not told", (await p.notification.count({ where: { recipientId: OWNER, kind: { in: ["ORG_APPROVED", "ORG_APPROVAL_REVOKED"] } } })) === 0);
  check("approving an approved organization changes nothing", !(await decideOrganization(asOwner, ORG_B, "approve", "Twice", t1)).ok && (await p.adminAction.count({ where: { orgId: ORG_B } })) === 1);
  const viewerB = { userId: OWNER_B, role: "OWNER" as const, workerId: null, orgId: ORG_B };
  const noticesB = await loadNotifications(viewerB);
  check("the owner's notices carry the decision, count as unread, and lead to Settings", noticesB.length === 1 && noticesB[0].kind === "ORG_APPROVED" && orgNoticeText(noticesB[0].kind)?.href === "/org/settings" && (await unreadNotifications(viewerB)) === 1, noticesB);
  check("the seed organization's owner sees no decision notice", (await loadNotifications({ userId: OWNER, role: "OWNER", workerId: null, orgId: ORG })).every((n) => !n.kind.startsWith("ORG_")));
  // Approval is one item of the publish gate; the rest is the organization's.
  const jurisdiction = await p.jurisdictionProfile.findFirst({ where: { isCurrent: true } });
  const facts = (approved: boolean): PublishFacts => ({
    job: { status: "DRAFT", compensationMethod: "HOURLY", payRateCents: 2500, headcount: 5, startsAt: new Date(now.getTime() + 86_400_000), endsAt: new Date(now.getTime() + 7 * 86_400_000), campaignDisclosure: {}, supportContacts: {}, hiringMethod: "APPLY", geography: { state: "CO" } },
    jurisdiction,
    org: { approved, contractorTermsSignedAt: now, classificationReviewedAt: now },
  });
  const GATE_MSG = "Your organization is awaiting Turfcut approval.";
  check("an approved organization clears the approval item of the publish gate; an unapproved one is blocked with the existing message", !publishBlockers(facts(true), now).includes(GATE_MSG) && publishBlockers(facts(false), now).includes(GATE_MSG));
  const t2 = new Date(now.getTime() + 10_000);
  const rv = await decideOrganization(asOwner, ORG_B, "revoke", "Terms lapsed; restore once they are re-signed", t2);
  const bRevoked = await p.organization.findUnique({ where: { id: ORG_B } });
  check("withdrawing approval keeps the date of the last approval, records the ledger row and tells the owner", rv.ok && bRevoked?.approved === false && bRevoked.approvedAt?.getTime() === t1.getTime() && (await p.adminAction.count({ where: { orgId: ORG_B, action: "org.approval_revoked" } })) === 1 && (await p.notification.count({ where: { recipientId: OWNER_B, kind: "ORG_APPROVAL_REVOKED" } })) === 1, { rv, bRevoked });
  check("the standing reads as withdrawn, not never approved", approvalStanding(bRevoked!) === "withdrawn" && approvalStanding({ approved: false, approvedAt: null }) === "awaiting");
  check("withdrawing a withdrawn approval changes nothing", !(await decideOrganization(asOwner, ORG_B, "revoke", "Again", t2)).ok && (await p.adminAction.count({ where: { orgId: ORG_B } })) === 2);
  const detail = await loadOrganizationForAdmin(ORG_B);
  check("the detail page lists Turfcut's decisions newest first with the staff member's name and reason", detail?.history.map((h) => h.action).join(",") === "org.approval_revoked,org.approved" && detail.history[0].staffName === "Maya Chen" && detail.history[1].reason === "Pilot partner, terms on the call", detail?.history);
  const q2 = await listOrganizationsForAdmin();
  check("a withdrawn organization is back in the queue", q2.awaiting.some((o) => o.id === ORG_B) && !q2.approved.some((o) => o.id === ORG_B));
  check("the overview counts it as awaiting", (await loadAdminOverview(OWNER, now)).orgsAwaiting === q2.awaiting.length);
  const badHiring = await fails_(() => p.$executeRaw`INSERT INTO "Notification" ("id", "recipientId", "kind") VALUES (gen_random_uuid(), ${OWNER_B}::uuid, 'APPLICATION_RECEIVED')`);
  check("the database still refuses a hiring notice with no subject, while a decision notice has none", /Notification_subject/.test(badHiring) && (await p.notification.count({ where: { recipientId: OWNER_B, engagementId: null, postId: null, disputeId: null, transferId: null } })) === 2, badHiring);

  // 7. Jurisdiction rule profiles (M10.3): a rule change is a new version; approval moves the jobs that fit and freezes the rest.
  const JOB = "00000000-0000-0000-0000-000000000011";
  const SHIFT_JOB = "00000000-0000-0000-0000-0000000000c1";
  // Section 3 moved the seed profile's dates to test the overview; put them back so this section starts from a usable version 1.
  await p.jurisdictionProfile.updateMany({ where: { state: "CO", locality: "Denver", isCurrent: true }, data: { effectiveFrom: null, approvalExpiresAt: null } });
  const v1 = await p.jurisdictionProfile.findFirstOrThrow({ where: { state: "CO", locality: "Denver", isCurrent: true } });
  // A shift-rate job under version 1 (which allows hourly and shift rates), cloned from the seed job.
  await p.$executeRaw`INSERT INTO "Job" SELECT * FROM jsonb_populate_record(null::"Job", (SELECT to_jsonb(j) || jsonb_build_object('id', ${SHIFT_JOB}, 'title', 'Shift-rate canvass', 'compensationMethod', 'SHIFT_RATE', 'status', 'PUBLISHED') FROM "Job" j WHERE j.id = ${JOB}::uuid))`;
  const t3 = new Date(now.getTime() + 20_000);
  const rules1 = readRules(v1.rules);
  check("the seed's rules read as hourly and shift rates, no per-unit", rules1.compensationAllowed.join(",") === "HOURLY,SHIFT_RATE" && !rules1.perUnitAllowed, rules1);
  const prop = await proposeJurisdictionVersion(asOwner, { state: "co", locality: "Denver", rules: { ...rules1, compensationAllowed: ["HOURLY"], badgeRequired: true, notes: "Counsel memo of Oct 20: shift rates no longer allowed." }, effectiveFrom: null, reason: "Counsel memo of Oct 20" }, t3);
  const v2 = prop.ok ? await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: prop.id } }) : null;
  const opt1 = await jurisdictionOptions(t3);
  check("a proposed version is version 2 of the place: not current, not approved, with its proposer; the job form lists it as unusable", prop.ok && v2?.version === 2 && !v2.isCurrent && !v2.approved && v2.createdById === OWNER && (opt1.find((o) => o.id === prop.id)?.problems.length ?? 0) > 0 && opt1.find((o) => o.id === v1.id)?.problems.length === 0, { prop, v2, opt1 });
  const list1 = await listJurisdictionsForAdmin(t3);
  const denver = list1.find((pl) => pl.state === "CO" && pl.locality === "Denver");
  check("the admin list groups a place's versions newest first with their standing and open jobs", denver?.versions.map((v) => `${v.version}:${v.standing}:${v.jobs}`).join(" ") === "2:proposed:0 1:current:2", denver?.versions.map((v) => [v.version, v.standing, v.jobs]));
  if (!prop.ok) throw new Error("proposal failed");
  const t4 = new Date(now.getTime() + 30_000);
  const expires = new Date(t4.getTime() + 365 * 86_400_000);
  const apv = await approveJurisdictionVersion(asOwner, prop.id, { approvalExpiresAt: expires, reason: "Signed by counsel on the Oct 20 call" }, t4);
  const [v1After, v2After, seedJob, shiftJob] = await Promise.all([
    p.jurisdictionProfile.findUniqueOrThrow({ where: { id: v1.id } }),
    p.jurisdictionProfile.findUniqueOrThrow({ where: { id: prop.id } }),
    p.job.findUniqueOrThrow({ where: { id: JOB }, select: { jurisdictionId: true } }),
    p.job.findUniqueOrThrow({ where: { id: SHIFT_JOB }, select: { jurisdictionId: true } }),
  ]);
  check("approving makes version 2 current and approved with its expiry and approver, and supersedes version 1", apv.ok && v2After.isCurrent && v2After.approved && v2After.approvedById === OWNER && v2After.approvalExpiresAt?.getTime() === expires.getTime() && !v1After.isCurrent && v1After.supersededAt?.getTime() === t4.getTime(), { apv, v1After, v2After });
  check("the hourly job moves to version 2 and the shift-rate job stays frozen on version 1", apv.ok && apv.moved === 1 && apv.frozen === 1 && seedJob.jurisdictionId === prop.id && shiftJob.jurisdictionId === v1.id, { apv, seedJob, shiftJob });
  check("the move is on the job's own audit trail, by nobody in particular", (await p.auditEvent.count({ where: { action: "job.jurisdiction_moved", entityId: JOB, actorId: null } })) === 1 && (await p.auditEvent.count({ where: { action: "job.jurisdiction_moved", entityId: SHIFT_JOB } })) === 0);
  check("the organization's owner is told its job froze; its supervisor is not", (await p.notification.count({ where: { recipientId: OWNER, kind: "ORG_JOBS_FROZEN" } })) === 1 && (await p.notification.count({ where: { recipientId: SUP, kind: "ORG_JOBS_FROZEN" } })) === 0);
  const opt2 = await jurisdictionOptions(t4);
  check("the gate follows: the moved job can schedule, the frozen one can't, and the job form now marks version 1 unusable and version 2 usable", canScheduleShift(v2After, t4).ok && !canScheduleShift(v1After, t4).ok && opt2.find((o) => o.id === prop.id)?.problems.length === 0 && (opt2.find((o) => o.id === v1.id)?.problems.length ?? 0) > 0 && /newer version/.test(canScheduleShift(v1After, t4).reasons.join(" ")), opt2);
  const d1 = await loadJurisdictionForAdmin(v1.id, t4);
  check("the superseded version's page shows its frozen job, explained by the current rules first, its successor, and no ledger rows from before the console", d1?.standing === "superseded" && d1.jobs === 1 && d1.jobList.length === 1 && d1.jobList[0].id === SHIFT_JOB && /per shift/.test(d1.jobList[0].problems[0]) && /newer version/.test(d1.jobList[0].problems.join(" ")) && d1.siblings.map((s) => s.version).join(",") === "2" && d1.history.length === 0, d1 && { standing: d1.standing, jobs: d1.jobList.map((j) => [j.id, j.problems]), siblings: d1.siblings.length, history: d1.history.length });
  const d2 = await loadJurisdictionForAdmin(prop.id, t4);
  check("the current version's page lists its decisions newest first with the staff member's name", d2?.history.map((h) => h.action).join(",") === "jurisdiction.version_approved,jurisdiction.version_proposed" && d2.history[0].staffName === "Maya Chen" && d2.jobList.length === 1 && d2.jobList[0].problems.length === 0, d2?.history);
  check("approving an already superseded version is refused", !(await approveJurisdictionVersion(asOwner, v1.id, { approvalExpiresAt: null, reason: "Trying" }, t4)).ok);
  const t5 = new Date(now.getTime() + 40_000);
  const wd = await withdrawJurisdictionApproval(asOwner, prop.id, "Counsel pulled the opinion pending a court ruling", t5);
  check("withdrawing approval freezes the job under version 2, tells the owner again, and the job form marks every version unusable", wd.ok && wd.frozen === 1 && !(await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: prop.id } })).approved && (await p.notification.count({ where: { recipientId: OWNER, kind: "ORG_JOBS_FROZEN" } })) === 2 && (await jurisdictionOptions(t5)).every((o) => o.problems.length > 0), wd);
  const t6 = new Date(now.getTime() + 50_000);
  const rn = await approveJurisdictionVersion(asOwner, prop.id, { approvalExpiresAt: null, reason: "The ruling came in; counsel restored the opinion" }, t6);
  check("approving the current version again renews it in place: nothing moves, the expiry is what was given, and the ledger says renewed", rn.ok && rn.moved === 0 && rn.frozen === 0 && (await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: prop.id } })).approvalExpiresAt === null && (await p.adminAction.count({ where: { targetId: prop.id, action: "jurisdiction.approval_renewed" } })) === 1 && (await jurisdictionOptions(t6)).find((o) => o.id === prop.id)?.problems.length === 0, rn);
  const p3 = await proposeJurisdictionVersion(asOwner, { state: "CO", locality: "Denver", rules: rules1, effectiveFrom: null, reason: "A draft to retire" }, t6);
  const t7 = new Date(now.getTime() + 60_000);
  const rt = p3.ok ? await retireJurisdictionProposal(asOwner, p3.id, "Counsel changed the draft", t7) : { ok: false as const, message: "no proposal" };
  const list2 = await listJurisdictionsForAdmin(t7);
  check("a retired proposal reads as retired, never current, and the place lists three versions", rt.ok && list2.find((pl) => pl.locality === "Denver")?.versions.map((v) => `${v.version}:${v.standing}`).join(" ") === "3:retired 2:current 1:superseded", list2.find((pl) => pl.locality === "Denver")?.versions.map((v) => [v.version, v.standing]));
  check("approving a retired proposal is refused", /retired/.test((await approveJurisdictionVersion(asOwner, p3.ok ? p3.id : prop.id, { approvalExpiresAt: null, reason: "Trying" }, t7) as { message?: string }).message ?? ""));
  // An older proposal can't be approved over a newer version in force.
  const p4 = await proposeJurisdictionVersion(asOwner, { state: "CO", locality: "Denver", rules: rules1, effectiveFrom: null, reason: "Version 4 draft" }, t7);
  const p5 = await proposeJurisdictionVersion(asOwner, { state: "CO", locality: "Denver", rules: rules1, effectiveFrom: null, reason: "Version 5 draft" }, t7);
  const ap5 = p5.ok ? await approveJurisdictionVersion(asOwner, p5.id, { approvalExpiresAt: null, reason: "Version 5 signed" }, t7) : { ok: false as const, message: "no proposal" };
  const ap4 = p4.ok ? await approveJurisdictionVersion(asOwner, p4.id, { approvalExpiresAt: null, reason: "Version 4 signed late" }, t7) : { ok: false as const, message: "no proposal" };
  check("after version 5 is approved, approving the older proposal 4 is refused and 5 stays current", p4.ok && p5.ok && ap5.ok && !ap4.ok && /Version 5 is newer/.test(ap4.message) && (await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: p5.id } })).isCurrent, { ap4, ap5 });
  // Two proposals at once for a statewide place (where the unique index can't tell NULL localities apart) still get distinct numbers.
  const [ut1, ut2] = await Promise.all([
    proposeJurisdictionVersion(asOwner, { state: "UT", locality: "", rules: readRules(null), effectiveFrom: null, reason: "Utah, first draft" }, t7),
    proposeJurisdictionVersion(asOwner, { state: "UT", locality: "", rules: readRules(null), effectiveFrom: null, reason: "Utah, second draft" }, t7),
  ]);
  check("two proposals at once for a statewide place are versions 1 and 2, never two of the same", ut1.ok && ut2.ok && [ut1.version, ut2.version].sort().join(",") === "1,2" && (await p.jurisdictionProfile.count({ where: { state: "UT" } })) === 2, { ut1, ut2 });
  check("retiring a current version is refused", !(await retireJurisdictionProposal(asOwner, prop.id, "Trying", t7)).ok);
  const nm = await proposeJurisdictionVersion(asOwner, { state: "nm", locality: "", rules: readRules({ compensationAllowed: ["HOURLY"] }), effectiveFrom: new Date(t7.getTime() + 30 * 86_400_000), reason: "The pilot expands to New Mexico" }, t7);
  const nmAp = nm.ok ? await approveJurisdictionVersion(asOwner, nm.id, { approvalExpiresAt: null, reason: "Counsel's New Mexico memo" }, t7) : { ok: false as const, message: "no proposal" };
  const nmRow = nm.ok ? await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: nm.id } }) : null;
  check("a new statewide place starts at version 1, becomes current on approval, is blocked until its effective date, and the approval says so", nm.ok && nm.version === 1 && nmAp.ok && nmAp.notEffectiveUntil?.getTime() === nmRow?.effectiveFrom?.getTime() && nmRow?.locality === null && nmRow.isCurrent && jurisdictionProblems(nmRow, t7).length === 1 && /effective/.test(jurisdictionProblems(nmRow, t7)[0]), { nm, nmAp });
  const ov = await loadAdminOverview(OWNER, t7);
  check("the overview counts two current profiles, one of them blocked", ov.jurisdictionsCurrent === 2 && ov.jurisdictionsBlocked === 1, ov);
  check("the expiry has to be tomorrow or later", /tomorrow or later/.test((await approveJurisdictionVersion(asOwner, p5.ok ? p5.id : prop.id, { approvalExpiresAt: new Date(now.getTime() - 1000), reason: "Trying" }, t7) as { message?: string }).message ?? ""));

  // 8. No Data API path to the ledger.
  const grants = await p.$queryRaw<{ grantee: string }[]>`SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'AdminAction' AND grantee IN ('anon', 'authenticated')`;
  const rls = await p.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'AdminAction'`;
  check("AdminAction has RLS on and no grant to the API roles", grants.length === 0 && rls[0]?.relrowsecurity === true, { grants, rls });

  console.log(fails ? `${fails} FAILED` : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
