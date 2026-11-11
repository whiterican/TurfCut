/* Channels acceptance checks (prisma/p2-channels.sql, lib/chat-data.ts), against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { addMembers, archiveChannel, blockProfile, colleagues, startStaffDm, unblockProfile, browseChannels, createChannel, ensureGeneral, joinChannel, leaveChannel, listThreads, openReplies, openThread, removeMember, sendMessage, toggleReaction, unreadTotal, type ChatUser } from "@/lib/chat-data";

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
  // Finance, once in the team channel (joined below), as a second staff voice.
  const fin2 = () => fin;
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

  // --- Threads and reactions (prisma/p2-threads.sql) ---
  const asked = await sendMessage(owner, team, "Who has Elm Street?", null, noStore);
  if (!asked.ok) throw new Error(asked.reason);
  const r1 = await sendMessage(hired, team, "I do", null, noStore, asked.messageId);
  const r2 = await sendMessage(owner, team, "Thanks", null, noStore, asked.messageId);
  check("people in the conversation reply under a message", r1.ok && r2.ok);
  let main = await openThread(owner, team);
  const head = main?.messages.find((m) => m.id === asked.messageId);
  check("replies stay out of the main conversation, which shows their count", !!main && main.messages.every((m) => m.parentId === null) && head?.replies === 2, main?.messages.map((m) => [m.body, m.replies]));
  const thread = await openReplies(hired, team, asked.messageId);
  check("the thread shows the message and its replies in order", thread?.parent.id === asked.messageId && JSON.stringify(thread.replies.map((m) => m.body)) === JSON.stringify(["I do", "Thanks"]));
  check("a reply can be reacted to", r1.ok && (await toggleReaction(owner, r1.messageId, "\u2705")).ok && (await openReplies(owner, team, asked.messageId))?.replies[0].reactions[0]?.emoji === "\u2705");
  check("a reply is not replied to", r1.ok && !(await sendMessage(owner, team, "nested", null, noStore, r1.messageId)).ok);
  check("a reply cannot name a message from another conversation", !(await sendMessage(owner, staff, "wrong place", null, noStore, asked.messageId)).ok);
  check("someone outside the conversation cannot open its thread", (await openReplies(owner2, team, asked.messageId)) === null && (await openReplies(fin, team, asked.messageId)) === null);
  check("nor reply into it", !(await sendMessage(fin, team, "hello", null, noStore, asked.messageId)).ok);
  check("database: a reply belongs to its parent's conversation", await refused(() => p.message.create({ data: { conversationId: staff, senderId: OWNER, body: "x", parentId: asked.messageId } })));
  check("database: a reply has no replies", r1.ok && (await refused(() => p.message.create({ data: { conversationId: team, senderId: OWNER, body: "x", parentId: r1.messageId } }))));
  check("opening the thread reads its replies when nothing else is waiting", (await unreadTotal(hired)) === 0, await unreadTotal(hired));

  // One read mark covers a conversation: a thread never moves it past something not yet shown.
  const t2 = await sendMessage(owner, team, "Top-level, not seen yet", null, noStore);
  await sendMessage(owner, team, "A new reply", null, noStore, asked.messageId);
  check("two unread: a new message in the main conversation and a new reply", (await unreadTotal(hired)) === 2, await unreadTotal(hired));
  await openReplies(hired, team, asked.messageId);
  check("opening only the thread leaves the badge: the main conversation's message was never shown", (await unreadTotal(hired)) === 2, await unreadTotal(hired));
  await sendMessage(hired, team, "Replying from the thread", null, noStore, asked.messageId);
  check("replying from a thread marks nothing read either", (await unreadTotal(hired)) === 2, await unreadTotal(hired));
  const seenMain = await openThread(hired, team);
  check("the main conversation says how many replies are new", seenMain?.messages.find((m) => m.id === asked.messageId)?.newReplies === 1, seenMain?.messages.map((m) => [m.body, m.replies, m.newReplies]));
  check("and opening it clears the badge", t2.ok && (await unreadTotal(hired)) === 0 && (await openThread(hired, team))?.messages.find((m) => m.id === asked.messageId)?.newReplies === 0, await unreadTotal(hired));

  const up = "\u{1F44D}";
  check("a person in the conversation reacts", (await toggleReaction(hired, asked.messageId, up)).ok && (await toggleReaction(owner, asked.messageId, up)).ok);
  main = await openThread(owner, team);
  check("the count is shared, and each sees whether theirs is in it", JSON.stringify(main?.messages.find((m) => m.id === asked.messageId)?.reactions) === JSON.stringify([{ emoji: up, count: 2, mine: true }]), main?.messages.find((m) => m.id === asked.messageId)?.reactions);
  const off = await toggleReaction(owner, asked.messageId, up);
  check("the same mark again takes it back, and the row stays as history", off.ok && off.on === false && (await p.messageReaction.count({ where: { messageId: asked.messageId } })) === 2 && (await p.messageReaction.count({ where: { messageId: asked.messageId, removedAt: null } })) === 1);
  check("only the fixed marks are accepted", !(await toggleReaction(owner, asked.messageId, "\u{1F4A9}")).ok && !(await toggleReaction(owner, asked.messageId, "")).ok);
  check("someone outside the conversation cannot react", !(await toggleReaction(owner2, asked.messageId, up)).ok && !(await toggleReaction(fin, asked.messageId, up)).ok);
  check("database: only the fixed marks", await refused(() => p.messageReaction.create({ data: { messageId: asked.messageId, conversationId: team, profileId: OWNER, emoji: "x" } })));
  check("database: one live mark per person per message", await refused(() => p.messageReaction.create({ data: { messageId: asked.messageId, conversationId: team, profileId: hired.userId, emoji: up } })));
  const scoped = await p.messageReaction.create({ data: { messageId: asked.messageId, conversationId: staff, profileId: OWNER, emoji: "\u2705" } });
  check("database: a reaction's conversation always matches its message", scoped.conversationId === team);
  await joinChannel(fin, team);
  // A worker who blocks a staff member sees neither their new replies nor their reactions.
  await blockProfile(hired, OWNER);
  await sendMessage(owner, team, "After the block", null, noStore, asked.messageId);
  const blockedView = await openReplies(hired, team, asked.messageId);
  const blockedMain = await openThread(hired, team);
  const mineOnly = (v: typeof blockedView) => v?.replies.filter((m) => m.senderId !== hired.userId).map((m) => m.body);
  check("a blocked person's new replies are hidden, in the thread and in the count", !mineOnly(blockedView)?.includes("After the block") && blockedMain?.messages.find((m) => m.id === asked.messageId)?.replies === blockedView?.replies.length, mineOnly(blockedView));
  check("and their reactions are not counted", JSON.stringify(blockedView?.parent.reactions) === JSON.stringify([{ emoji: up, count: 1, mine: true }]), blockedView?.parent.reactions);
  // A mark and a message the blocked person makes during the block, then the block is lifted.
  await toggleReaction(owner, asked.messageId, "\u{1F389}");
  const hiddenTop = await sendMessage(owner, team, "Sent while blocked", null, noStore);
  const under = hiddenTop.ok ? await sendMessage(fin2(), team, "Someone else answers it", null, noStore, hiddenTop.messageId) : hiddenTop;
  const stuck = await openThread(hired, team);
  check("a reply under a message I can't see is shown in the main conversation, not lost", under.ok && stuck?.messages.some((m) => m.body === "Someone else answers it") && !stuck.messages.some((m) => m.body === "Sent while blocked"), stuck?.messages.map((m) => m.body));
  check("and it is read once shown", (await unreadTotal(hired)) === 0, await unreadTotal(hired));
  await unblockProfile(hired, OWNER);
  const afterUnblock = await openReplies(hired, team, asked.messageId);
  check("after unblocking, what they sent and marked during the block stays hidden", !afterUnblock?.replies.some((m) => m.body === "After the block") && !afterUnblock?.parent.reactions.some((r) => r.emoji === "\u{1F389}"), afterUnblock?.parent.reactions);
  // A removed member sees marks as they stood when they were removed.
  await toggleReaction(fin2(), asked.messageId, "\u{1F440}"); // a mark that stands when the worker is removed
  await removeMember(owner, team, hired.userId);
  await toggleReaction(fin2(), asked.messageId, up); // added after
  await toggleReaction(fin2(), asked.messageId, "\u{1F440}"); // taken back after
  const removedView = await openReplies(hired, team, asked.messageId);
  check("a removed member sees the marks as they stood at removal: none added later", removedView?.parent.reactions.find((r) => r.emoji === up)?.count === 1, removedView?.parent.reactions);
  check("and one taken back later still shows for them", removedView?.parent.reactions.find((r) => r.emoji === "\u{1F440}")?.count === 1, removedView?.parent.reactions);
  check("while a current member sees it gone", !(await openReplies(owner, team, asked.messageId))?.parent.reactions.some((r) => r.emoji === "\u{1F440}"));
  check("and can neither reply nor react", !(await sendMessage(hired, team, "still here?", null, noStore, asked.messageId)).ok && !(await toggleReaction(hired, asked.messageId, "\u2705")).ok);
  await addMembers(owner, team, [hired.userId]);

  const part = (conversationId: string, profileId: string, role: "WORKER" | "MANAGER" | "MEMBER") => p.conversationParticipant.create({ data: { conversationId, profileId, role, addedById: OWNER } });
  // --- Staff conversations, one to one (prisma/p2-dm-mentions.sql) ---
  const comp: ChatUser = { userId: COMP, role: "COMPLIANCE", orgId: ORG };
  check("staff see their colleagues, never workers or other organizations", JSON.stringify((await colleagues(fin)).map((c) => c.profileId).sort()) === JSON.stringify([OWNER, COMP].sort()), (await colleagues(fin)).map((c) => c.name));
  check("a worker has no colleagues to message here", (await colleagues(hired)).length === 0);
  const dm1 = await startStaffDm(fin, COMP);
  const dm2 = await startStaffDm(comp, FIN);
  check("two staff members, neither with the Messages area, start a conversation", dm1.ok);
  check("a pair has one conversation, whoever opens it", dm1.ok && dm2.ok && dm1.conversationId === dm2.conversationId && (await p.conversation.count({ where: { kind: "STAFF_DM", orgId: ORG } })) === 1);
  const dm = dm1.ok ? dm1.conversationId : "";
  check("both post in it", (await sendMessage(fin, dm, "Can you check the Denver certificates?", null, noStore)).ok && (await sendMessage(comp, dm, "On it", null, noStore)).ok);
  const dmView = await openThread(fin, dm);
  check("it is named after the other person, with their role", dmView?.kind === "STAFF_DM" && dmView.subtitle === "Compliance" && dmView.messages.length === 2, [dmView?.title, dmView?.subtitle]);
  check("nobody else reads it: not the owner, not a worker", (await openThread(owner, dm)) === null && (await openThread(hired, dm)) === null);
  check("nor posts in it, nor adds anyone to it", !(await sendMessage(owner, dm, "hello", null, noStore)).ok && !(await addMembers(owner, dm, [OWNER])).ok && !(await joinChannel(owner, dm)).ok);
  check("no conversation with a worker, another organization's staff, or yourself", !(await startStaffDm(fin, hired.userId)).ok && !(await startStaffDm(fin, OWNER2)).ok && !(await startStaffDm(fin, FIN)).ok && !(await startStaffDm(hired, OWNER)).ok);
  check("database: a staff conversation holds only its two people", await refused(() => part(dm, OWNER, "MEMBER")));
  check("database: and no workers or managers", (await refused(() => part(dm, hired.userId, "WORKER"))) && (await refused(() => part(dm, OWNER, "MANAGER"))));
  check("database: a pair key belongs to staff conversations only, lower id first", (await refused(() => p.conversation.create({ data: { kind: "CHANNEL", orgId: ORG, name: "keyed", staffOnly: true, dmKey: `${FIN}:${COMP}`, createdById: OWNER } }))) && (await refused(() => p.conversation.create({ data: { kind: "STAFF_DM", orgId: ORG, dmKey: `${OWNER2}:${OWNER}`, createdById: OWNER } }))));

  // --- Mentions ---
  await p.profile.update({ where: { id: COMP }, data: { displayName: "Casey Lee" } });
  const mention = await sendMessage(owner, team, "@Fin Ops and @casey lee: sheets are due Friday. cc @Nobody", null, noStore);
  if (!mention.ok) throw new Error(mention.reason);
  const namedRows = await p.messageMention.findMany({ where: { messageId: mention.messageId } });
  check("a message names the people in the conversation it @-mentions, and nobody outside it", JSON.stringify(namedRows.map((r) => r.profileId)) === JSON.stringify([FIN]) && namedRows[0].conversationId === team, namedRows.map((r) => r.profileId));
  const finList = (await listThreads(fin)).threads.find((t) => t.id === team);
  check("the person named sees it on the conversation in their list", finList?.mentions === 1, finList?.mentions);
  const finMain = await openThread(fin, team);
  check("and on the message itself", finMain?.messages.find((m) => m.id === mention.messageId)?.mentionsMe === true && (await openThread(owner, team))?.messages.find((m) => m.id === mention.messageId)?.mentionsMe === false);
  check("once read, it no longer counts", (await listThreads(fin)).threads.find((t) => t.id === team)?.mentions === 0);
  check("the composer offers the other people in the conversation", JSON.stringify(finMain?.mentionable) === JSON.stringify([...(finMain?.members ?? [])].filter((m) => !m.isMe && !m.removed).map((m) => m.name).sort((a, b) => a.localeCompare(b))), finMain?.mentionable);
  await blockProfile(hired, OWNER);
  const blockedMention = await sendMessage(owner, team, `@${hire.worker.displayName} are you there?`, null, noStore);
  check("someone who has blocked the sender is not named (they never see the message)", blockedMention.ok && (await p.messageMention.count({ where: { messageId: blockedMention.messageId } })) === 0);
  await unblockProfile(hired, OWNER);
  check("database: a mention is never changed or removed", (await refused(() => p.messageMention.update({ where: { id: namedRows[0].id }, data: { profileId: OWNER } }))) && (await refused(() => p.messageMention.delete({ where: { id: namedRows[0].id } }))));

  // --- A reply under a message older than the page ---
  const longMade = await createChannel(owner, { name: "long-channel", topic: "", staffOnly: true, jobIds: [] });
  if (!longMade.ok) throw new Error(longMade.reason);
  const long = longMade.conversationId;
  await joinChannel(fin, long);
  const old = await sendMessage(owner, long, "An old question", null, noStore);
  if (!old.ok) throw new Error(old.reason);
  const base = (await p.message.findUniqueOrThrow({ where: { id: old.messageId } })).createdAt.getTime();
  await p.message.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ conversationId: long, senderId: OWNER, body: `filler ${i}`, createdAt: new Date(base + 1000 + i) })) });
  await p.conversation.update({ where: { id: long }, data: { lastMessageAt: new Date(base + 1300) } });
  await openThread(fin, long);
  // Finance has unread messages in other channels; this one is measured against that.
  const elsewhere = await unreadTotal(fin);
  await sendMessage(owner, long, "A late answer to the old question", null, noStore, old.messageId);
  check("the late reply is unread", (await unreadTotal(fin)) === elsewhere + 1, [elsewhere, await unreadTotal(fin)]);
  const longView = await openThread(fin, long);
  check("a reply under a message older than the page is shown in the main conversation", longView?.hasOlder === true && !longView.messages.some((m) => m.id === old.messageId) && longView.messages.at(-1)?.body === "A late answer to the old question", longView?.messages.slice(-2).map((m) => m.body));
  check("and read once shown", (await unreadTotal(fin)) === elsewhere, [elsewhere, await unreadTotal(fin)]);
  await leaveChannel(fin, long);

  // --- The database's own guards ---
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
  // Something Finance has not read yet, in a channel they are about to lose.
  await sendMessage(owner, team, "After you joined", null, noStore);
  check("an unread message counts while they are on staff", (await unreadTotal(fin)) >= 1, await unreadTotal(fin));
  await p.profile.update({ where: { id: FIN }, data: { orgId: null } });
  check("leaving the organization ends every channel membership", (await mine()) === 0, await mine());
  const gone: ChatUser = { userId: FIN, role: "FINANCE", orgId: null };
  check("and they read none of it afterwards, not even the history", (await openThread(gone, team)) === null && (await openThread(gone, general.id)) === null);
  check("nor see it listed", (await listThreads(gone)).threads.length === 0, (await listThreads(gone)).threads.map((t) => t.title));
  check("nor carry an unread badge for it", (await unreadTotal(gone)) === 0, await unreadTotal(gone));
  check("their staff conversation is closed to them too", (await openThread(gone, dm)) === null);
  const left = await openThread(comp, dm);
  check("and read-only for the colleague who stayed, who keeps the history", left?.access.post === false && left.messages.length === 2 && left.access.closed === "This person is no longer in your organization. History is read-only.", left?.access);
  await p.profile.update({ where: { id: FIN }, data: { orgId: ORG } });
  await ensureGeneral(fin);
  check("coming back puts them in the general channel again", (await live(general.id, FIN)) === 1);
  const again = await startStaffDm(fin, COMP);
  check("and reopens the same staff conversation", again.ok && again.conversationId === dm && (await openThread(fin, dm))?.access.post === true && (await openThread(comp, dm))?.access.post === true);
  await p.profile.update({ where: { id: COMP }, data: { closedAt: new Date() } });
  check("a closed staff account leaves its channels", (await p.conversationParticipant.count({ where: { profileId: COMP, removedAt: null } })) === 0);
  await p.profile.update({ where: { id: FIN }, data: { role: "PUBLISHER" } });
  check("a change from one staff role to another keeps channel membership", (await live(general.id, FIN)) === 1);

  // --- Times are the database's UTC wall clock, whatever the session's time zone ---
  await p.$executeRawUnsafe(`ALTER DATABASE "${(await p.$queryRaw<{ d: string }[]>`SELECT current_database() AS d`)[0].d}" SET timezone TO 'America/Denver'`);
  await p.$disconnect();
  const late = "00000000-0000-0000-0000-0000000000ad";
  await p.profile.create({ data: { id: late, role: "RECRUITER", orgId: ORG } });
  await ensureGeneral({ userId: late, role: "RECRUITER", orgId: ORG });
  const [clock] = await p.$queryRaw<{ now: Date; tz: string }[]>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS "now", current_setting('TimeZone') AS "tz"`;
  const row = await p.conversationParticipant.findFirstOrThrow({ where: { conversationId: general.id, profileId: late } });
  check("a member added to the general channel is stamped in UTC under a session in another time zone", clock.tz === "America/Denver" && Math.abs(row.addedAt.getTime() - clock.now.getTime()) < 60_000 && Math.abs((row.lastReadAt?.getTime() ?? 0) - clock.now.getTime()) < 60_000, { tz: clock.tz, addedAt: row.addedAt, now: clock.now });

  // --- A channel named "general" made by hand before the name was kept ---
  const ORG3 = "00000000-0000-0000-0000-000000000003";
  const OWNER3 = "00000000-0000-0000-0000-0000000000dd";
  await p.organization.create({ data: { id: ORG3, name: "Third Org", approved: true } });
  await p.profile.create({ data: { id: OWNER3, role: "OWNER", orgId: ORG3 } });
  const owner3: ChatUser = { userId: OWNER3, role: "OWNER", orgId: ORG3 };
  const legacy = await p.conversation.create({ data: { kind: "CHANNEL", orgId: ORG3, name: "General", staffOnly: true, createdById: OWNER3 } });
  await ensureGeneral(owner3);
  const adopted = await p.conversation.findMany({ where: { orgId: ORG3, isGeneral: true } });
  check("a staff-only channel already named general becomes the general channel, instead of breaking Messages", adopted.length === 1 && adopted[0].id === legacy.id && (await listThreads(owner3)).threads.some((t) => t.id === legacy.id), adopted);

  // --- The hire ending ---
  await p.engagement.update({ where: { id: hire.id }, data: { status: "COMPLETED" } });
  check("a worker whose hire ends leaves the channel", (await live(team, hired.userId)) === 0);

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
