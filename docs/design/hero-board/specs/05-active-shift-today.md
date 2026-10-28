# 05 — Active Shift and Today states

**Routes/source:** `/dashboard`, `/shifts/[shiftId]`; `pickHero`, `laterShifts`, field-day state/events, `FieldPage`/`RecordPage`, existing offline sync and packet controls.

**Visual target:** compact **Active Shift** title/status → job/time/location → three small facts → dominant current work card/action → secondary next item. White work surface and Forest action, not a giant decorative ring/card. With a future approved stop model, current/next stop occupy these slots exactly as pictured. Today is the Home destination; individual shift work is Work.

**Current implementation boundary:** no stop inventory exists. Use actual shift context, staging/turf and the relevant work controls. Do not show “Stop 5,” an address, stops left or a completion percentage. Existing doors/contacts/signatures/packet counts must retain their precise labels; elapsed time comes from a real check-in and must not imply verified paid time. Proposed interim primary label: **Open field day** from Today; **View turf** when opening the real assigned map. Record the interim region as a feature exception.

**Truthful Today states:** live → current shift/action; next → **Next shift** + real date and **View shift details**; overdue → **No check-out received** + **Open shift**; empty → **Nothing scheduled** + **Find Jobs**. A live shift plus a different overdue shift shows the live card and separate overdue alert. An ended shift does not remain “On Task” merely because no check-out arrived. Do not change `pickHero` precedence for visual symmetry.

**Persistent work states:** packet custody, due/check-out blockers, queued offline events, memory-only queue risk, failed/retry, server acknowledgement and elapsed/context labels remain visible. Do not move them behind a cosmetic tab. Existing work actions must stay reachable and at least 44px; map/notes keyboard cannot cover them.

**Evidence:** live/next/overdue/empty/live-plus-overdue at both widths/modes; offline queued then acknowledged, rejected event, check-out blocked/complete, long staging text. Counts and amounts are deterministic fixtures with their original meanings.
