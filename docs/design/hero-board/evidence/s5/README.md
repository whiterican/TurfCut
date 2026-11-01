# Slice 5 evidence — the remaining worker routes

Same contract and capture method as `../s1/README.md`: real routes, synthetic
fixtures, Inter loaded, frozen clock (2026-10-30 19:00 UTC), device scale
factor 2, `<screen>-<state>-<css width>-<theme>.png`; `manifest.json` records
the font check, overflow and dock measurements. The harness was rebuilt for
this slice after the container was reclaimed (a fresh fixtures database from
the repo's own SQL, seed and demo seed, plus one owner profile and two
notifications), so fixture names differ from slices 1 to 4. Two `before-*`
captures show the eggplant hero cards these screens had.

## What is in this slice

| Screen | Done | Evidence |
|---|---|---|
| Earnings | The eggplant hero becomes white tiles, one per real pay state: paid, on the way (or "approved, payout setup needed", with the set-up link beside the amount), awaiting approval, on hold or disputed when any. Payouts card, per-campaign rows and the dispute action unchanged. | `earnings-populated-*`, `before-earnings-390-light.png` |
| Notifications | Rows as Messages draws them: dividers, bold while unread with a Forest dot, the time under, a chevron. "Mark these as read" stays in the head. | `notifications-populated-*` |
| Display settings | Named as the More sheet names it; the controls unchanged. In the harness no Supabase session exists, so the Account section is absent here; in the app it shows. | `settings-populated-*` |
| Shift (field day) | The eggplant hero becomes a white work surface: date and place, the figure that matters (signatures, or doors and contacts), the ring with time worked and the estimate, then the schedule and packets. A live shift carries the "On shift" pill; the priority rings around the card are gone (the status pill and the words carry it, as on Today). | `shift-completed-*`, `before-shift-390-light.png` |
| Tiles on a phone | The tile grid is two-up below 640px everywhere it is used (Overview, Field map, Hiring, Earnings). | `desk-populated-390-light.png`, `earnings-populated-390-*` |

## Remaining differences from the concept

The concept has no Earnings, Notifications or Settings screens; these follow
its grammar (white surfaces, Inter scale, one Forest action) rather than a
drawing. The Active Shift screen (5) draws stops and a current address; the
shift page draws none (the stop feature is #110).
