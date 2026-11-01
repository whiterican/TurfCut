# Slice 2 evidence — Home, Today, Schedule, Messages, Profile, More

Same branch, contract and capture method as `../s1/README.md`: real routes,
synthetic fixtures, Inter loaded, frozen clock, device scale factor 2,
`<screen>-<state>-<css width>-<theme>.png`; `side-by-side/` beside the concept
crops (low-resolution references, not pixel targets).

## What is in this slice

| Screen | Done | Evidence |
|---|---|---|
| Home (1) | The photograph carries the first phone screen; H1, supporting line, Forest **Find jobs**, "Available jobs" with one real open job (omitted when there is none) | `landing-signed-out-*` |
| Today / Active shift (5) | White work surfaces with one Forest action: a live shift (title, On shift pill, job, times, place, elapsed since the real check-in, **Open field day**), the next shift (**View shift details**), a shift without a check-out (**Open shift**), nothing scheduled (**Find Jobs**); a live shift plus a separate overdue alert keeps both; `pickHero` untouched | `today-next-*` (the fixture worker's real state: a shift without a check-out, then tomorrow's shift) |
| My schedule (4) | **Upcoming / Past** as real URLs (`?view=past`), day groups, white cards with a 3px accent in the status colour, the real status pill, **View details** and **Get directions** (only with a staging point), open seats, **Required actions** only from real records (a credential expiring or expired, a sharing choice to confirm), the specified empty states | `schedule-upcoming-*`, `schedule-past-past-*`, `schedule-upcoming-320-light.png` |
| Messages (8) | Concise head; compose only for staff who may start a team chat; rows with a 40px initials avatar, bold title while unread, campaign line, one line of the last message, time, chevron; dividers, no outer card | `messages-populated-*` |
| Profile (9) | 72px initials avatar, name, the saved home area when set; menu rows with real status words (Credentials, Availability, Payout setup, Work record, Experience, Sharing & privacy, Display settings); every existing section stays below, anchored | `profile-populated-*`, `profile-populated-320-light.png` |
| More (12) | Profile, Campaign feed, Earnings, Payment history, Credentials, Availability, Display settings, Sign out (the existing action with its unsynced-work safeguard) | `more-open-390-*` |

## Remaining differences from the concept

**Home.** The site header still sits above the hero (the concept overlays the
wordmark and a locality on the photo). No locality: the app has none saved for
a visitor.

**Today.** The concept's current/next stop cards, stops left, completed and
addresses are the stop feature (#110) and are not drawn. "Elapsed" is since the
check-in and says so; it is not verified pay time. The title stays "Today" with
the date; "Active shift" / "Next shift" is the card's own heading.

**Schedule.** "Scheduled" keeps its real word (the concept says Confirmed), and
"No check-out received" keeps its warning pill. "Message" is absent from the
card: a conversation needs a real authorized thread, which the schedule row
does not carry. Required actions never include training or agreements (no
record exists).

**Messages.** No photos of people: initials only. The compose icon appears for
staff who may start team chats, never for workers.

**Profile.** No identity verification, background check, worker agreement,
training count or card digits (no record exists). "Payout setup" says exactly
what Stripe Connect reports. The name is the saved display name, no photo.

**More.** Documents, Training, Help & Support, Terms and Privacy have no
route and are listed as product gaps, not drawn.

## Checks

`npm run typecheck`, `npm run lint`, `npm test` pass on the slice's head;
independent review and re-check recorded in the PR.
