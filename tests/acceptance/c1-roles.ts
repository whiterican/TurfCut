/* C1.1 acceptance checks: member invites, joining, roles, removal, and no worker directory, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { acceptInvite, changeMemberRole, inviteMember, listMembers, pendingInvitesFor, removeMember, resendInvite, revokeInvite, type InviteMailer } from "@/lib/members-data";
import { ensureAccount, SIGNUP_METADATA_KEY } from "@/lib/account";
import { workerAccessFor } from "@/lib/worker-access-data";
import { inviteWorker } from "@/lib/engagements-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
const W1 = "00000000-0000-0000-0000-000000000101"; // has an engagement with ORG (seed)
const W2 = "00000000-0000-0000-0000-000000000102"; // none
const W1_PROFILE = "00000000-0000-0000-0000-000000000101";
const NEW1 = "00000000-0000-0000-0000-0000000005a1";
const NEW2 = "00000000-0000-0000-0000-0000000005a2";
const UNCONFIRMED = "00000000-0000-0000-0000-0000000005a3";
const SELFSIGN = "00000000-0000-0000-0000-0000000005a4";
const JOB = "00000000-0000-0000-0000-000000000011";
const DAY = 86_400_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const owner = { userId: OWNER, orgId: ORG };
const sent: string[] = [];
const mail: InviteMailer = async (email) => { sent.push(email); return { ok: true }; };
const broken: InviteMailer = async () => ({ ok: false, message: "smtp down" });
const authUser = (id: string, email: string, confirmed = true) =>
  db().$executeRaw`INSERT INTO auth.users (id, email, email_confirmed_at) VALUES (${id}::uuid, ${email}, ${confirmed ? new Date() : null})`;
const audits = (action: string) => db().auditEvent.count({ where: { action } });
const confirmed = (id: string, email: string) => ({ id, email, email_confirmed_at: new Date().toISOString() });

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Other Campaign Co", approved: true, updatedAt: new Date() } });
  await p.profile.createMany({ data: [
    { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
    { id: OTHER, role: "OWNER", orgId: ORG2, displayName: "Other Boss" },
  ] });
  await authUser(OWNER, "maya@example.org");
  await authUser(OTHER, "boss@other.org");
  await authUser(W1_PROFILE, "alex@example.org");

  // --- 1. Inviting ---
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  const early = await inviteMember(owner, { email: "riley@example.org", role: "RECRUITER" }, mail);
  check("an organization Turfcut hasn't approved can't invite", !early.ok && /approved/.test(early.ok ? "" : early.reason) && sent.length === 0, early);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });
  const notOwner = await inviteMember({ userId: OTHER, orgId: ORG }, { email: "x2@example.org", role: "RECRUITER" }, mail);
  check("someone who isn't an owner of the org can't invite (re-checked in the transaction)", !notOwner.ok && /Only an owner/.test(notOwner.ok ? "" : notOwner.reason));
  const bad = await inviteMember(owner, { email: "not-an-email", role: "RECRUITER" }, mail);
  check("a malformed email is refused", !bad.ok);
  const asWorker = await inviteMember(owner, { email: "x@example.org", role: "WORKER" }, mail);
  check("WORKER is not an invitable role", !asWorker.ok);
  const inv = await inviteMember(owner, { email: "  Riley@Example.ORG ", role: "RECRUITER" }, mail);
  check("an owner invites a recruiter; the email is lowercased and sent", inv.ok && inv.sent && sent.at(-1) === "riley@example.org", inv);
  const row = inv.ok ? await p.orgInvite.findUniqueOrThrow({ where: { id: inv.inviteId } }) : null;
  check("the invite lasts 7 days and is audited", !!row && Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 7 * DAY) < 1000 && (await audits("member.invited")) === 1);
  const dup = await inviteMember(owner, { email: "riley@example.org", role: "FINANCE" }, mail);
  check("a second pending invite for the same email is refused", !dup.ok && /already an invite/.test(dup.ok ? "" : dup.reason), dup);
  const before = sent.length;
  const worker = await inviteMember(owner, { email: "alex@example.org", role: "RECRUITER" }, mail);
  const otherOrg = await inviteMember(owner, { email: "boss@other.org", role: "RECRUITER" }, mail);
  const nobody = await inviteMember(owner, { email: "nobody-yet@example.org", role: "RECRUITER" }, mail);
  check("a worker's or another org's email gets the same reply as a new address (no account probing)",
    worker.ok && otherOrg.ok && nobody.ok && worker.sent === nobody.sent && otherOrg.sent === nobody.sent && worker.message === nobody.message, { worker, otherOrg, nobody });
  check("…but only the new address is emailed", sent.length === before + 1 && sent.at(-1) === "nobody-yet@example.org", sent);
  const resendWorker = worker.ok ? await resendInvite(owner, worker.inviteId, mail) : null;
  check("…and resending to an account that can't join answers the same without emailing", !!resendWorker?.ok && sent.length === before + 1);
  if (worker.ok) await revokeInvite(owner, worker.inviteId);
  if (otherOrg.ok) await revokeInvite(owner, otherOrg.inviteId);
  const self = await inviteMember(owner, { email: "maya@example.org", role: "RECRUITER" }, mail);
  check("…and a current member is told they're already a member", !self.ok && /already a member/.test(self.ok ? "" : self.reason));
  const unsent = await inviteMember(owner, { email: "pat@example.org", role: "SUPERVISOR" }, broken);
  check("a failed email keeps the invite and says so", unsent.ok && !unsent.sent && /didn't send/.test(unsent.message ?? ""), unsent);

  // --- 2. Resend / revoke ---
  if (unsent.ok) {
    await p.orgInvite.update({ where: { id: unsent.inviteId }, data: { expiresAt: new Date(Date.now() - DAY) } });
    const failedResend = await resendInvite(owner, unsent.inviteId, broken);
    const still = await p.orgInvite.findUniqueOrThrow({ where: { id: unsent.inviteId } });
    check("a failed resend doesn't revive an expired invite", !failedResend.ok && still.expiresAt.getTime() < Date.now());
    const resent = await resendInvite(owner, unsent.inviteId, mail);
    const after = await p.orgInvite.findUniqueOrThrow({ where: { id: unsent.inviteId } });
    check("a resend moves the expiry 7 days out and is audited", resent.ok && after.expiresAt.getTime() > Date.now() + 6 * DAY && (await audits("invite.resent")) === 2);
    const foreign = await resendInvite({ userId: OTHER, orgId: ORG2 }, unsent.inviteId, mail);
    const foreignRevoke = await revokeInvite({ userId: OTHER, orgId: ORG2 }, unsent.inviteId);
    check("another organization can't resend or revoke it", !foreign.ok && !foreignRevoke.ok);
    const rv = await revokeInvite(owner, unsent.inviteId);
    check("the owner revokes it; audited", rv.ok && (await audits("invite.revoked")) === 3);
    check("a revoked invite can't be revoked or resent again", !(await revokeInvite(owner, unsent.inviteId)).ok && !(await resendInvite(owner, unsent.inviteId, mail)).ok);
    const reinvite = await inviteMember(owner, { email: "pat@example.org", role: "SUPERVISOR" }, mail);
    check("after revoking, the same email can be invited again", reinvite.ok, reinvite);
  }
  check("a non-UUID id is simply not found", !(await revokeInvite(owner, "nope")).ok && !(await removeMember(owner, "nope")).ok);

  // --- 3. Joining ---
  await authUser(UNCONFIRMED, "riley@example.org", false);
  check("an unconfirmed email doesn't accept the invite", !(await acceptInvite({ id: UNCONFIRMED, email: "riley@example.org", email_confirmed_at: null })));
  await p.$executeRaw`DELETE FROM auth.users WHERE id = ${UNCONFIRMED}::uuid`;
  // A login the invite email created has no sign-up details: it joins on first sign-in.
  await authUser(NEW1, "riley@example.org");
  const joined = await ensureAccount({ ...confirmed(NEW1, "Riley@example.org"), user_metadata: {} });
  const riley = await p.profile.findUnique({ where: { id: NEW1 } });
  check("the invited person joins as recruiter of the inviting org on first sign-in", joined && riley?.role === "RECRUITER" && riley.orgId === ORG, riley);
  const accepted = inv.ok ? await p.orgInvite.findUniqueOrThrow({ where: { id: inv.inviteId } }) : null;
  check("the invite is marked accepted by them; joining is audited", !!accepted?.acceptedAt && accepted.acceptedById === NEW1 && (await audits("member.joined")) === 1);
  check("an accepted invite isn't accepted twice", !(await acceptInvite(confirmed(NEW1, "riley@example.org"))));
  // Someone who signs up themselves keeps what they asked for, even with an invite on file.
  const lure = await inviteMember(owner, { email: "sam@example.org", role: "RECRUITER" }, mail);
  await authUser(SELFSIGN, "sam@example.org");
  const asked = { [SIGNUP_METADATA_KEY]: { accountType: "worker", name: "Sam Self" } };
  await ensureAccount({ ...confirmed(SELFSIGN, "sam@example.org"), user_metadata: asked });
  const sam = await p.profile.findUniqueOrThrow({ where: { id: SELFSIGN }, include: { worker: true } });
  check("a self sign-up becomes what they signed up as; an invite never hijacks it", sam.role === "WORKER" && !sam.orgId && sam.worker?.displayName === "Sam Self", sam);
  check("…and the invite stays unaccepted", lure.ok && !(await p.orgInvite.findUniqueOrThrow({ where: { id: lure.inviteId } })).acceptedAt);
  const expired = await inviteMember(owner, { email: "quinn@example.org", role: "FINANCE" }, mail);
  if (expired.ok) await p.orgInvite.update({ where: { id: expired.inviteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await authUser(NEW2, "quinn@example.org");
  check("an expired invite doesn't let anyone in", !(await ensureAccount({ ...confirmed(NEW2, "quinn@example.org"), user_metadata: {} })) && !(await p.profile.findUnique({ where: { id: NEW2 } })));
  const exp2 = await inviteMember(owner, { email: "quinn@example.org", role: "FINANCE" }, mail);
  check("an expired invite blocks a duplicate and says it expired", !exp2.ok && /expired/.test(exp2.ok ? "" : exp2.reason), exp2);
  const workerJoin = await p.orgInvite.create({ data: { orgId: ORG, email: "alex@example.org", role: "OWNER", invitedById: OWNER, expiresAt: new Date(Date.now() + DAY) } });
  check("a worker account never becomes a member, even with an invite on file", !(await acceptInvite(confirmed(W1_PROFILE, "alex@example.org"), { inviteId: workerJoin.id })) && (await p.profile.findUniqueOrThrow({ where: { id: W1_PROFILE } })).role === "WORKER");
  await p.orgInvite.update({ where: { id: workerJoin.id }, data: { revokedAt: new Date() } });

  // --- 4. Roles and the last-owner guard ---
  check("a role change to something that isn't an org role is refused", !(await changeMemberRole(owner, NEW1, "WORKER")).ok);
  const toSup = await changeMemberRole(owner, NEW1, "SUPERVISOR");
  check("the owner changes a member's role; audited from → to", toSup.ok && (await p.profile.findUniqueOrThrow({ where: { id: NEW1 } })).role === "SUPERVISOR" && !!(await p.auditEvent.findFirst({ where: { action: "member.role_changed", entityId: NEW1, metadata: { equals: { orgId: ORG, from: "RECRUITER", to: "SUPERVISOR" } } } })));
  const demoteSelf = await changeMemberRole(owner, OWNER, "RECRUITER");
  check("the last owner can't step down", !demoteSelf.ok && /at least one owner/.test(demoteSelf.ok ? "" : demoteSelf.reason));
  check("…or be removed", !(await removeMember(owner, OWNER)).ok);
  check("another organization's member can't be changed or removed", !(await changeMemberRole(owner, OTHER, "RECRUITER")).ok && !(await removeMember(owner, OTHER)).ok);
  check("a worker can't be given an org role through this", !(await changeMemberRole(owner, W1_PROFILE, "OWNER")).ok);
  await changeMemberRole(owner, NEW1, "OWNER");
  check("with a second owner, the first can step down", (await changeMemberRole(owner, OWNER, "RECRUITER")).ok);
  await changeMemberRole({ userId: NEW1, orgId: ORG }, OWNER, "OWNER");

  // --- 5. Removal detaches ---
  const { members } = await listMembers(ORG);
  check("the members list shows both, with emails from auth", members.length === 2 && members.some((m) => m.email === "riley@example.org"), members);
  const conv = await p.conversation.create({ data: { kind: "GROUP", orgId: ORG, name: "Team A", createdById: OWNER } });
  await p.conversationParticipant.create({ data: { conversationId: conv.id, profileId: NEW1, role: "MANAGER", addedById: OWNER } });
  // Owner B is removed while their own request is still in flight: it must not land.
  await p.profile.update({ where: { id: NEW1 }, data: { orgId: null } });
  const ghost = await changeMemberRole({ userId: NEW1, orgId: ORG }, OWNER, "RECRUITER");
  check("a removed owner's in-flight change is refused (owner re-checked under the lock)", !ghost.ok && /Only an owner/.test(ghost.ok ? "" : ghost.reason));
  await p.profile.update({ where: { id: NEW1 }, data: { orgId: ORG } });
  const rm = await removeMember(owner, NEW1);
  const gone = await p.profile.findUniqueOrThrow({ where: { id: NEW1 } });
  check("removing detaches: no org, role and profile kept, audited", rm.ok && gone.orgId === null && gone.role === "OWNER" && !gone.closedAt && (await audits("member.removed")) === 1);
  const part = await p.conversationParticipant.findFirstOrThrow({ where: { conversationId: conv.id, profileId: NEW1 } });
  check("the chat trigger ends their conversations (history read-only up to now)", !!part.removedAt);
  check("they're off the members list", (await listMembers(ORG)).members.length === 1);
  check("a detached member isn't pulled back in on sign-in", (await ensureAccount({ ...confirmed(NEW1, "riley@example.org"), user_metadata: {} })) && (await p.profile.findUniqueOrThrow({ where: { id: NEW1 } })).orgId === null);
  const back = await inviteMember(owner, { email: "riley@example.org", role: "PUBLISHER" }, mail);
  check("a detached member can be invited back", back.ok, back);
  check("…and nothing happens until they accept", !(await acceptInvite(confirmed(NEW1, "riley@example.org"))) && (await p.profile.findUniqueOrThrow({ where: { id: NEW1 } })).orgId === null);
  const waiting = await pendingInvitesFor(confirmed(NEW1, "riley@example.org"));
  check("they see the invite with the org's name and role", waiting.length === 1 && waiting[0].org.name === "Front Range Circulators" && waiting[0].role === "PUBLISHER", waiting);
  check("an invite id that isn't theirs can't be accepted", !(await acceptInvite(confirmed(NEW1, "riley@example.org"), { inviteId: lure.ok ? lure.inviteId : "x" })));
  const rejoined = await acceptInvite(confirmed(NEW1, "riley@example.org"), { inviteId: waiting[0]?.id });
  const r2 = await p.profile.findUniqueOrThrow({ where: { id: NEW1 } });
  check("accepting rejoins them with the new invite's role", rejoined && r2.orgId === ORG && r2.role === "PUBLISHER", r2);

  // --- 6. No worker directory: profiles only through your own jobs ---
  const ownerSession = { role: "OWNER" as const, workerId: null, orgId: ORG };
  check("an org sees a worker linked to its jobs", (await workerAccessFor(ownerSession, W1, true)).kind === "employer");
  check("…but not one it has no link to (no browsing by id)", (await workerAccessFor(ownerSession, W2, true)).kind === "denied");
  check("another organization can't see the first org's worker", (await workerAccessFor({ role: "OWNER", workerId: null, orgId: ORG2 }, W1, true)).kind === "denied");
  check("a publisher (no hiring access) sees no worker profiles", (await workerAccessFor({ role: "PUBLISHER", workerId: null, orgId: ORG }, W1, true)).kind === "denied");
  check("a detached member sees none", (await workerAccessFor({ role: "OWNER", workerId: null, orgId: null }, W1, true)).kind === "denied");
  await p.job.update({ where: { id: JOB }, data: { hiringMethod: { modes: ["application", "invite"] } } });
  const probe = await inviteWorker(ORG, OWNER, JOB, W2);
  const unknown = await inviteWorker(ORG, OWNER, JOB, "00000000-0000-0000-0000-00000000ffff");
  check("an org can't invite a worker who never engaged with it; same answer as an unknown id", !probe.ok && !unknown.ok && probe.reason === unknown.reason && /not found/.test(probe.reason), { probe, unknown });
  check("…so no INVITED row unlocks their profile", (await p.engagement.count({ where: { workerId: W2 } })) === 0 && (await workerAccessFor(ownerSession, W2, true)).kind === "denied");
  const org2Job = await p.job.create({ data: { orgId: ORG2, jurisdictionId: (await p.job.findUniqueOrThrow({ where: { id: JOB } })).jurisdictionId, type: "PETITION", title: "Other drive", description: "x", status: "PUBLISHED", startsAt: new Date(), endsAt: new Date(Date.now() + 9 * DAY), geography: {}, compensationMethod: "HOURLY", payRateCents: 2500, headcount: 5, hiringMethod: { mode: "invite" } } });
  await p.engagement.create({ data: { jobId: org2Job.id, workerId: W2, status: "INVITED" } });
  check("an invitation alone (the org's own act) doesn't count as a relationship", (await workerAccessFor({ role: "OWNER", workerId: null, orgId: ORG2 }, W2, true)).kind === "denied");

  // --- 7. Database guards ---
  const lower = await p.$executeRaw`INSERT INTO "OrgInvite" (id, "orgId", email, role, "invitedById", "expiresAt") VALUES (gen_random_uuid(), ${ORG}::uuid, 'UPPER@example.org', 'RECRUITER', ${OWNER}::uuid, now())`.then(() => true, () => false);
  const wk = await p.$executeRaw`INSERT INTO "OrgInvite" (id, "orgId", email, role, "invitedById", "expiresAt") VALUES (gen_random_uuid(), ${ORG}::uuid, 'w@example.org', 'WORKER', ${OWNER}::uuid, now())`.then(() => true, () => false);
  check("the database refuses mixed-case emails and WORKER invites", !lower && !wk);

  await p.$disconnect();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
