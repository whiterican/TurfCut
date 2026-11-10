/* Channels acceptance checks (prisma/p2-channels.sql, lib/chat-data.ts), against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { addMembers, archiveChannel, browseChannels, createChannel, ensureGeneral, joinChannel, leaveChannel, listThreads, openThread, removeMember, sendMessage, unreadTotal, type ChatUser } from "@/lib/chat-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const JOB = "00000000-0000-0000-0000-000000000011";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const FIN = "00000000-0000-0000-0000-0000000000ab";
const COMP = "00000000-0000-0000-0000-0000000000ac";
const OWNER2 = "00000000-0000-0000-0000-0000000000cc";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = async (work: () => Promise<unknown>) => work().then(() => false, () => true);
const noStore = { put: async () => {}, remove: async () => {}, signedUrl: async () => "" };

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Other Org", approved: true } });
  await p.profile.createMany({
    data: [
      { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
      { id: FIN, role: "FINANCE", orgId: ORG, displayName: "Fin Ops" },
      { id: COMP, role: "COMPLIANCE", orgId: ORG },
      { id: OWNER2, role: "OWNER", orgId: ORG2 },
    ],
  });
  const owner: ChatUser = { userId: OWNER, role: "OWNER", orgId: ORG };
  const fin: ChatUser = { userId: FIN, role: "FINANCE", orgId: ORG };
  const owner2: ChatUser = { userId: OWNER2, role: "OWNER", orgId: ORG2 };
  // The seed's hired worker on the seed job, and a worker hired nowhere.
  const hire = await p.engagement.findFirstOrThrow({ where: { jobId: JOB, status: { in: ["ACTIVE", "CLAIMED"] } }, include: { worker: true } });
  const hired: ChatUser = { userId: hire.worker.profileId, role: "WORKER", orgId: null };
  const stranger = await p.worker.findFirstOrThrow({ where: { engagements: { none: {} } } });
  const live = (conversationId: string, profileId: string) => p.conversationParticipant.count({ where: { conversationId, profileId, removedAt: null } });

  // --- The general channel ---
  await Promise.all([ensureGeneral(fin), ensureGeneral(owner), ensureGeneral(fin)]);
  const generals = await p.conversation.findMany({ where: { orgId: ORG, isGeneral: true }, include: { participants: true } });
  check("an organization gets exactly one general channel, however many people open Messages at once", generals.length === 1, generals.length);
  const general = generals[0];
  check("everyone on staff is in it from the start, including someone who has not opened Messages", [OWNER, FIN, COMP].every((id) => general.participants.some((x) => x.profileId === id && !x.removedAt && x.role === "MEMBER")), general.participants);
  check("no worker is in it", general.participants.every((x) => ![hired.userId, stranger.profileId].includes(x.profileId)));
  check("a worker has no general channel", (await ensureGeneral(hired), (await p.conversation.count({ where: { isGeneral: true } })) === 1));
  check("nobody leaves the general channel", !(await leaveChannel(fin, general.id)).ok);
  check("nobody is removed from the general channel", !(await removeMember(owner, general.id, FIN)).ok);
  check("the general channel is never archived", !(await archiveChannel(owner, general.id)).ok);
  check("the name is kept for it: nobody creates a second #general", !(await createChannel(owner, { name: " #General ", topic: "", staffOnly: true, jobIds: [] })).ok);

  // --- Creating ---
  check("Finance cannot create a channel", !(await createChannel(fin, { name: "numbers", topic: "", staffOnly: true, jobIds: [] })).ok);
  const made = await createChannel(owner, { name: "Denver Sales", topic: "Door numbers", staffOnly: true, jobIds: [] });
  if (!made.ok) throw new Error(made.reason);
  const staff = made.conversationId;
  check("a name is taken once per organization, whatever the letter case", !(await createChannel(owner, { name: "DENVER sales", topic: "", staffOnly: true, jobIds: [] })).ok);
  check("another organization may use the same name", (await createChannel(owner2, { name: "denver-sales", topic: "", staffOnly: true, jobIds: [] })).ok);
  check("a channel with workers needs a job", !(await createChannel(owner, { name: "team-a", topic: "", staffOnly: false, jobIds: [] })).ok);
  check("and only this organization's jobs", !(await createChannel(owner2, { name: "team-b", topic: "", staffOnly: false, jobIds: [JOB] })).ok);
  const teamMade = await createChannel(owner, { name: "team-a", topic: "", staffOnly: false, jobIds: [JOB] });
  if (!teamMade.ok) throw new Error(teamMade.reason);
  const team = teamMade.conversationId;

  // --- Browsing and joining ---
  check("staff see their organization's channels, joined or not", JSON.stringify((await browseChannels(fin)).map((c) => [c.name, c.joined])) === JSON.stringify([["general", true], ["denver-sales", false], ["team-a", false]]), await browseChannels(fin));
  check("a worker has nothing to browse", (await browseChannels(hired)).length === 0);
  check("another organization sees none of them", (await browseChannels(owner2)).every((c) => c.id !== staff && c.id !== team));
  check("someone not in a channel cannot open it", (await openThread(fin, staff)) === null);
  await sendMessage(owner, staff, "First message", null, noStore);
  check("Finance joins without the Messages area", (await joinChannel(fin, staff)).ok);
  const opened = await openThread(fin, staff);
  check("and reads what was said before joining, and may post", opened?.messages.length === 1 && opened.access.post === true, opened?.messages.length);
  check("joining does not count the history as unread", (await unreadTotal(fin)) === 0, await unreadTotal(fin));
  check("a worker cannot join by themself", !(await joinChannel(hired, team)).ok && (await live(team, hired.userId)) === 0);
  check("another organization's staff cannot join, and are told only 'not found'", JSON.stringify(await joinChannel(owner2, staff)) === JSON.stringify({ ok: false, reason: "Conversation not found." }));
  check("nor archive it", !(await archiveChannel(owner2, staff)).ok && (await p.conversation.findUniqueOrThrow({ where: { id: staff } })).archivedAt === null);
  check("nor add or remove its members", !(await addMembers(owner2, staff, [OWNER2])).ok && !(await removeMember(owner2, staff, FIN)).ok);

  // --- Workers ---
  check("a worker is never added to a staff-only channel", !(await addMembers(owner, staff, [hired.userId])).ok && (await live(staff, hired.userId)) === 0);
  check("a worker not hired on the channel's jobs is not added", !(await addMembers(owner, team, [stranger.profileId])).ok && (await live(team, stranger.profileId)) === 0);
  check("a worker hired on them is", (await addMembers(owner, team, [hired.userId])).ok && (await live(team, hired.userId)) === 1);
  check("and posts while hired", (await sendMessage(hired, team, "On my way", null, noStore)).ok);
  check("the worker sees that channel and no staff-only one", JSON.stringify((await listThreads(hired)).threads.filter((t) => t.kind === "CHANNEL").map((t) => t.title)) === JSON.stringify(["team-a"]));
  check("a worker does not leave by themself (a manager, or the hire ending, takes them out)", !(await leaveChannel(hired, team)).ok);

  // --- The database's own guards ---
  const part = (conversationId: string, profileId: string, role: "WORKER" | "MANAGER" | "MEMBER") => p.conversationParticipant.create({ data: { conversationId, profileId, role, addedById: OWNER } });
  check("database: no worker in a staff-only channel", await refused(() => part(staff, stranger.profileId, "WORKER")));
  check("database: staff are MEMBER in a channel, never MANAGER", await refused(() => part(staff, COMP, "MANAGER")));
  check("database: a MEMBER belongs to the channel's organization", await refused(() => part(staff, OWNER2, "MEMBER")));
  check("database: a worker login is never a MEMBER", await refused(() => part(team, stranger.profileId, "MEMBER")));
  check("database: one general channel per organization", await refused(() => p.conversation.create({ data: { kind: "CHANNEL", orgId: ORG, name: "general-2", staffOnly: true, isGeneral: true, createdById: OWNER } })));
  check("database: channel columns only on channels", await refused(() => p.conversation.create({ data: { kind: "GROUP", orgId: ORG, name: "x", staffOnly: true, createdById: OWNER } })));
  check("database: a channel with a worker in it cannot be made staff-only", await refused(() => p.conversation.update({ where: { id: team }, data: { staffOnly: true } })));

  // --- Leaving, archiving ---
  check("Finance leaves", (await leaveChannel(fin, staff)).ok && (await live(staff, FIN)) === 0);
  const after = await openThread(fin, staff);
  check("and keeps the history up to then, read-only", after?.messages.length === 1 && after.access.post === false);
  check("and may join again", (await joinChannel(fin, staff)).ok && (await live(staff, FIN)) === 1);
  check("the owner archives the channel", (await archiveChannel(owner, staff)).ok);
  check("an archived channel takes no new message", !(await sendMessage(fin, staff, "too late", null, noStore)).ok);
  check("nor new members", !(await joinChannel({ userId: COMP, role: "COMPLIANCE", orgId: ORG }, staff)).ok);
  check("and leaves the list to join", (await browseChannels(fin)).every((c) => c.id !== staff));
  check("its name is free again", (await createChannel(owner, { name: "denver-sales", topic: "", staffOnly: true, jobIds: [] })).ok);

  // --- Leaving the organization, by any path ---
  await joinChannel(fin, team);
  const mine = () => p.conversationParticipant.count({ where: { profileId: FIN, role: "MEMBER", removedAt: null } });
  check("Finance is in several channels", (await mine()) >= 2, await mine());
  await p.profile.update({ where: { id: FIN }, data: { orgId: null } });
  check("leaving the organization ends every channel membership", (await mine()) === 0, await mine());
  const gone: ChatUser = { userId: FIN, role: "FINANCE", orgId: null };
  check("and they read none of it afterwards, not even the history", (await openThread(gone, team)) === null && (await openThread(gone, general.id)) === null);
  check("nor see it listed", (await listThreads(gone)).threads.length === 0, (await listThreads(gone)).threads.map((t) => t.title));
  await p.profile.update({ where: { id: FIN }, data: { orgId: ORG } });
  await ensureGeneral(fin);
  check("coming back puts them in the general channel again", (await live(general.id, FIN)) === 1);
  await p.profile.update({ where: { id: COMP }, data: { closedAt: new Date() } });
  check("a closed staff account leaves its channels", (await p.conversationParticipant.count({ where: { profileId: COMP, removedAt: null } })) === 0);
  await p.profile.update({ where: { id: FIN }, data: { role: "PUBLISHER" } });
  check("a change from one staff role to another keeps channel membership", (await live(general.id, FIN)) === 1);

  // --- The hire ending ---
  await p.engagement.update({ where: { id: hire.id }, data: { status: "COMPLETED" } });
  check("a worker whose hire ends leaves the channel", (await live(team, hired.userId)) === 0);

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
