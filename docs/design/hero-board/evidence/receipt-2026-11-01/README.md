# Worker receipt slice (#116, 2026-11-01)

Every capture is from commit `70d6b1a`, with a clean tree (`manifest.json`). Captures are at 390, light and dark, DPR 2, full page, with the clock frozen at 2026-10-30T19:00:00Z, in America/Denver. None has horizontal overflow.

## Fixture

The fixture is synthetic and lives only in the local preview database. It has four transfers to Alex Rivera from Front Range Circulators, one per receipt state:

| Receipt | State | Events |
| --- | --- | --- |
| R-000011 | sending | `TRANSFER_STARTED` only |
| R-000012 | sent | started, then `PAID` |
| R-000013 | not sent | started, then `TRANSFER_FAILED` |
| R-000014 | reversed | started, `PAID`, then `REVERSED` |

`receipts-populated-*` is the worker's receipt list with all four.

## Compared with the approved mockup

`receipt-mockup-vs-built-390.png` puts the mockup next to the built sent-state receipt at the same width.

**Applied from the review:**
- The receipt number stays the heading.
- The line under it and the amount's label follow the transfer state:
  - sending: "… is sending you this payment" / "Amount being sent"
  - sent: "… paid you" / "Amount sent"
  - not sent: "… didn't go through" / "Amount not sent"
  - reversed: "… came back" / "Amount reversed"
- The amount leads the facts, one type step up.
- The line items and total share one bordered surface.
- The destination reads "Your Stripe account (…7Q2X)", which is what `destination` really is.
- It uses the real worker dock.

**Deliberate differences from the mockup:**
- **No "Dispute this pay" link.** A dispute is opened per shift from Earnings; the receipt page has no such entry point, so none was invented.
- **"Print or save as PDF".** The existing PrintButton keeps its label.
- **No card around the facts.** They are plain document rows; only the lines and total sit on a surface, as the review asked.

**Print:** checked with emulated print media. The heading and payer line print; the Receipts link and the Print button don't.

**Known gap, existing behaviour, follow-up:** a partial reversal leaves the receipt "sent" with the full amount and no sign of the partial return.
