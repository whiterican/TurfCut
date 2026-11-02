# Organization statement slice (#116, 2026-11-01)

Every capture is from commit `dada188` with a clean tree (`manifest.json`). It covers October 2026, an open month, at 390 and 1440 in light and dark. Captures are full page at DPR 2, with the clock frozen at 2026-10-30T19:00:00Z. None has horizontal overflow.

**Fixture:** synthetic, local preview database only. October holds five lines for Alex Rivera in their real current states:
- the approved line;
- the four receipt-fixture lines (sending, paid, not sent, and paid then reversed);
- the disputes on the Oct 30 shift, which show some of those lines as Disputed.

## Against the review (#116)
- **Lines:** a ledger table of worker, date (shift link), job, basis (formula, any statement corrected, the paying receipt), pay, fee and **Current state**.
  - The state is each line's state today, labelled so.
  - The amounts and the Recorded total are the month's own.
  - Amounts are right-aligned under a Recorded subtotal, and the Worker column fits an ordinary name.
- **Withdrawn while the month was open:** such a line keeps its row with its amount in brackets, read as "not counted", so the column adds up to the Recorded total.
- **Withdrawn after the month closed:** a later withdrawal of a line still keeps "Withdrawn after this statement closed".
- **Corrections:** an earlier month's line withdrawn this month appears in Corrections with a plain amount, because there it is a credit that is counted.
- **Kept distinct:** frozen totals, payments sent and corrections to earlier statements. The totals card keeps its notes on cost, reversals and corrections, instead of the mockup's single band.
- **On a phone:** each line stacks into named rows.
- **Print:** the heading prints, and tables print whole (no scroll box, no split rows). Checked with emulated print media.

`statement-mockup-vs-built-1440.png` stacks the approved mockup above the built page.
