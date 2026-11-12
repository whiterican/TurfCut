/* Who is shown whose profile photo in a chat (lib/profile-photo-data.ts: photoViewers), against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { addMembers, archiveChannel, blockProfile, createChannel, createGroup, ensureDirect, removeMember, startStaffDm, unblockProfile, type ChatUser } from "@/lib/chat-data";
import { photoViewers } from "@/lib/profile-photo-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const JOB = "00000000-0000-0000-0000-000000000011";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const FIN = "00000000-0000-0000-0000-0000000000ab";
const REC = "00000000-0000-0000-0000-0000000000ad";
const OWNER2 = "00000000-0000-0000-0000-0000000000cc";
// The seed's workers: a worker's id and their profile's id are the same string.
const W1 = "00000000-0000-0000-0000-000000000101";
const W2 = "00000000-0000-0000-0000-000000000102";
const W3 = "00000000-0000-0000-0000-000000000103";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

// The sections run in order and build on each other's state.
(async () => {
  const p = db();
  const sees = photoViewers().sharesChat;
  await p.organization.create({ data: { id: ORG2, name: "Other Org", approved: true } });
  await p.profile.createMany({
    data: [
      { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
      { id: FIN, role: "FINANCE", orgId: ORG, displayName: "Fin Ops" },
      { id: REC, role: "RECRUITER", orgId: ORG, displayName: "Rec Ruiter" },
      { id: OWNER2, role: "OWNER", orgId: ORG2 },
    ],
  });
  const owner: ChatUser = { userId: OWNER, role: "OWNER", orgId: ORG };
  const w1: ChatUser = { userId: W1, role: "WORKER", orgId: null };
  // The seed hires worker 1 on the seed job; the owner is their contact. Worker 2 is hired too, with no thread of their own.
  const hire1 = await p.engagement.findFirstOrThrow({ where: { jobId: JOB, workerId: W1 } });
  await p.engagement.update({ where: { id: hire1.id }, data: { hiredById: OWNER } });
  await p.engagement.create({ data: { jobId: JOB, workerId: W2, status: "ACTIVE", hiredById: OWNER } });

  // --- Nobody shares a chat yet ---
  check("with no chat between them, a worker isn't shown their manager's photo", !(await sees(W1, OWNER)));
  check("…nor are two staff of one organization shown each other's", !(await sees(OWNER, FIN)));
  check("an id that is no one is shown nothing", !(await sees(W1, "00000000-0000-0000-0000-00000000dead")) && !(await sees("00000000-0000-0000-0000-00000000dead", OWNER)));

  // --- The direct thread of a hire ---
  const direct = await ensureDirect(w1, hire1.id);
  if (!direct.ok) throw new Error(`setup: direct thread: ${direct.reason}`);
  check("a hired worker is shown their manager's photo", await sees(W1, OWNER));
  check("the manager is never shown the worker's", !(await sees(OWNER, W1)));
  check("a worker with no thread to that manager is shown nothing", !(await sees(W2, OWNER)));
  await p.engagement.update({ where: { id: hire1.id }, data: { status: "CLAIMED" } });
  check("a claimed seat counts as hired", await sees(W1, OWNER));
  await p.engagement.update({ where: { id: hire1.id }, data: { status: "ACTIVE" } });

  // --- A team chat ---
  const team = await createGroup(owner, { name: "Aurora team", jobIds: [JOB], memberIds: [W1, W2, REC] });
  if (!team.ok) throw new Error(`setup: team: ${team.reason}`);
  check("teammates are shown each other's photos", (await sees(W1, W2)) && (await sees(W2, W1)));
  check("a teammate is shown the team's managers", (await sees(W2, OWNER)) && (await sees(W2, REC)) && (await sees(W1, REC)));
  check("no member of staff is shown a worker's photo, sharing a team or not", !(await sees(OWNER, W2)) && !(await sees(REC, W1)) && !(await sees(FIN, W1)));
  check("staff in one team are shown each other's", (await sees(OWNER, REC)) && (await sees(REC, OWNER)));
  check("a worker outside the team is shown no one in it", !(await sees(W3, W1)) && !(await sees(W3, OWNER)) && !(await sees(W1, W3)));

  // --- Staff to staff ---
  const dm = await startStaffDm(owner, FIN);
  if (!dm.ok) throw new Error(`setup: staff DM: ${dm.reason}`);
  check("two staff in a private conversation are shown each other's photos", (await sees(OWNER, FIN)) && (await sees(FIN, OWNER)));
  // A channel, then archived. Worker 3 is hired for it and shares nothing else with anyone
  // (staff all share the general channel once any channel exists, so two staff cannot show this).
  await p.engagement.create({ data: { jobId: JOB, workerId: W3, status: "ACTIVE", hiredById: OWNER } });
  const chan = await createChannel(owner, { name: "aurora-crew", topic: "", staffOnly: false, jobIds: [JOB] });
  if (!chan.ok) throw new Error(`setup: channel: ${chan.reason}`);
  const added = await addMembers(owner, chan.conversationId, [W3]);
  check("a worker in a channel is shown the staff in it", added.ok && (await sees(W3, OWNER)), added);
  const shut = await archiveChannel(owner, chan.conversationId);
  check("an archived channel stops counting", shut.ok && !(await sees(W3, OWNER)), shut);
  check("staff of another organization, sharing no chat, are shown nothing", !(await sees(OWNER2, OWNER)) && !(await sees(OWNER, OWNER2)));
  // Test-only row: the app never puts another organization's staff in a team. If one were there all the same, they are still shown nobody.
  const stray = await p.conversationParticipant.create({ data: { conversationId: team.conversationId, profileId: OWNER2, role: "WORKER", addedById: OWNER } });
  check("staff are shown nobody in a chat outside their own organization", !(await sees(OWNER2, OWNER)) && !(await sees(OWNER2, W1)));
  await p.conversationParticipant.update({ where: { id: stray.id }, data: { removedAt: new Date() } });

  // --- Blocking ---
  const blocked = await blockProfile(w1, OWNER);
  check("a worker's block hides the manager's photo from them", blocked.ok && !(await sees(W1, OWNER)), blocked);
  check("…and nobody else's", (await sees(W1, W2)) && (await sees(W2, OWNER)));
  const lifted = await unblockProfile(w1, OWNER);
  check("lifting the block shows it again", lifted.ok && (await sees(W1, OWNER)), lifted);
  // Test-only row: only workers can block in the app. A block hides the photo from the blocked person too.
  const back = await p.profileBlock.create({ data: { blockerId: FIN, blockedId: OWNER } });
  check("a block hides the blocker's photo from the person blocked", !(await sees(OWNER, FIN)) && !(await sees(FIN, OWNER)));
  await p.profileBlock.update({ where: { id: back.id }, data: { liftedAt: new Date() } });
  check("…until it is lifted", (await sees(OWNER, FIN)) && (await sees(FIN, OWNER)));

  // --- Leaving a team ---
  const out = await removeMember(owner, team.conversationId, W2);
  check("a worker removed from the team is no longer shown its members, nor they them", out.ok && !(await sees(W2, W1)) && !(await sees(W1, W2)) && !(await sees(W2, OWNER)), out);

  // --- A closed account (a manager stays in a team's record after closing) ---
  await p.profile.update({ where: { id: REC }, data: { closedAt: new Date() } });
  const recIn = () => p.conversationParticipant.count({ where: { conversationId: team.conversationId, profileId: REC, removedAt: null } });
  check("a closed account shows nothing and is shown nothing, still on the team's record", (await recIn()) === 1 && !(await sees(W1, REC)) && !(await sees(OWNER, REC)) && !(await sees(REC, OWNER)), await recIn());
  await p.profile.update({ where: { id: REC }, data: { closedAt: null } });
  check("…and reopened, shows again", (await sees(W1, REC)) && (await sees(OWNER, REC)));

  // --- Leaving the organization ---
  await p.profile.update({ where: { id: REC }, data: { orgId: ORG2 } });
  check("staff who moved to another organization are no longer shown the old one's people", !(await sees(REC, OWNER)) && !(await sees(OWNER, REC)));
  check("…and the worker they managed is no longer shown theirs", !(await sees(W1, REC)));

  // --- The hire ending ---
  await p.engagement.update({ where: { id: hire1.id }, data: { status: "COMPLETED" } });
  const still = await p.conversationParticipant.count({ where: { conversationId: direct.conversationId, removedAt: null } });
  check("the direct thread stays on record after the hire ends, both people in it", still === 2, still);
  const inTeam = await p.conversationParticipant.count({ where: { conversationId: team.conversationId, profileId: W1, removedAt: null } });
  check("…the worker leaves the team", inTeam === 0, inTeam);
  check("…and is no longer shown the manager's photo", !(await sees(W1, OWNER)));

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
