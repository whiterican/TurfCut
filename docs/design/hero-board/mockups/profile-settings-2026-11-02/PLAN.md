# Profile and settings: plan and mockups for review (2026-11-02)

This is the last family from #114's route contracts: worker profile editing, Who sees what, and Settings. These are mockups for review before building, not implementation. Each PNG is rendered from the HTML in `src/` on the design tokens' values (the same `base.css` as `../families-2026-11-01`). Every frame is labelled "MOCKUP · synthetic data".

The current pages are in `current/`. They were captured from a local test database during the functional pass, on the #120 tree, which doesn't touch these pages. One number in `current/profile-*-now.png` is an artifact of that test: "6,704.22 doors per active hour" comes from a 21-second test shift. See the questions at the end.

Every field in the mockups is one a loader already returns. Nothing needs a schema change, a new dependency or new wording on a consent screen.

## What's wrong today

| Page | Problem | Contract (#114) |
| --- | --- | --- |
| `/profile` | 7,094px tall on a phone. The menu rows at the top already link to Availability, Credentials and Who sees what with their status, and full sections repeat them lower down. An empty "Add a campaign" form opens by default (about 1,200px). | Reading/form; "each remain focused". |
| `/settings` | Titled "Display settings" while it also holds Account, Your data and Close my account. Every radio option is its own bordered card. Close my account isn't set apart. | "Group related fields with one section heading, not a card per input." "Danger zone separated at the end." |
| `/profile/sharing` | 2,829px on a phone: 6 parts × 3 bordered option cards each. | The same card-per-input rule. |

Availability, credentials, political-fit preferences, preview and setup already follow the reading/form layout. Only the shared radio styling changes there (see 3).

## 1. Profile — `profile-390.png`, `profile-1440.png`

- **Phone:** the head (initials, name, the home area only when the worker saved one), then the menu rows.
  - Two rows are new: **Political fit**, whose status words come from the latest preference's visibility mode ("Private" etc., or "Not answered"), and **What organizations see**.
  - The "Work record" and "Experience" rows go: those sections follow straight after, so the rows only scrolled down.
- **Desktop:** the left sub-nav stays as it is. The menu's status words become one compact band under the name, in the same words as the phone rows.
- **Work record:** unchanged content.
  - Tiles, verified strengths, then "The math behind every number" folded under a disclosure, closed by default (question 1).
  - The note "no overall score is computed" stays visible above the fold.
- **Experience:** the list, then a "+ Add a campaign" button that opens the existing `ExperienceForm`.
  - Closed by default, even when the list is empty. The empty state says what experience is for.
- **Removed from this page:** the duplicate Availability, Credentials, Who sees what and Political fit sections. Each has its own page, linked with its status.
- **Contact:** one row (mobile number, "Never shown to organizations"), with Add / Change opening the existing `PhoneForm`. Whether it moves to Settings › Account instead is question 2.

## 2. Settings — `settings-390.png`

- The title is **Settings** when signed in. It stays **Display settings** when signed out, because then the display options are all it holds.
- **Display:** text size, theme, motion and feel as plain radio lists, one card per group, under "Saved on this device".
- **Account:** sign out, plus the mobile number if question 2 says yes.
- **Your data:** the existing download.
- **Close my account:** last, below a divider, with a danger heading. The existing explanation, blockers and disabled state are unchanged. Organization accounts still don't get it.

## 3. Who sees what — `sharing-390.png`

- **Layout only.** Every label, explanation and option keeps its exact words. The sharing record's version and the reconfirmation behaviour depend on that wording, so nothing here changes it.
- Each part becomes one card, with its options as plain radio rows separated by hairlines instead of three bordered cards. That cuts about a third of the height.
- "Let organizations find me" keeps its full explanation (shortened in the mockup only).
- The same radio-row style applies wherever the app uses option cards for a single choice in these routes: Settings and Political fit. The job builder and signup's two-way account-type switch keep their cards, because there the card is the choice's picture.

## States to capture when built

- **Profile:** first visit (defaults, the "Choose who sees what" reminder), sharing that needs reconfirming, no experience, self-reported and verified experience, expired credential (the row's status in danger), no home area, payouts not available.
- **Settings:** signed out, worker, organization member, close blocked, close allowed (confirmation step), failed sign-out.
- **Sharing:** defaults never saved, saved, needs confirming, findable on without a placeable home area, failed save.

Each at 390 and 1440, in light and dark.

## Questions for review

1. **"The math behind every number":** fold it under a disclosure (closed), or keep it open as today? Folding saves most of the work-record height on a phone. Every rate stays one tap away with its formula and inputs.
2. **Mobile number:** keep it on Profile as one row, or move it to Settings › Account? It's account data, never shown to organizations.
3. **Tiny shifts:** a 21-second test shift showed "6,704.22 doors per active hour" on the profile. A real accidental check-in and check-out would show organizations the same kind of absurd rate.
   - Should a rate need a minimum amount of active time before it's shown, "not enough data" otherwise?
   - That changes how a metric is defined, so it needs your decision first. It isn't part of this layout work.
4. **Order:** I plan Profile, then Settings, then Who sees what, one reviewed slice each, with evidence.
