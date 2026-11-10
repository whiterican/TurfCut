# Less wording, and a Guide (Nov 10, 2026): first batch

Caden asked for less wording across the app, with the detail moved to training documents reached from Home. Job descriptions keep their detail. This is the first batch, for Caden to look at before the rest: the worker's Home, Jobs and Earnings, and the Guide.

## What changed

- **A Guide** at `/guide`, linked from Home and listed in the menu and sidebar. Four sections: Finding jobs, Shifts, Getting paid, Who sees what. Every statement describes existing behaviour; nothing in it is a new promise.
- **Home, Jobs and Earnings** keep the heading, the figures, the action and one short line. Where money or privacy is at stake the line stays, shorter. Earnings links to the Guide's pay section.

Words on screen at 390 wide, for the test worker (counted from the page's text):

| Page | Before | After |
| :--- | ---: | ---: |
| Home | 108 | 113 (with the new Guide card, 9 words) |
| Jobs | 91 | 82 |
| Earnings | 162 | 123 |

Home was already short; most of its text is the worker's own job, figures and buttons.

## Review

A separate Claude reviewer checked each Guide sentence against the code and each shortened line against the one it replaced. Nothing blocking, but the first cut had shortened four lines about money too far, and they are corrected:
- "Approved gross pay" misdescribed a page that also lists pay awaiting approval (now "Gross pay for shifts your supervisors approved. Turfcut takes no cut.");
- "Stripe pays your bank directly" was shown to someone not yet set up and dropped that Stripe asks for bank and tax details (now "Set up payouts to be paid. Stripe collects your bank and tax details; Turfcut never sees them.");
- "never changes after approval" was wrong until pay is approved for payment (now says so, on Earnings and in the Guide);
- "Pay counts verified time only" is true of hourly jobs only (the Guide says so, and names completed shifts and accepted work).
Smaller wording was restored where the short version was ambiguous. The counts above are after these corrections, which is why Home did not shrink: its text was already short, and it gained the Guide card.

The Guide's text now lives in `src/lib/guide.ts` with a test that pins its pay and privacy sentences, its links, and the short lines the screens keep.

## Kept on purpose

- "Turfcut takes no cut" on Earnings, and "Turfcut never sees your bank or tax details" on the payout card.
- "Private and never used for ranking" under the Jobs list.
- "Your answers stay private" on the political-fit note, and what happens until the worker reconfirms.
- "Pay counts verified time only" where a shift ran past its end.

## Evidence

`home.png`, `jobs.png`, `earnings.png`: before and after, 390 wide. `guide.png`: the Guide.

## Next, once Caden approves this batch

The rest of the worker pages (shift page, profile, settings, sharing), then the organization pages with an organization Guide.

## Second batch: Settings, Profile, Credentials, Availability

Hints shortened where the extra words said nothing a person needs before acting: the Sunlight and motion notes, the data download, closing an account (every consequence is still stated), availability's time note, and the self-reported notes on credentials and experience.

Not touched, on purpose:
- **The scorecard's evidence lines** on Profile. Every figure there states what it was counted from; that is the rule that rankings explain themselves.
- **Who sees what** (420 words) and **Political fit** (227 words). Their sentences are what a worker agrees to. The app keeps a history of those choices and asks workers to reconfirm when the wording changes, so shortening them is a consent decision for Caden, not an edit.
- **A job's own page.** Caden asked that job descriptions keep their detail.

## Organization side (batch 3)

The organization screens were measured first (owner, 390px, local fixture). They were already short: 76 to 205 words a page, against 300 or more on the worker pages before this pass. So this batch is small on purpose.

| Change | Detail |
| :--- | :--- |
| Organization Guide | `/guide` now shows the organization's guide to every organization role: Publishing jobs, Field, Pay, Checking credentials, Your team. |
| Source of each point | Every sentence restates what its own screen already says. Nothing new is claimed. |
| Credentials | The long note under the list is now two sentences with a link to the guide (118 → 83 words on the page). The number, registry, "not proof" and "the worker sees each time you open it" facts stay on the page. |
| Reaching the guide | Settings has a Help section with a link, for every role. |

Left alone on purpose: the Pay lead (who approves, the 15% fee), the Members invitation rules, and the jurisdiction warnings on organization Settings. They are short and each states a money, access or compliance fact at the point of use.

Review fixes from batch 2: the account-closure warning reads "Shifts you haven't started are cancelled and open applications withdrawn; that never counts as a no-show." (the code does withdraw them), and the worker Guide says what Download my data contains.

Screens: `org-guide-390.png`, `org-credentials-390.png`.
