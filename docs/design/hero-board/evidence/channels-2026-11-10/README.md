# Channels, slice 1 (Nov 10 2026)

Caden: "slack like communications need to be built immediately". His answers on scope: channels are for staff plus hired workers, and the data-model change is approved.

This is the first slice of the private-sector milestone. It adds channels on top of the existing message tables. Threads, mentions, reactions and staff-to-staff direct messages are later slices.

## What a channel is

| Rule | Detail |
| :--- | :--- |
| General channel | Every organization has one, `#general`. It is made the first time anyone on staff opens Messages, with everyone then on staff in it; later joiners are added the next time they open Messages. Nobody leaves it, it is never archived, and its name is reserved. |
| Staff channels | Anyone on staff can browse, join and leave them, whatever their role. Workers never see them. |
| Staff and hired workers | Tied to jobs. A manager adds workers hired on those jobs; workers never join by themselves, and post only while hired, the same as team chats. |
| Who creates and manages | Whoever runs team chats today: owners, recruiters, supervisors, and custom roles with Messages. |
| Archiving | Read-only for everyone; history stays for its members. |
| Names | Stored lower case with hyphens (`#denver-sales`), unique within the organization. |

Messages is now in the navigation for every staff role, because every staff role has channels. Team chats and direct threads inside it still follow the Messages area, as before. A custom role with no grants still lands on Settings, not Messages.

Everything else is inherited from the message system unchanged: immutable messages with appended edits and deletes, reports, blocks (a worker may block staff they share a channel with), attachments, unread counts and live refresh.

## Data model (rule 8: approved by Caden)

`prisma/p2-channels.sql`, folded into `prisma/supabase-manual-setup.sql`:

- `ConversationKind` gains `CHANNEL`; `ParticipantRole` gains `MEMBER` (staff in a channel).
- `Conversation` gains `topic`, `staffOnly`, `isGeneral`, `archivedAt`, `archivedById`.
- Checks: only channels carry those columns; one general channel per organization; no two live channels with the same name.
- A trigger refuses a worker in a staff-only channel, a `MEMBER` row outside a channel, and a member from another organization, whatever path writes the row.
- Leaving the organization, becoming a worker, or closing the account ends channel membership (its own trigger).
- A channel with a worker in it cannot be made staff-only.
- Realtime visibility treats a channel like a team chat.

No existing row is rewritten. Message tables keep their column-limited grants.

## Design calls (Astra is out; made by Claude)

- Channels get their own block at the top of Messages, by name with `#general` first; other conversations stay newest first below.
- A lock marks a staff-only channel and a hash marks one that includes workers, so the audience shows before anyone posts.
- Leave and Archive ask first.

## Checked

Chromium against the local stack, as an owner, a Finance member and a worker:

| Check | Result |
| :--- | :--- |
| Owner opens Messages | `#general` exists and is listed |
| Owner creates `#denver-sales-…` and posts | Created; message shown |
| Same name again | Refused: "There is already a channel named …" |
| Finance (no Messages area) | Sees Messages and `#general`; no New channel or New team chat button; `/messages/channels/new` sends them back |
| Finance joins | Sees the earlier message, posts, sees Leave only |
| Finance leaves, reopens | Read-only, told how to join again |
| Worker | `/messages/channels` sends them to Messages; opening the staff channel is "Conversation not found" |
| Owner archives | Read-only; gone from the list to join |
| Console and server errors | None |

Database guards, run by hand in a rolled-back transaction: all six refusals fire, and leaving the organization took one member's live channel rows from 4 to 0.

Not checked: live refresh between two browsers (the local stack has no Realtime), and a channel that includes workers end to end in the browser (its rules are unit-tested and it shares the team-chat path).

## Review (rule 9)

A separate Claude reviewer ran the SQL on a throwaway database. It found the app-level isolation sound (between organizations, and between workers and staff-only channels) and these defects, all fixed in the second commit:

| Finding | Fix |
| :--- | :--- |
| The migration failed when run in one transaction or sent as one statement | The index no longer names the new enum value; proven both ways |
| Leaving the organization did not reliably end channel membership (re-running an older migration undid it; closing an account never triggered it) | Its own function and trigger, watching organization, role and closure |
| A former staff member could still read a staff channel's history | They read nothing once off that organization's staff; history is kept only for someone who left a channel while still on staff |
| "Everyone on staff is in #general" was only true for people who had opened Messages | Everyone on staff is added when it is made; someone who comes back is put in again |
| A hand-made `#general` could block the real one | The name is reserved |
| A server error in Leave or Archive went to the error screen | Only the redirect is let through |
| A channel with workers could be flipped to staff-only in the database | A trigger refuses it |
| Joining counted the whole history as unread | Joining starts read |

**Re-check.** The fixes were checked again by a separate reviewer, who ran the acceptance script and the SQL by hand. Three more defects, fixed in the third commit:

| Finding | Fix |
| :--- | :--- |
| A channel someone had already named "general" made Messages fail | A staff-only one becomes the general channel; any other case is logged and Messages still opens |
| A former staff member kept an unread badge they could never clear | Unread counts skip channels of an organization the person has left |
| New `#general` members were time-stamped by the session's time zone, not UTC | The time is taken in SQL |

**Known limit.** Someone who joins the organization later is put in `#general` the first time they open Messages, with what came before marked read. They get no badge for it before that first visit.

**Acceptance test.** `tests/acceptance/p2-channels.ts` (run in CI with the others): 57 checks against a fresh database, with M10's roles file run again after this migration. It covers the general channel under concurrent opens, creating, browsing, joining across organizations, workers, the seven database guards, leaving, archiving, leaving the organization by each path, unread counts for former staff, a session in another time zone, an older channel named "general", and a hire ending.

## Screens

`1-owner-messages.png`, `2-owner-channels.png`, `3-new-channel.png`, `4-channel-thread.png`, `6-finance-menu.png`, `7-desktop-messages.png`.

# Slice 2: threads and reactions (Nov 11 2026)

Built on slice 1. They work in every conversation: channels, team chats and direct threads.

| Rule | Detail |
| :--- | :--- |
| Replying | Anyone who may post can reply under a message they can see. Replies open on their own page and stay out of the main conversation, which shows the count. |
| Depth | One level: a reply is not replied to. |
| Deleted messages | Keep their thread; lose their reactions. |
| Reactions | Six fixed marks (thumbs up, heart, laughing, celebration, looking, done). Tapping yours again takes it back. |
| Blocks | A worker who has blocked someone sees neither that person's new replies (in the thread or the count) nor their reactions. |
| Read-only | Someone who can no longer post neither replies nor reacts. |

## Data model (approved with channels)

`prisma/p2-threads.sql`, folded into `prisma/supabase-manual-setup.sql`:

- `Message.parentId`, set when a reply is sent. Messages stay immutable. A trigger refuses a reply in another conversation and a reply to a reply.
- `MessageReaction`: taking a mark back sets `removedAt`; the row stays. The database checks the same six marks as the code (a unit test compares the two lists) and allows one live mark per person per message. Server-only: nothing is granted to the API roles.

## Design calls (made by Claude)

- A fixed set of marks, not a full emoji picker: quick to tap on a phone, and nothing to moderate.
- Marks and the way into the thread share one row under the message.
- Each mark in the open picker is a 44px target.

## Checked

- Acceptance script: 77 checks (20 new) on a fresh database, including the database guards, cross-conversation and cross-organization refusals, and blocks.
- Chromium at 390px, owner and Finance: react, see the shared count, take it back, reply, see "2 replies"; a worker opening the staff thread gets "Conversation not found". No console or server errors.
- Not checked: live refresh of reactions between two browsers. A reaction shows for others on their next refresh or message, because reactions are not on the Realtime feed.

## Review of slice 2 (rule 9)

A separate Claude reviewer ran the acceptance script and its own scenarios on a throwaway database. It found no leak of message text, sound SQL and locking, and these defects, all fixed in the second commit:

| Finding | Fix |
| :--- | :--- |
| A reply under a message the viewer cannot see (sent before they took over a direct thread, or by someone they had blocked) showed nowhere, with a badge that never cleared | Such a reply reads as an ordinary message in the main conversation |
| Opening or replying in a thread could mark an unseen message in the main conversation as read | A thread moves the read mark only when that skips nothing; replying from a thread marks nothing read |
| New replies were counted but not announced before being marked read | The thread link says how many are new |
| A removed member saw a mark disappear when it was taken back after their removal | Marks are shown as they stood at removal |
| A mark made during a block showed after unblocking | It stays hidden, as that person's messages do |
| The reaction action trusted page paths sent by the browser | The pages to refresh come from the message itself |
| The reaction picker dropped keyboard focus and ignored Escape | Focus returns to "+"; Escape closes |

**Known limit.** A conversation has one read mark, not one per thread. The badge can therefore stay until the main conversation is opened. A read mark per thread would be a data-model change; say if you want it.

**Re-check.** A second pass found one case still open: a reply under a message older than the 200 on the page showed nowhere. Fixed in the third commit (the main conversation now judges "can I reach this thread?" against the page itself), with a test that builds a 206-message channel. It also asked for a check that pins the removed-member rule; added.

Acceptance: 93 checks.

Screens: `8-thread.png`, `9-replies-and-reactions.png`.

# Slice 3: staff direct messages and @mentions (Nov 11 2026)

## Staff direct messages

| Rule | Detail |
| :--- | :--- |
| Who | Any two staff members of one organization, whatever their roles. Reached from Messages → Channels and people. |
| One per pair | Whoever opens it, the two get the same conversation. |
| Private | Only the two people read it. Owners and managers cannot open it, add anyone, or join. |
| Workers | Never. A worker is still messaged through their hire, as before. |
| Leaving | When one person leaves the organization, they read nothing of it and the other keeps read-only history. Coming back reopens the same conversation. |
| Between staff | No "Manager" tag and no field quick replies, here or in staff-only channels. |

## Mentions

| Rule | Detail |
| :--- | :--- |
| Typing | "@" offers the other people in the conversation; picking one writes their name. |
| Who is named | People in the conversation at that moment whose name follows an "@". The longer name wins ("@Sam Ortiz" is not also Sam). An email address names nobody. |
| What the person sees | "@ mentions you" on the conversation in their list until read, and a tag and ring on the message. |
| Blocks | Someone who has blocked the sender is not named: they never see the message. |
| Fixed | A mention is written with the message and never changed. Editing a message does not add or remove one. |

Not in this slice: a notification or email for a mention. It shows inside Messages only. Notifications have their own subject rules in the database, so that is a separate change.

## Data model (approved with channels)

`prisma/p2-dm-mentions.sql`, folded into `prisma/supabase-manual-setup.sql`:

- `ConversationKind` gains `STAFF_DM`; `Conversation.dmKey` (unique) holds the pair.
- `MessageMention`, append-only, server-only.
- The participant guard and the kind check are stated word for word the same in this file and in `p2-channels.sql` (a unit test compares them). Running either file again can therefore never undo the other. The acceptance run proves it by re-running the channels file last.

## Final review notes on slices 1 and 2

A last pass on the two commits that had not been re-checked found no blocking defect. Its four low-severity notes are fixed in this slice's commit: keyboard focus after picking a reaction; a bound on the replies loaded beside a long page; no failing write when a non-staff-only channel holds the name "general"; and a lock so adopting and archiving an old "general" cannot cross. The Messages list also no longer loads a channel's whole staff to list it.

## Review of slice 3 (rule 9)

A separate Claude reviewer ran the acceptance script and a probe script on a throwaway database. Inside the app, nobody outside a staff conversation could read it on any path it tried, and the migration was sound. It found these defects, all fixed in the third commit:

| Finding | Fix |
| :--- | :--- |
| Someone who came back to the organization could not reopen a staff conversation from the screen (it showed "Open" on a closed conversation) | An ended conversation is offered as "Message" again, which reopens it |
| Someone who left could still read rows of a staff conversation or channel through the live-update feed's database policy | The policy now requires a staff row's person to be on that organization's staff, as the app does |
| Two people who both moved to another organization could never message each other again | The pair key is unique per organization |
| A mention in a thread reply was cleared without being shown | The thread's link says "Mentions you" |
| A name stored with stray spaces was offered but never matched | One normaliser for names, used by both |
| A role standing in for a missing name ("Owner") worked as a mention | Only people with a name of their own are offered or matched |
| Smaller: unread mentions for a contact who took over a direct thread; names offered to a viewer who cannot post; the phone keyboard closing when a name is picked; a rare race surfacing as an error | Each fixed |

One thing to know: if one person in a staff conversation **reports** the other's message, the organization's owner sees that message's text in Reports, as for any reported message. That is the reporter's choice and the only way a third person sees any of it.

Not done: arrow-key selection in the name list. A keyboard user reaches the names with Shift+Tab.

## Checked

- 1,115 unit tests pass (17 new: staff conversations, mention matching, the two SQL comparisons).
- Acceptance: 126 checks (33 new) on a fresh database, including queries made as the signed-in browser role.
- Chromium at 390px as a Finance member and an owner: open a conversation from People, "@" offers the colleague, the owner's list shows "@ mentions you" and the message is ringed; a worker opening the conversation gets "Conversation not found". No console or server errors.

Screens: `10-people.png`, `11-mention-offer.png`, `12-list-mention.png`, `13-mentioned.png`.
