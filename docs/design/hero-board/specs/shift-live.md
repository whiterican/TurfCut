# shift-live — one-screen Claude implementation guide
**Route:** `/shifts/[shiftId]` · **Deliverables:** `shift-live-390-light.png`, `shift-live-390-dark.png`, `shift-live-1440-light.png`, `shift-live-1440-dark.png`. PNGs live in the companion ZIP, NOT yet in GitHub.

## Regions / exact fixture labels
Active shift | Work recorded | Today's stops (planned).

## Binding to real app
FieldDayLive, Shift, WorkEvent, offline queue.

## Forbidden item / replacement
No per-stop claim from aggregate DOOR_KNOCK; no instant verification or pay. If a replacement is unsupported by real data, DROP rather than invent.

## Interaction and state rules
Preserve check-in/break/check-out, packet custody and honest sync status.

## Layout and platform fidelity
- 390×844 CSS px, 2x PNG light/dark; 1440×900 CSS px, 2x PNG light/dark. Screenshots are illustrative fixtures, not live data.
- Phone nav: workers **Today / Feed / Work / Shifts / Messages / Profile**; owner **Desk / Hiring / Field / Messages / More**; other org roles dynamically authorized.
- Compact dock: max 348 CSS px; min 48px hit height (never under 44px); safe area, reduced motion, focus, keyboard and readable labels.
- Desktop: independent operational layouts with actual data density and a real organization left rail.
- Brand: deep eggplant identity; warm paper; forest green *one real primary action/live state*, dark and Sunlight modes.
- Type A/B: Barlow is current; evaluate Public Sans operational body + limited Newsreader public hero. Source fixture screenshots use Cabin surrogate, NOT an actual Public Sans comparison.
- Real copy/actions must use existing DB loaders and exact permissions. No speculative metrics, worker tracking, fake bonuses or fake labor/pay/verification states.

## Review contract
Read-only alignment first. F00–F11 redesign remains priority. RS1 core-loop work is separately gated. No production code, schema or migration changes without founder approval after C1/C2/C3.
