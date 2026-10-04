/* C1.1 acceptance checks: member invites, joining, roles, removal, and no worker directory, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { acceptInvite, changeMemberRole, inviteMember, listMembers, removeMember, resendInvite, revokeInvite, type InviteMailer } from "@/lib/members-data";
import { ensureAccount, SIGNUP_METADATA_KEY } from "@/lib/account";
import { workerAccessFor } from "@/lib/worker-access-data";

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
  const worker = await inviteMember(owner, { email: "alex@example.org", role: "RECRUITER" }, mail);
  check("an email that belongs to a worker account can't be invited (generic reason)", !worker.ok && /another Turfcut account/.test(worker.ok ? "" : worker.reason), worker);
  const otherOrg = await inviteMember(owner, { email: "boss@other.org", role: "RECRUITER" }, mail);
  check("…nor one that belongs to another organization's member (same generic reason)", !otherOrg.ok && /another Turfcut account/.test(otherOrg.ok ? "" : otherOrg.reason));
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
    check("a resend moves the expiry 7 days out and is audited", resent.ok && after.expiresAt.getTime() > Date.now() + 6 * DAY && (await audits("invite.resent")) === 1);
    const foreign = await resendInvite({ userId: OTHER, orgId: ORG2 }, unsent.inviteId, mail);
    const foreignRevoke = await revokeInvite({ userId: OTHER, orgId: ORG2 }, unsent.inviteId);
    check("another organization can't resend or revoke it", !foreign.ok && !foreignRevoke.ok);
    const rv = await revokeInvite(owner, unsent.inviteId);
    check("the owner revokes it; audited", rv.ok && (await audits("invite.revoked")) === 1);
    check("a revoked invite can't be revoked or resent again", !(await revokeInvite(owner, unsent.inviteId)).ok && !(await resendInvite(owner, unsent.inviteId, mail)).ok);
    const reinvite = await inviteMember(owner, { email: "pat@example.org", role: "SUPERVISOR" }, mail);
    check("after revoking, the same email can be invited again", reinvite.ok, reinvite);
  }
  check("a non-UUID id is simply not found", !(await revokeInvite(owner, "nope")).ok && !(await removeMember(owner, "nope")).ok);

  // --- 3. Joining ---
  await authUser(UNCONFIRMED, "riley@example.org", false);
  check("an unconfirmed email doesn't accept the invite", !(await acceptInvite({ id: UNCONFIRMED, email: "riley@example.org", email_confirmed_at: null })));
  await p.$executeRaw`DELETE FROM auth.users WHERE id = ${UNCONFIRMED}::uuid`;
  await authUser(NEW1, "riley@example.org");
  // Sign-up metadata asks for a company; the invite wins, and metadata never grants a role.
  const meta = { [SIGNUP_METADATA_KEY]: { accountType: "company", name: "Riley Park" } };
  const joined = await ensureAccount({ id: NEW1, email: "Riley@example.org", email_confirmed_at: new Date().toISOString(), user_metadata: meta });
  const riley = await p.profile.findUnique({ where: { id: NEW1 } });
  check("the confirmed invitee joins as recruiter of the inviting org, not as a new company", joined && riley?.role === "RECRUITER" && riley.orgId === ORG && riley.displayName === "Riley Park", riley);
  check("no stray organization was created for them", (await p.organization.count({ where: { name: "Riley Park" } })) === 0);
  const accepted = inv.ok ? await p.orgInvite.findUniqueOrThrow({ where: { id: inv.inviteId } }) : null;
  check("the invite is marked accepted by them; joining is audited", !!accepted?.acceptedAt && accepted.acceptedById === NEW1 && (await audits("member.joined")) === 1);
  check("an accepted invite isn't accepted twice", !(await acceptInvite({ id: NEW1, email: "riley@example.org", email_confirmed_at: new Date().toISOString() })));
  const expired = await inviteMember(owner, { email: "quinn@example.org", role: "FINANCE" }, mail);
  if (expired.ok) await p.orgInvite.update({ where: { id: expired.inviteId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await authUser(NEW2, "quinn@example.org");
  check("an expired invite doesn't let anyone in", !(await acceptInvite({ id: NEW2, email: "quinn@example.org", email_confirmed_at: new Date().toISOString() })) && !(await p.profile.findUnique({ where: { id: NEW2 } })));
  const workerJoin = await p.orgInvite.create({ data: { orgId: ORG, email: "alex@example.org", role: "OWNER", invitedById: OWNER, expiresAt: new Date(Date.now() + DAY) } });
  check("a worker account never becomes a member, even with an invite on file", !(await acceptInvite({ id: W1_PROFILE, email: "alex@example.org", email_confirmed_at: new Date().toISOString() })) && (await p.profile.findUniqueOrThrow({ where: { id: W1_PROFILE } })).role === "WORKER");
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
  const rm = await removeMember(owner, NEW1);
  const gone = await p.profile.findUniqueOrThrow({ where: { id: NEW1 } });
  check("removing detaches: no org, role and profile kept, audited", rm.ok && gone.orgId === null && gone.role === "OWNER" && !gone.closedAt && (await audits("member.removed")) === 1);
  check("they're off the members list", (await listMembers(ORG)).members.length === 1);
  check("a detached member doesn't rejoin without a new invite", !(await acceptInvite({ id: NEW1, email: "riley@example.org", email_confirmed_at: new Date().toISOString() })));
  const back = await inviteMember(owner, { email: "riley@example.org", role: "PUBLISHER" }, mail);
  check("a detached member can be invited back", back.ok, back);
  const rejoined = await acceptInvite({ id: NEW1, email: "riley@example.org", email_confirmed_at: new Date().toISOString() });
  const r2 = await p.profile.findUniqueOrThrow({ where: { id: NEW1 } });
  check("…and rejoins with the new invite's role", rejoined && r2.orgId === ORG && r2.role === "PUBLISHER", r2);

  // --- 6. No worker directory: profiles only through your own jobs ---
  const ownerSession = { role: "OWNER" as const, workerId: null, orgId: ORG };
  check("an org sees a worker linked to its jobs", (await workerAccessFor(ownerSession, W1, true)).kind === "employer");
  check("…but not one it has no link to (no browsing by id)", (await workerAccessFor(ownerSession, W2, true)).kind === "denied");
  check("another organization can't see the first org's worker", (await workerAccessFor({ role: "OWNER", workerId: null, orgId: ORG2 }, W1, true)).kind === "denied");
  check("a publisher (no hiring access) sees no worker profiles", (await workerAccessFor({ role: "PUBLISHER", workerId: null, orgId: ORG }, W1, true)).kind === "denied");
  check("a detached member sees none", (await workerAccessFor({ role: "OWNER", workerId: null, orgId: null }, W1, true)).kind === "denied");

  // --- 7. Database guards ---
  const lower = await p.$executeRaw`INSERT INTO "OrgInvite" (id, "orgId", email, role, "invitedById", "expiresAt") VALUES (gen_random_uuid(), ${ORG}::uuid, 'UPPER@example.org', 'RECRUITER', ${OWNER}::uuid, now())`.then(() => true, () => false);
  const wk = await p.$executeRaw`INSERT INTO "OrgInvite" (id, "orgId", email, role, "invitedById", "expiresAt") VALUES (gen_random_uuid(), ${ORG}::uuid, 'w@example.org', 'WORKER', ${OWNER}::uuid, now())`.then(() => true, () => false);
  check("the database refuses mixed-case emails and WORKER invites", !lower && !wk);

  await p.$disconnect();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
