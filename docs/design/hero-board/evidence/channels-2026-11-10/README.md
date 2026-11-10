# Channels, slice 1 (Nov 10 2026)

Caden: "slack like communications need to be built immediately". His answers on scope: channels are for staff plus hired workers, and the data-model change is approved.

This is the first slice of the private-sector milestone. It adds channels on top of the existing message tables. Threads, mentions, reactions and staff-to-staff direct messages are later slices.

## What a channel is

| Rule | Detail |
| :--- | :--- |
| General channel | Every organization has one, `#general`. It is made the first time anyone on staff opens Messages, and each staff member is put in it the first time they do. Nobody leaves it and it is never archived. |
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
- Leaving the organization ends channel membership (the existing staff trigger, extended).
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

## Screens

`1-owner-messages.png`, `2-owner-channels.png`, `3-new-channel.png`, `4-channel-thread.png`, `6-finance-menu.png`, `7-desktop-messages.png`.
