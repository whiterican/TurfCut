# TurfCut redesign — architecture and build sequence

Status: **draft for the C1/C2/C3 gates**. No new production code is written
until all three reviews say READY. Two commits already on branch `redesign`
are kept as the start of the foundation:
- R1: the four-tab worker dock (Home, Jobs, Messages, Profile), which the owner approved.
- E1: the Fraunces display type, larger radii and the cream primary card by night.

Inputs:
- the v4 handoff "Final Redesign Synthesis";
- the owner's mockups (inspiration only; see §2.3);
- the P0 measurements of 27 Oct, run against master `fec5712` in the local preview;
- a code inventory of master `fec5712`.

Owner direction, 27 Oct, which governs this document:
- architecture before polish;
- the build order is foundation → desktop and mobile layouts → core workflows → visual polish → regression testing;
- the redesign is *ready for* walkbooks, territories and richer field work but does not build them;
- stop moving the finish line.

---

## 1. Scope

**In scope:**
- the visual system;
- page layouts for every route at 320–1440;
- the app shells: worker, organization, staff admin and public;
- the core workflows' screens;
- the dock and keyboard contract;
- regression capture and checks.

**Out of scope** (each needs its own approval, per v4 §7, E5):
- **Product changes:** draft autosave for job creation; a sharing "default + exceptions" model; schema changes.
- **The field-operations expansion:** walkbooks, territories as records, imports, voter or lead data, visits, outcomes.
- **Unrelated bugs:** the review findings on supervisor scoping and the jurisdiction form, which wait until after the redesign.

**Never in any stage** (CLAUDE.md, v4 §7):
- star ratings or any overall worker score;
- leaderboards;
- invented metrics or testimonials;
- live worker pins or tracking;
- blended earnings;
- projected jobs shown as live;
- political inference.

---

## 2. Decisions that are locked

### 2.0 Visual reference: the best of every set, eggplant frame (owner, 27 Oct)
The owner named the **forest-dark set** as the strongest and asked for the best parts of the others too. The v4 brief stays the contract: "green is the primary-action colour, eggplant is the signature identity/navigation colour". The synthesis keeps both.

**The forest-dark set (primary)**

| Area | Taken | Not taken |
|---|---|---|
| Frame | **Composition only.** The frame colour is **deep eggplant** (owner, 27 Oct: "Go back to eggplant frame"). The dark header, dock, desktop rail and phone shell take the eggplant shell (`--shell-*` tokens), not forest | The forest frame colour |
| Content | Cream content sheets carrying the work: lists, details, tables | |
| Public entry | The photo-led entry "Field work that matters." with a single white CTA | |
| Jobs list | Photo/tile thumbnails; pay as the second line; a save mark | |
| Job details | Image header, title + pay, organization with its verification mark, icon fact rows, a requirements checklist, one full-width green "Apply" | |
| My schedule | Upcoming / Past / Availability segments; day groups; status pills **mapped to real states** (Scheduled, On shift, No check-out received, Awaiting review, Approved; §4.1.3) with two quiet actions; a "Required actions" list | "Confirmed" and "Pending" labels with no matching state |
| Profile | Initials avatar, name and place; a menu of icon rows with a status word on the right | Ratings and stats; a photo |
| Desktop | Dark rail with the org name and the signed-in person; a wide cream work area; tables with status pills; a map with a list panel on the right | KPI deltas; Rating column; an org *switcher* (a profile belongs to one org; switching would be a schema change) |

**The eggplant sets (images of 27 Oct)**

| Area | Taken | Not taken |
|---|---|---|
| Home / Today | The dominant cream "next shift" card with a map thumbnail and a green "View shift details →", then "Upcoming shifts" rows | |
| Messages | Segmented filter (All / Unread / Organizations); rows with an **initials** avatar (or the campaign's own image for a campaign thread) and time on the right | Worker photos: workers have no photo field, and a face in org views is a demographic proxy (CLAUDE.md rule 4) |
| Notifications | Today / This week grouping; icon rows | |
| More menu | The org phone "More" sheet that exists today, styled as icon rows | Help/safety/legal/compliance/about pages: no such routes; no content pages are created |
| Shift details | A three-fact row (pay, type, setting). A tab strip **only for the brief** (instructions, requirements); while a shift is live, the status, packet custody, sync state and the check-out reason are always visible above any tabs | Tabs that can hide custody, sync or blockers |
| Field mode header | Big counts row for the live shift, from what TurfCut records: signatures or doors and contacts, packets out, time to the scheduled end | A "conversations" count (not measured); route map; "next address" |
| Earnings | A large paid figure; breakdown rows with icons and chevrons (paid, approved, waiting, disputed); "Recent payouts" with Paid pills | Bonuses; an unlabelled monthly "total earnings" |
| Identity | Eggplant as the identity colour: the brand mark, the **active nav tile** (dock and rail), selection and focus | |

**Colour roles:**
- **Frame:** deep eggplant `#281539` (`#1A0F26` by night) for the desktop rail, the phone header band on Field pages and the public hero overlay. The floating phone dock is a cream sheet (plum by night) with the eggplant active tile, as set in §2.0a.
- **Content:** cream sheets.
- **Identity, current place and selection:** eggplant.
  - On a cream surface the active tile is eggplant `#281539` with cream type.
  - On the eggplant frame it is a **lavender `#D8CCE4` tile with ink type** (§2.0a).
  - **Focus is not eggplant:** it is set per surface (§2.0a, "Focus ring by surface").
- **The one thing to do, and live state:** forest green, the only saturated green on a screen.

This keeps the v4 brief exactly: "green is the primary-action colour, eggplant is the signature identity/navigation colour".

**Content rules from every set still apply.** None of these are built:
- avg rating, rating columns or stars;
- "Background check", ID-verified rows, payment-card digits;
- bonuses;
- live worker dots, routes or "% complete";
- KPI deltas ("+12%"), audience stats ("10K+") or testimonials.

**Engineering:** the shell hue is still a token family (`--shell-*`), defaulting to eggplant.

### 2.0a Surfaces by mode (resolves C1 P0-1)

The frame, sheets and primary object in each mode. Values are existing G1 tokens unless marked *new*. B1 adds a test for every ratio given here.

| Role | Light | Dark | Sunlight |
|---|---|---|---|
| Page | paper `#EFEAE1` | `#120D18` | white |
| Frame: org rail; the phone header band on Field pages; the public hero overlay | eggplant `#281539` | `#1A0F26` (*new* `--shell-bg`), with a 1px `#3C2D4C` edge so it separates from the `#120D18` page | black |
| Sheet: lists, sections, tables | cream `#FBF7F0` | plum `#23182F` | white, 2px black border |
| **Primary object** (one per screen) | eggplant `#281539`, cream type | **cream `#FBF7F0`, ink type** (E1) | black, white type |
| Secondary surface | `#F5F0E6` | `#30223F` | white |
| Active nav tile on cream (dock, top bar, segmented) | eggplant `#281539`, cream type | raised `#4A3365`, cream type, plus a lavender edge | black, white type |
| Active nav tile on the frame (rail) | lavender `#D8CCE4`, ink type (*new* `--shell-active`) | lavender `#D8CCE4`, ink type | white, black type |
| Primary action | forest `#164B38`, cream type, on paper or cream only | forest `#164B38`, cream type, plus a lavender edge (existing) | black, white type |
| Primary action on the frame, a photo or the eggplant primary object | cream `#FBF7F0`, ink type | cream, ink | white, black |
| Muted text | `#4A4254` | `#CBBDD8` | `#1B1422` |

**Focus ring by surface** (replaces "eggplant = focus"; C3 F2):
- One `--focus` value per surface, set by the surface's class.
- 2px ring with a 2px offset; the ring must be ≥3:1 against both the surface and the control.
- B1 tests every pair.

| Surface | Light | Dark | Sunlight |
|---|---|---|---|
| Paper, cream sheet | eggplant `#3A2154` | soft green `#82BC9B` (7.6:1 or more) | black |
| Plum sheet (dark) | — | soft green `#82BC9B` | — |
| Eggplant frame or primary object | cream `#FBF7F0` | lavender `#D8CCE4` | white |
| Cream primary object (dark) | — | ink `#1B1422` | — |
| Forest action, active tile | the ring sits outside, in the page-coloured gap (offset 3px), so it's measured against the surface, never the fill | same | same |

**Active nav tile, every mode** (C3 F3). Besides colour, every active tile carries **bold weight plus `aria-current`**, and in the dock a 3px bar above the icon.

| Where | Light | Dark | Sunlight |
|---|---|---|---|
| On cream or plum (dock, top bar) | eggplant `#281539` tile, cream type (14:1 on cream) | `#4A3365` tile, cream type, **1px edge `#CBBDD8`** (6.0:1 against the tile, 7:1 or more against plum) | black tile, white type |
| On the frame (rail) | lavender `#D8CCE4` tile, ink type (about 11:1 against `#281539`) | lavender `#D8CCE4` on `#1A0F26` | white tile, black type, on a black rail |

The Sunlight frame is black (`--rail-bg` today is white; B1 changes it to black with white type, then tests it).

**Rules:**
- **Forest only on paper or cream.** Forest never sits directly on eggplant or a photo: forest on `#281539` is about 1.3:1.
- **The active tile on the frame is lavender.** The lavender tile with ink type is above 8:1 against `#281539` and `#1A0F26`. The raised-eggplant tile (`#4A3365` on `#281539`, about 1.6:1) is never used on the frame.
- **By night, cream is only for the one primary object.** All other content sits on plum sheets. This is the v4 hybrid; "cream sheets" in §2.0 means light mode.

### 2.1 Visual
- **Palette.** Per §2.0, the shell is deep eggplant (`--shell-*` tokens, new; G1 already holds these values); cream sheets and the forest action already exist in G1. The other G1 tokens already match the brief: paper `#EFEAE1`, cream `#FBF7F0`, eggplant `#281539`/`#3A2154`/`#4A3365`, forest action `#164B38` and the soft-green cut `#82BC9B`. There is no palette rewrite and no lime.
- **Modes.** Light, Dark and Sunlight are all first-class. Surfaces by mode are set in §2.0a. Chat bubbles stay eggplant.
- **Type.**

  | Role | Face | Where |
  |---|---|---|
  | Display | Fraunces | Page titles, primary-object headlines, section titles, the public hero |
  | Workhorse | Barlow | Everything else: names on cards, data, labels, forms |
  | Labels | Barlow Condensed | Eyebrows and dock labels |
  | Figures | DM Mono | Money, counts, IDs (packets, receipts) |

- **Colour roles (§2.0).**
  - Forest marks the one primary action and live state.
  - Eggplant marks the frame (shell), identity, the active nav tile and selection.
  - Focus is per surface (§2.0a).
  - Cream sheets carry the content.
  - Status pills always carry words.
- **Signature details.** The folded corner (`--cut`) appears on primary objects only.

### 2.1a What today's app does better than the mockups (keep; C1 Q10)
- **Earnings:** the lifecycle wording ("On hold or disputed") and the per-line formula ("3h 30m verified × $25.00/hr"), from `worker__earnings__worker__390-light.png`.
  - **One approved correction (C2):** "Approved · payout setup needed" shows today even when in-app payouts are switched off and there is nothing to set up (`lib/pay.ts:320`, `earnings/page.tsx:160,203`, `dashboard/page.tsx:281`). The label follows the provider state:
    - provider off → "Approved · sent once in-app payouts are switched on"
    - provider on, worker not set up → "Approved · payout setup needed", next to the existing `PayoutSetup` action
    - payouts enabled → "Approved · in the next pay run"
  - This is a one-function change in `lib/pay.ts` `statusLabel`, plus its callers, with tests.
- **Job page:** "What counts as payable", the rules profile and version, credentials needed, and "Why it fits" with "no hidden score", from `worker__jobs_jobId__worker__1440-light.png`.
- **Shift page:** packet custody (picked up, returned, kept), signed corrections, and sync truth ("Nothing waiting to send", memory-only).
- **Desk:** the "Needs you" operations table (PR #98).
- **Applicants:** "Not shared is never counted as zero or ranked. There is no overall score."
- **Admin:** "Everything you do here is recorded with your name and your reason."
- **Chat:** quick replies and the report flow.

Each of these strings survives B1–B3 word for word unless a reviewer approves a change.

### 2.2 Information architecture
- **Worker dock (R1, four tabs):**
  - **Home** = Today plus the campaign feed.
  - **Jobs** = Find work plus My schedule.
  - **Messages**.
  - **Profile**, which holds Earnings, Availability, Credentials, Sharing and Settings.
- **Worker desktop:** the same four sections in the top bar, plus a direct Earnings entry.
- **Organization:** the rail on desktop. On phones the dock is Desk, Hiring, Field, Messages and More. Grants decide what shows, unchanged (`lib/access`, `lib/nav`).
- **Staff admin:** its own shell identity: a "Turfcut staff" header band and the Admin nav in the rail (§4.2.1). Never inside an organization's rail.
- **Public:** landing, login, signup, campaign pages (`/c/...`).

### 2.3 What the mockups are, and are not

**Taken from the mockups:**
- **Shape and type:** serif titles; generous, soft cards; one dominant card per screen with a clear green action.
- **Lists and controls:** icon-led list rows with chevrons; pill chips and segmented controls; the compact floating dock with a filled active tile.
- **Layouts:** an editorial photo hero for public pages; desktop with a dark rail plus a wide work area plus tables.

**Not taken, because these are false or unsupported in TurfCut:**
- ratings (★ 4.9, "Avg. rating");
- "Background check" and "Identity verification: Verified" rows (no such features);
- "Bonuses";
- earnings bar charts by month (only if computed from real paid lines);
- "Next address" navigation, live route maps, live worker dots and per-worker "% complete";
- fake KPI tiles ("10K+ verified workers", "+12%");
- testimonials;
- compliance-rate gauges.

**Photos:**
- Licensed stock appears on public pages only, labelled as placeholders until the owner supplies their own.
- Job cards show a campaign's own header image when one exists (`CampaignProfile.headerKey`). Otherwise they show a typographic tile in the job type's colour, never a stock photo pretending to be the job.

---

## 3. What the evidence says about today's code (master `fec5712`)

| Finding | Number | Consequence for the architecture |
|---|---|---|
| Page width is set by hand per page | `page max-w-2xl` ×62, `3xl` ×28, `4xl` ×8, `5xl` ×8 (≈100 routes or sections) | **Root cause of "stretched phone column" on desktop.** Replace with named templates (§4.2); don't restyle page by page |
| Shared CSS components carry the UI | `.card` in 75 files, `.list-card` 43, `btn-*` 50–69, `.section-title` 43, `.empty-state` 37 | A foundation change re-skins most of the app at once; layouts and workflows then change only where they need to |
| Shared React components | `Masthead` 44 importers, `PageSkeleton` 57, `LocalTime` 34, `ActionButton` 18, `EmptyState` 9; `DataTable` only used by staff (5) | Promote `DataTable` to the shared table; add the missing primitives (§4.3) |
| Dock collisions (P0-1) | **Measured.** Fully hidden behind the dock: "Continue" on `/welcome` at 320 and at 200% text; the focused toggle on Availability at 320. Focus 97–99% hidden: "Sheets returned" on the shift page at 390, `/desk` and the pay dispute page. A field under the dock with the keyboard open on 6 forms | A shell-level **dock contract** (§4.2.3), not per-page fixes.<br>**Prototype result, corrected per C3:**<br>• Tab focus fully hidden 2→0, partly hidden ~30→2<br>• Keyboard, *touch context*: dock hidden in 10 of 10 runs<br>• Keyboard, *no touch context* (a narrow desktop window): still 2 collisions at 320, on `/jobs/new` and `/jobs/[jobId]/edit`<br>• 6 keyboard rows timed out in the first run and were not measured<br>The contract is not proven until B1's check passes with errors counted as failures |
| Header at 200% text | 458px wide at 390 → 149 of 154 *route/role/width rows* (77 route/role pairs × 2 widths) scroll sideways | Pixel-bounded icon buttons and wordmark in the shell |
| Worker desktop nav (P0-2) | Exists (`TopNav`, ≥1024, `aria-current`). The earlier "missing" claim came from a preview artefact | Keep. Make it more visible; add Earnings |
| Contrast (P0-3) | 0 WCAG failures across 1,656 text runs (5 pages × 3 modes × 2 widths); dark mode 49–64% plum at 390. *Before E1; main content only: the header, dock, rail and non-text elements were not measured (C3)* | Legibility is fine; the problem is monotony → the cream primary object by night (done in E1) |
| Payout CTA (P0-4) | The label is 69–171px from the `PayoutSetup` card, not linked; no button while Stripe is off | Primary-object pattern for Earnings: the block and its existing action sit together (§5) |
| State truth (P0-5) | Desk says "Nothing under way" while 3 shifts are still checked in from 3 days ago; Today shows a stale "next job" for a live shift | The workflow stage must render state from the data (`ACTIVE` + `endsAt < now`), not a 24h window. No schema change |
| Times | All rendered times follow the viewer's clock (15 pages checked) | No change |

---

## 4. Architecture

### 4.1 Foundation (tokens, type, vocabulary) — `src/app/globals.css`, `src/app/layout.tsx`

1. **Tokens.**
   - Keep the G1 tokens.
   - Add only **role tokens** that templates need:
     - `--page-gutter`;
     - `--measure-reading` (42rem), `--measure-content` (48rem), `--workspace-max` (90rem);
     - `--inspector-w` (24rem);
     - `--dock-clearance`.
2. **Type scale** (rem scales with the text-size setting; minimum 13px).

   | Role | Phone | ≥1024 | Line height | Face, weight, tracking |
   |---|---|---|---|---|
   | `display` (public hero only) | `clamp(2.75rem, 11vw, 3.5rem)` | 4.5rem | 0.98 | Fraunces 600, −0.02em, opsz auto |
   | `title` (page) | 2rem | 2.75rem | 1.06 | Fraunces 600, −0.02em |
   | `headline` (primary object) | 1.5rem | 2.125rem | 1.12 | Fraunces 600, −0.015em |
   | `section` | 1.25rem | 1.375rem | 1.2 | Fraunces 600, −0.01em |
   | `body` | 1rem | 1rem | 1.5 | Barlow 400 (500 in Sunlight) |
   | `strong` (names on rows and cards) | 1.0625rem | 1.0625rem | 1.35 | Barlow 600, −0.01em |
   | `small` (secondary) | 0.9375rem | 0.9375rem | 1.5 | Barlow 400/500 |
   | `hint` | 0.8125rem | 0.8125rem | 1.4 | Barlow 500 |
   | `label` (eyebrows, table heads) | 0.8125rem | 0.8125rem | 1.2 | Barlow Condensed 600, uppercase, 0.14em |
   | `figure` | 1rem / 1.5rem / 2rem (sm/md/lg) | same | 1.1 | DM Mono 500, tabular |

   Utility classes only (`.t-display` … `.t-figure`). No component sets a font family or size outside them.

3. **Status vocabulary.** One `StatusBadge`. Each state pairs a word with a glyph *shape*, so state survives greyscale, colour blindness and Sunlight. Colours are tokens. B1 tests every text/background pair at ≥4.5:1 and every glyph at ≥3:1 in all three modes.

   | State | Default word | Glyph | Light | Dark | Sunlight |
   |---|---|---|---|---|---|
   | `live` | On shift / Open now | filled dot with a halo | cream on forest pill | cream on forest pill, lavender edge | white on black pill |
   | `paid` | Paid | filled circle with a check | cream on eggplant `--solid` pill | `--on-solid` on `#4A3365` | white on black |
   | `approved` | Approved (not yet paid) | ring | ink text, `--solid` ring, no fill | cream text, lavender ring | black text, black ring |
   | `pending` | Waiting for approval / Pending | dashed ring | `--muted` text | `--muted` text | `--muted` text |
   | `blocked` | Blocked / Can't publish / Not approved | filled square | `--danger` text on a 14% coral tint | `--danger` text on a 14% coral tint | `--danger` text, square |
   | `disputed` | Disputed | triangle | `--warning` text on a 14% butter tint | `--warning` text on a 14% butter tint | `--warning` text |
   | `not-shared` | Not shared | hollow thin ring | `--muted` italic, no fill | `--muted` italic | `--muted` italic |
   | `draft` | Draft / Not sent yet | dotted ring | `--subtle` | `--subtle` | `--subtle` |
   | `closed` | Closed / Ended | dash | `--subtle` | `--subtle` | `--subtle` |

   **Exhaustive mapping from the domain** (C3 F4). `StatusBadge` takes a *domain* value, not a free state. Each domain gets a mapping function written as a `switch` with **no default branch**, so TypeScript fails the build if a new domain state appears unmapped. Words come from the existing functions; nothing is renamed in the UI.

   | Domain (source) | Value → badge state, word |
   |---|---|
   | Pay line (`lib/pay` `PayStatus` + `statusLabel`) | `AWAITING_APPROVAL` → `pending` "Awaiting payment approval"<br>`APPROVED` → `approved`, with the payout context word: "Approved · payout setup needed" (state **`approved-blocked`**, ring with a square), "Approved · in the next pay run" or "Approved"<br>`HELD` → **`held`** (square, coral) "On hold"<br>`DISPUTED` → `disputed`<br>`PROCESSING` → **`sending`** (half-filled circle, eggplant) "Sending"<br>`PAID` → `paid`<br>`VOIDED` → `closed` "Replaced"<br>`NOTHING_DUE` → `closed` "Nothing to pay"<br>Negative amounts → `closed` "Deducted…" |
   | Shift (status + field-day replay) | Scheduled → `pending` "Scheduled"<br>Checked in, now ≤ `endsAt` → `live` "On shift"<br>**Checked in, now > `endsAt` → `overdue` (triangle, warning) "No check-out received · was due to end {time}"**. Never `live`. A check-out still queued on the worker's phone reads as checked in on the server, so the worker's own view also shows the queued state<br>On break → `live` "On break"<br>Checked out, awaiting review → `pending`<br>Approved → `approved`; Not approved → `blocked`<br>Cancelled → `closed`<br>Ended without check-in → `closed` "Ended without a check-in" |
   | Sync (`lib/moments` `PillState` + `offline-queue`) | `online` and nothing waiting → `closed`-style quiet "Nothing waiting to send"<br>`syncing` → `sending`<br>`waiting` → **`queued`** (dotted ring) "On this phone, not sent yet"<br>`unsaved` / memory-only → **`memory-only`** (dotted ring plus warning) "Only in memory: don't close the app"<br>`refused` → `blocked` "Refused by the server"<br>`offline` → `queued` "Offline" |
   | Engagement (C3 stages) | applied → `pending`<br>in review → `pending`<br>offered → `approved` "Offer out"<br>hired → `approved` "Hired" (never `live`)<br>declined / withdrawn → `closed`<br>The words come from `engagement-labels` |
   | Sharing | not shared → `not-shared` (never zero) |
   | Jurisdiction gate | unknown / expired / unapproved → `blocked` "Can't publish", with the reason. Never a silent default |

   New states this adds to the table above: `overdue`, `held`, `approved-blocked`, `sending`, `queued`, `memory-only`.

   **Unique glyphs** (C1 round 2: no two states may share a glyph and colour, since overdue and disputed can sit on one screen). B1 tests that the (glyph, colour) pairs are unique.

   | State | Glyph | Colour |
   |---|---|---|
   | live | filled dot with halo | forest |
   | paid | filled circle with check | eggplant |
   | approved | ring | eggplant |
   | approved-blocked | ring with a small lock | eggplant |
   | sending | half-filled circle | eggplant |
   | pending | dashed ring | muted |
   | queued | clock | muted |
   | memory-only | clock with "!" | warning |
   | draft | dotted ring | subtle |
   | overdue | hourglass | warning |
   | disputed | triangle "!" | warning |
   | held | pause bars | danger |
   | blocked | filled square | danger |
   | not-shared | eye-off | muted italic |
   | closed | dash | subtle |

   **Future field states** (`visited`, `not home`, `refused`, …) are added as new rows here, not as new components (§4.4).

   **Rules:**
   - Only `live` uses forest, and only while the shift is genuinely under way.
   - Pay states never share a fill: paid is filled eggplant, approved is a ring, pending is dashed.
   - Callers pass the state and may override the word; the glyph and colours are fixed.
   - The 9 files using `badge-*` move to `StatusBadge` in B1.
   - Final status colours are a **B1** deliverable, not B4.

4. **Elevation and radii.**
   - Paper page → cream card → (night) plum secondary, with one shadow scale.
   - Radii: card 20px, inner 16px, control 12px (E1).
5. **Motion.** The existing tokens and reduced-motion support. Nothing new until stage B4.

### 4.2 Layout system

#### 4.2.1 Shells (one per audience) — `src/app/layout.tsx`, `src/components/AppNav.tsx`

- **Worker shell.**
  - Header with the logo, bell and settings, pixel-bounded so it never overflows.
  - ≥1024: top nav with Home, Jobs, Messages, Profile and Earnings.
  - <1024: the floating four-tab dock.
- **Organization shell.**
  - ≥1024: a **full-height** eggplant rail (org name and approval state at the top, the signed-in person at the bottom), instead of today's floating card. Then the main area, with an optional inspector column.
  - <1024: the org dock.
  - Width: up to `--workspace-max` (90rem), instead of today's `max-w-6xl`.
- **Admin shell.** Its own identity: a "Turfcut staff" header band and the Admin nav in the rail. It never appears inside an organization's rail.
- **Public shell.** Transparent header over the hero; plain header elsewhere.

#### 4.2.2 Page templates (replacing the ~100 hand-set widths)

`src/components/layout/` adds:

| Template | Use | Phone | Desktop (1280/1440) |
|---|---|---|---|
| `ReadingPage` | settings, forms, consent, policies | single column | `--measure-reading` centred; aside for help on the right where useful |
| `ListPage` | lists to scan (jobs, schedule, messages list, notifications, feed) | single column, rows | content column plus an optional right context rail (filters or summary) |
| `ListDetailPage` | lists with a selected item (hiring, applicants, messages thread, pay lines) | list → separate detail route | list plus an inspector side by side (`--inspector-w`); the detail route still exists for deep links |
| `RecordPage` | one thing (job, shift, receipt, dispute, campaign) | primary object first, then sections | main column plus a sticky aside (facts and actions) |
| `WorkspacePage` | tables and maps (desk, field, pay, admin audit) | stacked cards or rows | full width up to `--workspace-max`, dense table or map plus an optional inspector |
| `FieldPage` | in-shift task mode (today: the shift day) | primary object, persistent `ActionBar` above the dock, Sunlight one tap away | the same, two columns (task / brief and map) |
| `HeroPage` | public landing, sign-in | photo top then form | 45/55 photo/form split; landing: full-bleed hero |

Each template owns these, so a page can't get them wrong:
- gutters;
- bottom clearance;
- the heading slot (`Masthead`);
- skeleton parity (`PageSkeleton` takes the template name).

**No new loading UI** (C2): Home, My schedule, campaign pages and `/` stay free of `loading.tsx` and `Suspense` fallbacks (today's choice). No `template.tsx` files are created.

**Inspector widths (C1 round 2):**
- *Worker pages* show their panel from 1024.
- *Organization and admin pages* (with the ~240px rail) show the inspector only from **1280**. At 1024–1279 the row opens the detail route, so the main table never drops below about 720px.
- B2's exit check measures 1024 as well as 1280 and 1440.

**Inspector focus:**
- Selecting a row moves focus to the inspector's heading.
- Esc or "Close" returns focus to the row.
- The inspector is a labelled `region`, not a modal, so the list stays usable.


#### 4.2.3 Dock and keyboard contract (shell-level, P0-1)

- `html:has(.tabbar)` → `scroll-padding-bottom` = dock height plus safe area, so focus and anchors land clear of the dock.
- On touch phones, the dock hides while any text field has focus. Chat does this today; the rule extends it to every text field.
- Every template's bottom padding is derived from `--dock-clearance`; no page sets its own.
- Sticky actions (`ActionBar`) sit at `bottom: dock + gap` and become static at ≥1024.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` on the header, dock and ActionBar.
- **Acceptance** (automated, the scripts from the P0 run):
  - 0 fully hidden focus targets and 0 keyboard collisions at 320 and 390;
  - 0 sideways overflow at default and XL text on every route;
  - header ≤ viewport at 200% text.

### 4.3 Component layer

Components take **view models** (plain props shaped for display), not Prisma types. That way new data sources (walkbook stops, territory records) can feed the same components later.

| Component | Today | Action |
|---|---|---|
| `Masthead` | 44 importers | **Keep.** Add `variant` (page / record) and a slot for template actions |
| `PrimaryObject` | `.hero-card` + variants (4 files) | **New wrapper** over the hero-card CSS. Props:<br>• eyebrow, headline<br>• facts[] and figures[]<br>• state (StatusBadge)<br>• primary action plus up to 2 secondary<br>• optional `aside` (map thumbnail)<br>One per screen |
| `ListRow` | `JobRow`, `.shift-row`, `Row`, ad-hoc rows | **New base** with leading (icon, avatar or tile), title, meta lines, trailing (figure, badge, chevron) and density. `JobRow`, shift rows, message rows and notification rows become thin adapters |
| `DataTable` | `staff/DataTable` (sortable, "not shared" grouping, bulk select) | **Promote** to `components/table/`. Add:<br>• a linked filter bar<br>• a selected row driving the inspector<br>• a phone mode that renders `ListRow`s instead of a squeezed table |
| `Inspector` | none | **New.** A side panel at ≥1024.<br>**Mechanism (C2):**<br>• *Not* parallel or intercepting routes. The list page reads `?selected=<id>` and, only when it is present, renders the inspector on the server by calling **the same checked loader as the full detail page**.<br>• Loaders are `load…ForViewer(session, id)` in `lib/*-data.ts`. They do the access checks inside (area, level, `orgId` scope) and return only shared, in-grant fields. Today's inline checks on the applicant page move into these loaders, so there is one copy.<br>• Nothing renders when nothing is selected.<br>• Each row carries two links: the detail route (shown below 1024) and `?selected=` (shown at 1024 and up). CSS hides one, which also removes it from the accessibility tree.<br>• A `?selected=` URL opened on a phone shows the detail content in place of the list.<br>• A foreign or out-of-grant id gives the same 404 or redirect as the detail route.<br>• B1 adds a test that every inspector goes through a `…ForViewer` loader and that no inspector file imports `db()` directly.<br>• **Credentials inspector:** proof photos stay behind an explicit "View proof" link, since every organization look is recorded for the worker. |
| `StatusBadge` | `badge-*`, `.st` in studies | **New** (§4.1.3) |
| `FactList` / `KeyValue` | `.fact-list`, `Row`, `.kv` | **Merge** into one with icon support |
| `Stat` / `Figure` | `.stat`, `LiveFigure` | **Keep**, plus `MathDisclosure` ("how this was worked out": the existing pay formula strings) |
| `FilterBar` / `Segmented` | chips, `JobsSwitch` | **Generalise** `JobsSwitch` into `Segmented` (links with `aria-current`); chips into a `FilterBar` |
| `ActionBar` | none (field actions are in flow) | **New**, for `FieldPage`:<br>• **One state-driven primary action** (check in / log signatures / return or keep packet / check out) plus "More actions", which opens a `Sheet`<br>• At most 72px tall<br>• While it shows, the dock tucks (phone); while a text field has focus the ActionBar steps aside too; static at ≥1024<br>• Reserves its own height, so content is never under it<br>• A disabled action always shows its reason ("Return or keep PKT-0701 first") |
| `MapPanel` | `TurfMap` (Leaflet/OSM), `TurfWorkbench` | **Keep** the engine. Wrap it in `MapPanel` with layer slots, a legend, a no-map fallback and a provenance line |
| `EmptyState`, `Sheet`, `NotSharedChip`, `LocalTime`, `ActionButton`, `PageSkeleton` | | **Keep** and restyle through tokens only |
| `PhotoHero` | none | **New.** Public pages only. Licensed placeholder image, eggplant overlay, labelled until replaced |
| `TypeTile` | none | **New.** The job-type tile used when a job has no campaign image |

### 4.4 Ready for field operations, without building it

The expansion (walkbooks, territories, imports, visits) plugs into these. None of them needs a schema change now.

1. **`FieldPage` + `ActionBar` + `StatusBadge` states.** The shift day today. A walkbook stop list and outcome sheet tomorrow, same template.
2. **`ListDetailPage` + `ListRow` + `Inspector`.** Applicants today. Stops, households and territories tomorrow. Rows take view models.
3. **`WorkspacePage` + `MapPanel` with layer slots.** Today's turf polygons and pins. Tomorrow's territory layers and walkbook boundaries, as extra layers rather than a new map.
4. **Navigation slots.**
   - The org rail's **Field** section can hold "Territories" and "Walkbooks" entries behind grants. Grant areas come from `lib/access`, so new areas are added there, not in a parallel system. A new area changes the access model and needs the owner's approval (CLAUDE.md rule 8); the redesign adds none.
   - The worker shift record can link to a future "Field mode" from the same `PrimaryObject` action.
5. **Offline-first rows.** `ListRow` and `ActionBar` show the existing sync states (sent / on this phone / memory only / refused) from the M6 queue, so visit entries can reuse them.
6. **Privacy defaults in components.**
   - `NotSharedChip` semantics are kept.
   - `MapPanel` has no "live position" layer type at all; it would need a separately approved design.

---

## 5. Screen map: every route (resolves C1 P0-3)

**Template defaults at 768 (no dock change below 1024):**

| Template | At 768 |
|---|---|
| `ReadingPage`, `ListPage`, `RecordPage`, `FieldPage` | One column at `--measure-content` |
| `ListDetailPage` | List only; the detail opens as its own route |
| `WorkspacePage` | Tables in their own horizontal scroller with a sticky first column. Maps take the full width with the list below |
| `HeroPage` | Photo on top (40%), form below |

The **768** column below lists exceptions only. "Panel" means the ≥1024 side column: an aside (facts and actions) or an inspector (a selected row).

### Worker

| Route | Template | Primary object | Panel at ≥1024 | 768 |
|---|---|---|---|---|
| `/dashboard` (Home) | `ListPage` | The live or next shift. Overdue: "No check-out received · was due to end …" with "Open shift". This needs a new query: today's loader drops shifts past their end | Aside: pay summary (by state, never a blended total), your choices (sharing / political-fit), campaigns | aside below |
| `/feed` | `ListPage` (reading width) | none | none | |
| `/notifications` | `ListPage` (reading width), grouped Today / This week / Earlier | none | none | |
| `/jobs` (Find work) | `ListPage` + `Segmented` + `FilterBar` | none | Inspector: the selected job's preview with Apply | |
| `/jobs/invitations` | `ListPage` | none | Inspector: invitation detail (note, expiry, accept/decline) | |
| `/jobs/[jobId]` | `RecordPage` | Pay, dates and the Apply/Claim action, with requirement status | Aside: apply panel, requirements, rules version, "What this organizer sees" | aside below the object |
| `/shifts` (My schedule) | `ListPage` + `Segmented` (Upcoming / Past / Availability → `/profile/availability`) | Next shift | Aside: required actions (real only: credentials missing, sharing not chosen) | |
| `/shifts/[shiftId]` | `FieldPage` | Shift status, counts, packet custody | Aside: brief, staging, map, Sunlight | |
| `/shifts/turf` | `WorkspacePage` + `MapPanel` | none | Shift list beside the map | |
| `/earnings` | `RecordPage` | "Where your pay is" by state, with `PayoutSetup` beside the blocked amount | Aside: payout account, receipts | table becomes rows |
| `/earnings/receipts` | `ListPage` | none | none | |
| `/earnings/receipts/[transferId]` | `RecordPage` (printable) | The receipt | none | |
| `/earnings/disputes/[disputeId]` | `RecordPage` | The dispute line and its clock | Aside: the pay line and its maths | |
| `/messages` | `ListDetailPage` | none | Inspector = the open thread | |
| `/messages/[conversationId]` | `ListDetailPage` (thread side) | none | List on the left at ≥1024 | thread only |
| `/profile` | `ReadingPage` + sub-nav | Initials, name and place | ≥1024: sub-nav on the left (Earnings, Availability, Credentials, Sharing, Preferences, Preview, Settings), the section on the right | menu of rows |
| `/profile/availability`, `/profile/credentials`, `/profile/preferences`, `/profile/sharing`, `/profile/setup`, `/profile/preview` | `ReadingPage` + the profile sub-nav | none | sub-nav | |
| `/settings` | `ReadingPage` | none | none | |
| `/welcome` | `HeroPage` (form side only, no photo once signed in) | none | none | |
| `/c`, `/c/[handle]`, `/c/[handle]/p/[postId]` (signed in) | `RecordPage` | The campaign header | Aside: follow, jobs from this campaign | |

### Organization (grants decide what renders and what loads)

| Route | Template | Primary object | Panel at ≥1024 | 768 |
|---|---|---|---|---|
| `/desk` | `WorkspacePage` | "In the field": live now, plus shifts with **no check-out received** after their end. **Visibility, enforced in the loader** (`desk-data.ts`, new query on `Shift.status = ACTIVE AND endsAt < now`, existing fields only):<br>• full `field` access: names and times<br>• compliance and publisher: counts only, names removed on the server<br>• finance: not shown | Inspector: the selected "Needs you" row | |
| `/hiring` | `WorkspacePage` | none | Inspector: the selected job's people and what each shares | |
| `/hiring/[jobId]/applicants`, `/invites`, `/matches` | `ListDetailPage` (`DataTable`) | none | Inspector: the applicant (shared evidence only) | rows, not a squeezed table |
| `/hiring/[jobId]/people/[engagementId]` | `RecordPage` | The person's stage and next action | Aside: history, snapshot | |
| `/jobs` (org) | `WorkspacePage` | none | Inspector: the job's staffing | |
| `/jobs/new`, `/jobs/[jobId]/edit` | `ReadingPage` (steps) | none | Aside: step list and the publish blockers (jurisdiction) | |
| `/jobs/[jobId]` (org view) | `RecordPage` | Staffing and status | Aside: facts, rules, edit | |
| `/field` | `WorkspacePage` + `MapPanel` | none; counts include still-open shifts (§3, C1) | List of shifts beside the map | |
| `/field/[date]`, `/field/review` | `WorkspacePage` | none | Inspector: the selected shift's custody and review | |
| `/shifts/[shiftId]` (org view) | `RecordPage` | Status, custody, review actions | Aside: corrections, timeline | |
| `/workers/[workerId]` | `RecordPage` | The worker as this org may see them (shared only) | Aside: engagements with this org | |
| `/messages`, `/messages/[id]`, `/messages/new`, `/messages/reports` | `ListDetailPage` / `ReadingPage` (new) | | Inspector: the thread | |
| `/pay`, `/pay/statements`, `/pay/statements/[period]` | `WorkspacePage` / `RecordPage` (statement) | none / the statement | Inspector: the selected pay line | |
| `/pay/disputes/[disputeId]` | `RecordPage` | The dispute and its clock | Aside: the pay line and its maths | |
| `/org/credentials` | `WorkspacePage` | none | Inspector: the credential and its proof | |
| `/org/settings`, `/org/settings/members`, `/org/settings/members/roles` | `ReadingPage` (settings) / `WorkspacePage` (members table) | none | Inspector: the member and their role | |
| `/campaigns`, `/campaigns/[id]` | `ListPage` / `RecordPage` | none / the campaign profile | Aside: posts, resources | |

### Staff admin (own shell identity, C1 P1: "Turfcut staff" header, not an org's rail)

| Route | Template | Primary object | Panel at ≥1024 |
|---|---|---|---|
| `/admin` | `WorkspacePage` | Queues: orgs, campaigns, jurisdictions waiting | none |
| `/admin/organizations`, `/admin/campaigns`, `/admin/jurisdictions`, `/admin/people` | `WorkspacePage` (`DataTable`) | none | Inspector: the selected record |
| `/admin/organizations/[orgId]`, `/admin/campaigns/[campaignId]`, `/admin/jurisdictions/[id]`, `/admin/people/[profileId]` | `RecordPage` | The decision needed, with reason and evidence | Aside: provenance, history |
| `/admin/jurisdictions/new` | `ReadingPage` | none | Aside: what the gate does |
| `/admin/audit` | `WorkspacePage` | none. Columns: event, entity, actor, reason, evidence, effective time, next action | Inspector: the event |

### Public

| Route | Template | Notes |
|---|---|---|
| `/` | `HeroPage` (landing) | "Field work that matters." (worker-led). An organizer band "The work behind every campaign."; the evidence-over-ratings proof row |
| `/login`, `/signup` | `HeroPage` (split 45/55) | Never fields over a photo; validation, recovery and keyboard |
| `/c`, `/c/[handle]`, `/c/[handle]/p/[postId]` | `RecordPage` | Campaign pages, public view |

## 6. Build sequence (owner's order, with measurable exits)

Each stage is a set of small commits on `redesign`. Every stage, from B1, ends with:
- typecheck and tests;
- **the QA checks in §6.3** (run, results saved, script errors counted as failures);
- an independent reviewer pass (CLAUDE.md rule 9);
- before/after screenshots at 390 and 1440 × light/dark/Sunlight for the owner.

Nothing merges without the owner's word.

| Stage | Contents | Exit: all must be true |
|---|---|---|
| **B1 Foundation** | <ul><li>Shell, type and colour: role tokens; type utilities (§4.1.2); mode surfaces, focus and tiles (§2.0a); the Sunlight frame</li><li>Status: `StatusBadge` with the exhaustive domain mapping (§4.1.3), replacing the `badge-*` uses</li><li>`SiteHeader` extracted from `layout.tsx` (used by the real layout and the harness)</li><li>Dock contract; a skip link; `aria-current` on Earnings; the stale-state truth (overdue shift on Home, Shift and Desk; no stale "next job"), using existing fields only</li><li>Performance baseline and budgets (§8)</li></ul> | <ul><li>Token and contrast tests pass for every pair in §2.0a and §4.1, including header, dock, rail, focus, tile edges and badges</li><li>The §6.3 dock, keyboard, overflow and nav checks pass</li><li>The status mapping test covers every domain value</li><li>`grep -rc 'badge-' src/app src/components` = 0</li><li>The owner has seen the B1 screenshots</li></ul> |
| **B2 Layouts** | <ul><li>**Pilots first** (one per template; shown to the owner): Home, Job, Shift, Desk, Applicants, Profile, Landing and Login</li><li>Then every route moves onto its template (§5), with `PageSkeleton` per template</li></ul> | <ul><li>`grep -rE 'className="page( |")' src/app` = 0 hand-set widths (`page max-w-*` gone)</li><li>At 1280 and 1440, every route marked "panel" in §5 renders its aside or inspector, and main is ≥60% of the viewport width minus the rail</li><li>§6.3 checks pass on every route</li><li>The route-skeleton test is updated</li></ul> |
| **B3 Core workflows** | The primary objects and screen content per §5:<br>1. Home<br>2. Find work and Job<br>3. Schedule and Shift (`FieldPage`, `ActionBar`)<br>4. Earnings<br>5. Desk and Field (truth)<br>6. Hiring and applicants<br>7. Messages<br>8. Profile<br>9. Public landing and sign-in<br>10. Pay<br>11. Admin | <ul><li>One named test file per invariant in §7, all passing</li><li>Every B3 fixture state (§6.2) captured in 3 modes</li><li>The state-truth check (§6.3) matches the domain functions word for word</li></ul> |
| **B4 Visual polish** | Photography (public placeholders), type tiles, empty-state art, motion review | <ul><li>A fixed checklist: hero photo; job tiles; empty states for every `ListPage`; reduced-motion pass</li><li>Timebox: 2 working sessions</li><li>The only exit is the owner's sign-off</li></ul> |
| **B5 Regression** | Full matrix and real devices | <ul><li>Every route × role × grant returns an **authorized 200, or the same 403/redirect as master**, under the harness's real access checks (§6.1)</li><li>All §6.3 checks pass at full scope</li><li>The real-device checklist is recorded by the owner (container emulation can't prove iOS Safari keyboard, safe-area or page zoom)</li><li>Reviewers READY</li></ul> |

### 6.1 Test harness (C3 F1)

**How it runs today.** The local preview (`src/app/zz-preview`) is git-excluded and never committed. It simulates the *session source* only:
- **Before B1 (today):** its guards are no-ops. Captures so far prove rendering, not access.
- **From B1:** the harness builds each identity's session from the **database** (role, `orgId`, grants via the real `liveGrants`). Its guards call the real decision functions (`canUse` / `can` from `lib/access`) and follow the real guards' redirect and 404 behaviour line for line.
- **Shell:** the harness renders the real `SiteHeader`, `TopNav`, `TabBar` and `OrgRail`, so shell changes are tested as shipped.

**Limits, stated honestly:**
- Sign-in itself (Supabase) is not exercised.
- Sign-in stays covered by the existing acceptance scripts against a real auth stack.

**Guarding the harness** (C2: today it gives any visitor a cookie-chosen session, Owner included, against the real database):
- It must never be deployed, moved or committed.
- `zz-preview` is in `.git/info/exclude`.
- B1 adds a test that fails if any tracked file imports `zz-preview` or if the directory is tracked.

**Playwright:** pre-installed in the environment; the check scripts import it from there. No project dependency is added. Making the checks part of CI (`@playwright/test` in `package.json`) is an **owner decision** (§9) and is not needed to run the stages.

**Fixtures:**
- Clock-relative, generated against a frozen `now` per run, with the known artefacts removed (the 0201/0701 overlap, the 0703/0704 mismatch).
- Each run's manifest keeps SHA-256 hashes and timestamps.

### 6.2 Fixtures each stage needs first (local preview DB only, synthetic)

| Stage | Must exist |
|---|---|
| B1 | Harness sessions for worker, new worker, owner, recruiter, supervisor, finance, publisher, staff, and a custom role with restricted grants; 60+ character org, job and worker names; a shift checked in past its end |
| B2 | An empty org (no jobs, no members); 1 / 100 / 1,000 rows for jobs, applicants, pay lines and the audit log |
| B3 | Applicants (`APPLIED`, `OFFERED`, `DECLINED`) with mixed sharing and not-shared parts; Stripe off / Stripe on with the worker unonboarded / payouts enabled; held pay; an overdue dispute; an adjustment; a packet out, kept and returned; server-refused sync and every client sync state; an expired or unapproved jurisdiction; a revoked credential; an ineligible job |
| B5 | All of the above with a frozen clock; for the map, no geometry and the network blocked |

### 6.3 QA checks (every stage from B1; full scope at B5)

| Check | Scope | Pass |
|---|---|---|
| Dock and focus | Every route with the dock × 320/390 × default/XL/200% text × motion reduce/on | No focused control more than 50% covered; the page's primary action 0% covered; 0 script errors |
| Keyboard | Every form × 320/390 × touch context **and** a narrow desktop window | The field and its submit button are never under the dock or the ActionBar |
| Overflow | Every route × 320/390/1024 × default/XL/200% text | 0 sideways scroll (header and content), except tables inside their own scroller |
| Contrast | 8 priority routes × 3 modes × 390/1440, including the header, dock, rail and non-text elements | Text ≥4.5:1 (≥3:1 large); non-text ≥3:1; 0 green-on-plum text |
| State truth | Home, Shift, Earnings, Desk, Field and Pay with the B3 fixtures | The words match the domain functions; the badge mapping test passes |
| Access | Role × route × grant under the harness; inspectors opened by foreign id | Same 403/redirect as master; the RSC payload has no out-of-grant fields |
| Nav | Worker and org × 1024/1280/1440 | Exactly one `aria-current="page"` (or `"true"` for a parent section); a skip link; Tab order logged |
| Performance | `/`, `/dashboard`, `/shifts/[id]`, `/desk`, throttled to a mid-range phone | Within the B1 budgets (§8); Leaflet loaded only where a map shows |

## 7. Invariants every stage must keep (tests or checks)

- **Pay:** amounts, formulas and lifecycle states unchanged (pay tests).
- **Sharing:** "not shared" is never zero or ranked (applicants/scorecard tests). Political-fit answers appear only where the worker chose to share them, and only in the single-applicant view, never in tables, lists or inspectors (unchanged from today).
- **Access:** grants and role access unchanged (`lib/access`, nav tests). Hidden UI is never the only check.
- **Jurisdiction:** the hard stop is unchanged.
- **Field day:**
  - the append-only field day is unchanged;
  - check out stays disabled while a packet is out;
  - corrections are signed.
- **Sync:** the sync states are shown exactly as today (memory-only stays memory-only).
- **Time:** times follow the viewer's clock.

## 8. Risks

| Risk | Response |
|---|---|
| Template migration touches ~65 routes | Mechanical and reviewed per batch. Data loaders are untouched; only containers change |
| Drafts #75 and #91 overlap: both edit `field-day-data.ts`, `pay-data.ts` and `api-session.ts`; #91 bumps Next to 16.4.3 | The redesign edits none of those three files. New queries (overdue shifts) go in `desk-data.ts` or new files; the payout label change is in `lib/pay.ts` only. Whichever lands second rebases; no schema change |
| Fraunces adds a font file on every route | One variable file, `display: swap`. **B1** records a baseline and sets budgets on `/`, `/dashboard`, `/shifts/[id]` and `/desk`: LCP ≤2.5s, CLS ≤0.05, font bytes ≤120 KB on a throttled mid-range phone profile. Every later stage is checked against them |
| Photo licences | Public placeholders from a free-licence library with credits, swapped for the owner's photos before launch |

## 9. Owner choices (defaults applied unless the owner says otherwise)

1. The worker's first tab is labelled **Home** (dock), and the page title reads "Today".
2. Desktop worker nav adds **Earnings** as a fifth top-bar item. Phones keep four tabs, with Earnings under Profile.
3. Public hero placeholders: free-licence stock, labelled, until the owner's photos arrive.
4. **Light-mode primary card** (C1 round 2): eggplant with a *cream* action button (forest never sits on eggplant), against the brief's "one clear green action". An alternative is a cream card with an eggplant edge and the green action inside. Shown both ways at the Home pilot; the owner picks.
5. Whether to add `@playwright/test` as a dev dependency, so the §6.3 checks also run in CI. Default: no; the checks run from the pre-installed Playwright each stage, with saved results.
