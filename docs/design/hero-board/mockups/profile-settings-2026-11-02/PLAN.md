# Profile and settings: plan and mockups for review (2026-11-02)

This is the last family from #114's route contracts: worker profile editing, Who sees what, and Settings. The PNGs are rendered from the HTML in `src/` on the design tokens' values (the same `base.css` as `../families-2026-11-01`). Every frame is labelled "MOCKUP · synthetic data".

This family changes **page structure**, not the sections inside it. Components that stay exactly as they are (ScorecardPanel, ExperienceList, ExperienceForm, PhoneForm, the account download, the closure text) are drawn as dashed "unchanged" placeholders, so the mockups never stand in for their real content or wording. Every status word shown is one the code already produces.

The current pages are in `current/`. They were captured from a local test database during the functional pass, on the #120 tree, which doesn't touch these pages. One number in `current/profile-*-now.png` is an artifact of that test: "6,704.22 doors per active hour" comes from a 21-second test shift (question 3).

Nothing here needs a schema change, a new dependency or new wording on a consent screen.

## What's wrong today

| Page | Problem | Contract (#114) |
| --- | --- | --- |
| `/profile` | 7,094px tall on a phone. The menu rows at the top already link to Availability, Credentials and Who sees what with their status, and full sections repeat them lower down. An empty "Add a campaign" form opens by default (about 1,200px). | Reading/form; "each remain focused". |
| `/settings` | Titled "Display settings" while it also holds Account, Your data and Close my account. Every radio option is its own bordered card. Close my account isn't set apart. | "Group related fields with one section heading, not a card per input." "Danger zone separated at the end." |
| `/profile/sharing` | 2,829px on a phone: 6 parts × 3 bordered option cards each. | The same card-per-input rule. |

Availability, credentials, political-fit preferences, preview and setup already follow the reading/form layout. They only pick up the shared radio-row style (see 3).

## 1. Profile — `profile-390.png`, `profile-1440.png`

- **Menu rows (phone):** labels follow `PROFILE_SECTIONS`, the desktop sub-nav, so both name things the same way.
  - "Sharing & privacy" becomes **Who sees what**.
  - "Display settings" becomes **Settings & sign out**.
  - New: **Political preferences** and **What organizations see**.
  - The "Work record" and "Experience" rows go: those sections follow straight after, so the rows only scrolled down.
- **Political preferences status**, from `loadLatestPreference`:
  - **"Needs reconfirming"** in the danger colour whenever the consent status isn't `current` (expired or reworded). Until then nothing is used or shown, so the row must never name a mode.
  - Otherwise the current mode's label ("Private", "Organizations I work with", "Recruiters I approve").
  - **"Not set yet"** when no answer exists. That's today's wording.
- **Desktop:** the left sub-nav stays. The same rows and status words appear as one compact list under the name.
- **Home-area warning:** "Turfcut can't place … so organizations can't find you yet" today lives only in the profile's Who sees what section. It moves directly under the menu (shown only when findable and the area can't be placed), and onto the Sharing page (see 3). It is never dropped.
- **Work record:** ScorecardPanel unchanged. "The math behind every number" stays open (question 1). ScorecardPanel is shared with the organization's view of a worker, so any fold would be a profile-only prop.
- **Experience:** ExperienceList unchanged.
  - The existing ExperienceForm sits behind a "+ Add a campaign" button, closed by default even with no records.
  - The empty state keeps saying what experience is for.
- **Contact:** PhoneForm unchanged and stays on Profile (question 2).
- **Removed from this page:** the duplicate Availability, Credentials, Who sees what and Political fit sections. Each has its own page, linked with its status.
  - The section's "Not until you confirm your choices" line is covered by the existing reminder card ("Check who sees what"), which stays.

## 2. Settings — `settings-390.png`

- **Title:** **Settings** when signed in, in both the heading and the document title (today a static "Display settings · Turfcut"). **Display settings** when signed out, because then the display options are all it holds.
- **Display:** text size, theme, motion and feel as plain radio lists, one card per group. The Sunlight explanation and the preview are unchanged.
- **Account:** "Signed in as …" and Sign out, once.
  - Signed in but without a profile: this section only.
- **Turfcut staff:** the existing admin link for staff, unchanged.
- **Your data** and **Close my account:** workers only, as today.
  - Close my account comes last, below a divider, under a danger heading.
  - The explanation and blocker texts are unchanged. With a blocker there is no close button, as today.
  - If loading the closure facts fails, both stay hidden as today. That is a captured state.

## 3. Who sees what — `sharing-390.png`

- **Layout only.** Every label, explanation, hint and option keeps its exact words. The mockup shortens two long paragraphs and marks where.
- The wording is versioned by hand: `SHARING_TEXT_VERSION` in `src/lib/sharing.ts`, which `loadSharing`, `saveSharing`, the form and matches compare against. No test pins the strings today. So this slice **adds a test that pins the labels and explanations**, which makes "layout only" provable: any rewording fails the test and needs a deliberate version bump.
- Each part becomes one card, with its options as plain radio rows separated by hairlines instead of three bordered cards.
- The home-area warning appears here too, next to "Let organizations find me", when findable and the area can't be placed.
- The same radio-row style applies to the single-choice option cards in Settings and Political preferences. The job builder and signup's two-way account-type switch keep their cards.

## States to capture when built

- **Profile:**
  - first visit (defaults, "Choose who sees what")
  - sharing needs confirming
  - findable with an unplaceable home area
  - political preferences: not set yet, current (each mode), needs reconfirming
  - no experience, and self-reported experience
  - expired credential (row in danger)
  - no home area
  - payouts not available
- **Settings:** signed out, signed in without a profile, worker, organization member, staff, close blocked, close allowed (confirmation step), closure facts unavailable.
- **Sharing:** defaults never saved, saved, needs confirming, findable with an unplaceable home area, failed save.

Each at 390 and 1440, in light and dark.

## Questions for review

1. **"The math behind every number":** keep it open, as today (the plan's default), or fold it under a disclosure on the worker's own profile only? Folding saves most of the work-record height on a phone but hides every rate behind one tap.
2. **Mobile number:** stays on Profile (the default), or move to Settings › Account? It's account data, never shown to organizations.
3. **Tiny shifts:** a 21-second test shift showed "6,704.22 doors per active hour" on the profile. A real accidental check-in and check-out would show organizations the same kind of absurd rate.
   - Should a rate need a minimum amount of active time before it's shown, "not enough data" otherwise?
   - That changes how a metric is defined, so it needs your decision first. It isn't part of this layout work.
4. **Order:** Profile, then Settings, then Who sees what, one reviewed slice each, with evidence. Built with the defaults above; anything you change in review is a small follow-up.
