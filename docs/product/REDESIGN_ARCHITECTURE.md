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

### 2.0 Visual reference: the best of every set (owner, 27 Oct)
The owner named the **forest-dark set** as the strongest and asked for the best parts of the others too. The v4 brief stays the contract: "green is the primary-action colour, eggplant is the signature identity/navigation colour". The synthesis keeps both.

**The forest-dark set (primary)**

| Area | Taken | Not taken |
|---|---|---|
| Frame | A near-black deep-forest frame for the header, dock, desktop rail and phone shell (`--shell-*` tokens) | |
| Content | Cream content sheets carrying the work: lists, details, tables | |
| Public entry | The photo-led entry "Field work that matters." with a single white CTA | |
| Jobs list | Photo/tile thumbnails; pay as the second line; a save mark | |
| Job details | Image header, title + pay, organization with its verification mark, icon fact rows, a requirements checklist, one full-width green "Apply" | |
| My schedule | Upcoming / Past / Availability segments; day groups; status pills (Confirmed, Pending) with two quiet actions; a "Required actions" list | |
| Profile | Avatar, name and place; a menu of icon rows with a status word on the right | Ratings and stats |
| Desktop | Dark rail with the org switcher and user; a wide cream work area; tables with status pills; a map with a list panel on the right | KPI deltas, Rating column |

**The eggplant sets (images of 27 Oct)**

| Area | Taken | Not taken |
|---|---|---|
| Home / Today | The dominant cream "next shift" card with a map thumbnail and a green "View shift details →", then "Upcoming shifts" rows | |
| Messages | Segmented filter (All / Unread / Organizations); avatar rows with time on the right | |
| Notifications | Today / This week grouping; icon rows | |
| More menu | Help, safety, legal, compliance, about | |
| Shift details | Tab strip (Overview / Instructions / Requirements) over the record; a three-fact row (pay, type, setting) | |
| Field mode header | Big counts row (doors, conversations, time) for the live shift | Route map, "next address" |
| Earnings | A large paid figure; breakdown rows with icons and chevrons (paid, approved, waiting, disputed); "Recent payouts" with Paid pills | Bonuses; an unlabelled monthly "total earnings" |
| Identity | Eggplant as the identity colour: the brand mark, the **active nav tile** (dock and rail), selection and focus | |

**What eggplant does:** it marks *where you are and what's selected*. Forest marks *the one thing to do* and *live state*. The frame is near-black forest. This answers C3's risk of a green action on a green frame: the active tab is an eggplant tile, never green, and the action is the only saturated green on a screen.

**Content rules from every set still apply.** None of these are built:
- avg rating, rating columns or stars;
- "Background check", ID-verified rows, payment-card digits;
- bonuses;
- live worker dots, routes or "% complete";
- KPI deltas ("+12%"), audience stats ("10K+") or testimonials.

**Engineering:** the shell hue is a token family, so the frame can move between forest and eggplant without touching components.

### 2.1 Visual
- **Palette.** Per §2.0, the shell is deep forest (`--shell-*` tokens, new); cream sheets and the forest action already exist in G1. The other G1 tokens already match the brief: paper `#EFEAE1`, cream `#FBF7F0`, eggplant `#281539`/`#3A2154`/`#4A3365`, forest action `#164B38` and the soft-green cut `#82BC9B`. There is no palette rewrite and no lime.
- **Modes.** Light, Dark and Sunlight are all first-class. By night the *one primary object* is cream with ink type (the v4 hybrid). Secondary surfaces stay plum. Chat bubbles stay eggplant.
- **Type.**

  | Role | Face | Where |
  |---|---|---|
  | Display | Fraunces | Page titles, primary-object headlines, section titles, the public hero |
  | Workhorse | Barlow | Everything else: names on cards, data, labels, forms |
  | Labels | Barlow Condensed | Eyebrows and dock labels |
  | Figures | DM Mono | Money, counts, IDs (packets, receipts) |

- **Colour roles (§2.0).**
  - Forest marks the one primary action and live state.
  - Eggplant marks identity, the active nav tile, selection and focus.
  - The near-black forest frame is the shell.
  - Status pills always carry words.
- **Signature details.** The folded corner (`--cut`) appears on primary objects only.

### 2.2 Information architecture
- **Worker dock (R1, four tabs):**
  - **Home** = Today plus the campaign feed.
  - **Jobs** = Find work plus My schedule.
  - **Messages**.
  - **Profile**, which holds Earnings, Availability, Credentials, Sharing and Settings.
- **Worker desktop:** the same four sections in the top bar, plus a direct Earnings entry.
- **Organization:** the rail on desktop. On phones the dock is Desk, Hiring, Field, Messages and More. Grants decide what shows, unchanged (`lib/access`, `lib/nav`).
- **Staff admin:** the organization shell with the Admin section and its sub-nav.
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
| Dock collisions (P0-1) | **Measured.** Fully hidden behind the dock: "Continue" on `/welcome` at 320 and at 200% text; the focused toggle on Availability at 320. Focus 97% hidden: "Sheets returned" on the shift page at 390. A field under the dock with the keyboard open on 6 forms | A shell-level **dock contract** (§4.2.3), not per-page fixes. A prototype measured fully hidden 2→0, partly hidden ~30→2, keyboard collisions 10→0 |
| Header at 200% text | 458px wide at 390 → 149 of 154 pages scroll sideways | Pixel-bounded icon buttons and wordmark in the shell |
| Worker desktop nav (P0-2) | Exists (`TopNav`, ≥1024, `aria-current`). The earlier "missing" claim came from a preview artefact | Keep. Make it more visible; add Earnings |
| Contrast (P0-3) | 0 WCAG failures across 1,656 text runs (5 pages × 3 modes × 2 widths); dark mode 49–64% plum at 390 | Legibility is fine; the problem is monotony → the cream primary object by night (done in E1) |
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
2. **Type scale.**

   | Role | Size, phone → desktop | Face and weight |
   |---|---|---|
   | `display` (public hero) | | Fraunces |
   | `title` (page) | 2rem → 2.75rem | Fraunces 600 |
   | `headline` (primary object) | 1.5rem → 2.125rem | Fraunces 600 |
   | `section` | 1.25rem → 1.375rem | Fraunces 600 |
   | `body`, `small`, `label`, `figure` | | Barlow / DM Mono |

   Utility classes only. No component chooses a font directly.
3. **Status vocabulary.** One `StatusBadge` with fixed states. Each state has a word, a glyph shape (filled, ring, dashed, square) and a colour, so no two look alike in any mode:

   | State | Meaning |
   |---|---|
   | `live` | |
   | `paid` | |
   | `approved` | Approved, not yet paid |
   | `pending` | |
   | `blocked` | |
   | `disputed` | |
   | `not-shared` | |
   | `draft` | |
   | `closed` | |

   It replaces the ad-hoc `badge-*` uses (9 files) over time. Later field states (`visited`, `not home`, `refused`) slot in as new states, not new components.
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
  - ≥1024: a rail (with org name and approval state) plus the main area, with an optional inspector column.
  - <1024: the org dock.
  - Width: up to `--workspace-max` (90rem), instead of today's `max-w-6xl`.
- **Admin shell.** The organization shell with the Admin sub-nav kept as is.
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

Each template owns, so a page can't get them wrong:
- gutters;
- bottom clearance;
- the heading slot (`Masthead`);
- skeleton parity (`PageSkeleton` takes the template name).

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
| `Inspector` | none | **New.** A side panel at ≥1024 that is a route segment, so deep links and Back work. On phones it is the detail route |
| `StatusBadge` | `badge-*`, `.st` in studies | **New** (§4.1.3) |
| `FactList` / `KeyValue` | `.fact-list`, `Row`, `.kv` | **Merge** into one with icon support |
| `Stat` / `Figure` | `.stat`, `LiveFigure` | **Keep**, plus `MathDisclosure` ("how this was worked out": the existing pay formula strings) |
| `FilterBar` / `Segmented` | chips, `JobsSwitch` | **Generalise** `JobsSwitch` into `Segmented` (links with `aria-current`); chips into a `FilterBar` |
| `ActionBar` | none (field actions are in flow) | **New**, for `FieldPage`. Dock-aware, never covers content (it reserves its own height) |
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
   - The org rail's **Field** section can hold "Territories" and "Walkbooks" entries behind grants. Grant areas come from `lib/access`, so new areas are added there, not in a parallel system.
   - The worker shift record can link to a future "Field mode" from the same `PrimaryObject` action.
5. **Offline-first rows.** `ListRow` and `ActionBar` show the existing sync states (sent / on this phone / memory only / refused) from the M6 queue, so visit entries can reuse them.
6. **Privacy defaults in components.**
   - `NotSharedChip` semantics are kept.
   - `MapPanel` has no "live position" layer type at all; it would need a separately approved design.

---

## 5. Screen map (route → template → primary object)

### Worker

| Route | Template | Primary object | Notes |
|---|---|---|---|
| `/dashboard` (Home) | `ListPage` plus right rail ≥1024 | The live or next shift. When a shift is checked in and past its end, say so, with "Open shift to check out" | Then: coming up; open near you (`ListRow`); campaigns strip; choices (sharing / political-fit) as rows, not cards |
| `/jobs` (Find work) | `ListPage` + `FilterBar` + `Segmented` | none (scan) | ≥1280: list plus a preview inspector of the selected job |
| `/jobs/[id]` | `RecordPage` | Pay and when, with the Apply/Claim action | Aside: apply panel, requirements status, rules version, "What this organizer sees" link |
| `/shifts` (My schedule) | `ListPage` + `Segmented` | the next shift | Day-grouped `ListRow`s |
| `/shifts/[id]` | `FieldPage` | Shift status (on shift / due to end / ended), counts, packet custody | `ActionBar`: log, packet return/keep, break, check out (disabled with the reason while a packet is out). Timeline. Brief, Sunlight and map in the aside |
| `/earnings` | `RecordPage` | "Where your pay is": paid / disputed / approved-not-sent / awaiting, each with words and a figure. The existing `PayoutSetup` action sits beside approved-not-sent when it blocks | Per-line `MathDisclosure`. ≥1024: table |
| `/profile`, `/profile/*`, `/settings` | `ReadingPage` | none | Icon `ListRow` menu (mockup style), real items only |
| `/messages`, `/messages/[id]` | `ListDetailPage` | | ≥1024: list plus thread side by side |
| `/notifications`, `/feed` | `ListPage` | | |

### Organization

| Route | Template | Primary object | Notes |
|---|---|---|---|
| `/desk` | `WorkspacePage` + `Inspector` | "In the field": shifts live now and shifts still open after their end (from `ACTIVE`) | Needs-you table (PR #98) gains a selected row to inspector. Fixes P0-5 |
| `/hiring`, `/hiring/[job]/*` | `ListDetailPage` | | Jobs table to inspector (people and what each shares). Applicants: `DataTable` (phone: rows) |
| `/jobs` (org), `/jobs/new`, `/jobs/[id]/edit` | `WorkspacePage` / `ReadingPage` (steps) | | Job create stays 6 steps with no autosave (E5); only layout changes |
| `/field`, `/field/*` | `WorkspacePage` + `MapPanel` | | Map plus shift list; packet review |
| `/pay`, `/pay/*` | `WorkspacePage` + `Inspector` | | Dense table; dispute inspector |
| `/org/*`, `/campaigns/*` | `ReadingPage` / `ListPage` | | |
| `/admin/*` | `WorkspacePage` + `Inspector` | | Audit and jurisdiction workflows; reason and evidence visible |

### Public

| Route | Template | Notes |
|---|---|---|
| `/` | `HeroPage` | "Field work that matters." Worker-led, photo hero (placeholder). Organizer section "The work behind every campaign." below. Evidence-over-ratings proof row |
| `/login`, `/signup`, `/welcome` | `HeroPage` (split) | Never fields over a photo. Validation, recovery and keyboard states covered |
| `/c/...` | `RecordPage` | |

---

## 6. Build sequence (owner's order)

Each stage is a set of small commits on `redesign`. At the end of each stage:
- typecheck and tests;
- an independent reviewer pass (CLAUDE.md rule 9);
- before/after screenshots at 390 and 1440 × light/dark/Sunlight, sent to the owner.

Nothing merges without the owner's word.

| Stage | Contents | Files (main) | Done when |
|---|---|---|---|
| **B1 Foundation** | Role tokens; type utilities; `StatusBadge`; shells (header bounds, dock contract, safe area, worker desktop nav with Earnings, org workspace width) | `globals.css`, `layout.tsx`, `AppNav.tsx`, `lib/nav.ts`, new `components/status/`, `zz`-free tests | Dock/keyboard/overflow scripts pass (§4.2.3); token tests pass; screens visibly re-skinned |
| **B2 Layouts** | Templates (§4.2.2); every route moved off hand-set widths onto a template; `PageSkeleton` follows the template | new `components/layout/*`, all `page.tsx` (mechanical), `loading.tsx` | No `page max-w-*` left; 1280/1440 show multi-zone layouts for desk, hiring, jobs, messages, earnings, shift; route-skeleton test updated |
| **B3 Core workflows** | Primary objects and screen content per §5, in this order:<br>1. Today<br>2. Find work and Job<br>3. Schedule and Shift (`FieldPage`, `ActionBar`)<br>4. Earnings<br>5. Desk (in-the-field truth)<br>6. Hiring and applicants (`DataTable` + `Inspector`)<br>7. Messages<br>8. Profile<br>9. Public landing and sign-in<br>10. Pay, field, admin | the routes' `page.tsx` + new components (§4.3) | Each workflow's states (empty, busy, blocked, overdue, offline, Sunlight) captured; invariants tested (pay figures, requirements, sync, roles) |
| **B4 Visual polish** | Photography (public), type tiles, empty-state art, motion review, final status colours | assets, `globals.css` | Owner sees the full set; C1-style design review |
| **B5 Regression** | Full capture matrix (routes × roles × 320/390/768/1280/1440 × 3 modes); P0 scripts as checks; accessibility pass; role and grant matrix | `scratchpad` scripts → `scripts/visual/` if approved | Every route valid; 0 P0 regressions; reviewers READY |

**Stash on hold:** prototypes of the dock contract and the review fixes for R1/E1. These were measured working and fold into B1.

---

## 7. Invariants every stage must keep (tests or checks)

- **Pay:** amounts, formulas and lifecycle states unchanged (pay tests).
- **Sharing:** "not shared" is never zero or ranked (applicants/scorecard tests). No political answers in org views.
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
| Drafts #75 and #91 overlap pay/schema | No pay/schema code is edited; C2 confirms |
| Fraunces adds a font file on every route | One variable file, `display: swap`; measure LCP before/after in B5 |
| Photo licences | Public placeholders from a free-licence library with credits, swapped for the owner's photos before launch |

## 9. Owner choices (defaults applied unless the owner says otherwise)

1. The worker's first tab is labelled **Home** (dock), and the page title reads "Today".
2. Desktop worker nav adds **Earnings** as a fifth top-bar item. Phones keep four tabs, with Earnings under Profile.
3. Public hero placeholders: free-licence stock, labelled, until the owner's photos arrive.
