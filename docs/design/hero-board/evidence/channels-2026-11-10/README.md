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
