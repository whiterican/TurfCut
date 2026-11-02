# Receipt after a partial Stripe reversal (#116, 2026-11-02)

The approval comment on #116 asked for this to be tracked before full sign-off. The receipt used to read "sent" with the whole transfer total even after Stripe took part of it back.

Every capture is from commit `0943f02` with a clean tree (`manifest.json`). Captures are at DPR 2 and full page, with the browser clock frozen at 2026-10-30T19:00:00Z in America/Denver. None has horizontal overflow. `receipt-partly-print.png` is the same receipt at 800px with print media emulated.

## Why it happened

A partial reversal isn't a line-by-line ledger event. The webhook keeps Stripe's report as a `payout.partially_reversed` audit record (Stripe's running total reversed, and the amount Stripe sent). It then lists the item for owners and finance on Pay, where they record it as a settled deduction, optionally paying it again. The worker's receipt never read that record.

## Fixture

The fixture is synthetic and exists only in the local preview database. Receipt R-000015 is $87.50 to Alex Rivera from Front Range Circulators: started, then paid, then a partial-reversal report of $25.00.

## What the receipt shows now

- **Badge:** "Sent · partly reversed". It keeps the paid look, because the money arrived. A later full reversal still reads "Reversed".
- **Amount sent** stays the headline ($87.50). Below it: **Came back** $25.00 with the time Stripe reported it, and **You kept** $62.50.
- **Stripe sent:** an extra row appears only in the rare case where Stripe's transfer amount differs from Turfcut's record. "Came back" and "You kept" are then out of Stripe's figure, so the rows still add up. Not shown here: the fixture has no such mismatch.
- **Note:** the same amount shows on Earnings as a deducted adjustment once the organization records it. It is not a second deduction. Any re-payment arrives on a later receipt.
- **Lines:** what the whole payment was for, totalled as "Total sent (before the reversal)".
- **Receipt list:** shows the same badge.
- **Print:** carries the heading, every fact row and the note. The Print button and the Receipts link don't print.

## Checks

- **Unit tests** (`src/lib/receipts-data.test.ts`):
  - The largest report wins, even when reports arrive out of order.
  - Zero, the whole amount, more than the whole amount, and junk values are ignored.
  - Partial is judged against Stripe's amount when it differs from Turfcut's, with Turfcut's amount as the fallback.
- **Acceptance m9:** two partial reports, then the full reversal, checked on the receipt and in the list.
- **Acceptance m5:** the receipt reads the same after finance records the reversal with a re-payment line (approved, not yet sent), and neither new line is listed on it.

## Known gap, not changed here

The worker's data export (`transfers.csv`) lists each transfer's amount but not its state. A full or partial reversal doesn't show there. This predates the slice.
