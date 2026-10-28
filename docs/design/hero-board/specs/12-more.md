# 12 — More / account navigation

**Current source:** organization More already exists in `AppNav`; worker navigation currently has no More. `/settings` is an actual display/account screen, not a generic menu. Recommended minimum-change worker implementation is an accessible sheet reusing the existing menu behavior; a dedicated page requires an explicit route choice.

**Order:** **More** heading → compact white icon/divider rows → account actions → existing dock when a page, or a properly managed modal sheet. Visual target is a simple menu, not a grid of colored tiles. Proposed 14px gutters/padding, 20px icons, 10px gap, 44px minimum rows, small chevrons for real navigation only.

**Real worker entries:** **Profile** `/profile`; **Campaign feed** `/feed`; **Earnings** `/earnings`; **Payment history** `/earnings/receipts`; **Credentials** `/profile/credentials`; **Availability** `/profile/availability`; **Display settings** `/settings`. Avoid duplicate entries where a clear grouping suffices, but never lose an existing destination. Profile links retain privacy/preferences/setup access. Existing staff console remains available only to actual staff.

**Unsupported rows:** do not invent a document vault, training center, help/legal routes or copied policy content. Omit nonexistent routes and list them as product gaps. **Log Out** must reuse `SignOutButton`/the existing action and offline-work protections, not navigate to a guessed logout URL.

**Interaction:** trigger is a button with expanded state; sheet has an accessible name, initial focus, Escape/backdrop behavior as appropriate, focus return and background scroll handling. For a page, use ordinary navigation semantics. More remains selected for its child routes without stealing organization routes. Do not obscure a live shift's critical action with a permanently open menu.

**Acceptance:** opening/closing, keyboard-only, enlarged text/scroll, deep-linked child page, route Back, signed-out/incomplete setup, worker/staff/organization visibility and sign-out failure. Org More continues to derive from `orgNav` grants and is not replaced with the worker list.
