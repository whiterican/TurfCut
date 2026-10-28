# Typography + Compact Floating Dock — design decision memo
**Recommendation: A/B test rather than switching fonts sight unseen.**

## Current facts from code
`src/app/layout.tsx` loads **Barlow** (400/500/600/700), **Barlow Condensed** (600/700), **DM Mono** (400/500). `src/app/globals.css` uses Barlow for UI, condensed for eyebrows and dock labels, mono as audit font. The current dock was reduced in #99 to max 370px; targets min 44px; bar is surfaced on mobile, hides on downward scroll with focus/accessibility exceptions.

## Test 1 / restrained operational identity (preferred candidate)
- **Public Sans**: work interface body, tabs, tables and forms. Design target: 15–16px main body, 13px row metadata, 11–12px small factual label, 20–24px sections, 30–36px main page headings. Tab labels 10–11px but never unreadable; achieve width through considered icon/label spacing rather than condensing every word.
- **Newsreader**: selected public landing hero `Field work that matters.` and perhaps one editorial public feature area. Do NOT turn shift/job form and manager table headings into serif.
- **DM Mono**: occasional verified payout or precise audit amounts; tabular numerals in the UI should be available even when not using mono.
- Maintain accessible visible keyboard focus, text scaling and type labels. Test actual font rendering in browser; the offline illustration package uses different renderers as layout surrogate only.

## Test 2 / minimal risk
- Retain Barlow body and DM Mono.
- **Reduce Barlow Condensed exposure** (use only rare genuine kicker label and noncritical decorations), reduce uppercase and overtracking.
- Normalize hierarchical spacing and badge density; no component-driven decorative title system. Public landing may try Newsreader only.

## Dock source of truth and dimensions
- WORKER tabs: `Today / Feed / Work / Shifts / Messages / Profile` (six) in that order, from `nav.ts:WORKER_TABS`.
- Org owner tabs: `Desk / Hiring / Field / Messages / More` (five). More: `Jobs / Pay / Credentials / Campaigns / Members / Settings` filtered via access map. Other roles use `PHONE_PICKS`; desktop uses all permitted rail areas.
- Ref proposal: **348px max dock width**; width `calc(100vw - 32px)`; bottom `calc(10px + env(safe-area-inset-bottom))`; min tab height **48px** (absolute accessibility minimum **44px**); 17px line icons; 9–11px labels; 4–5px frame padding; active eggplant tile with cream icon and label. Role-specific More native modal is not a replacement for missing worker tabs.
- Verify 320 and 390px plus touch targets, Dynamic Type/zoom, keyboard, safe-area bottom, reduced-motion and scroll tucking. In chat composer focus, dock must not cover the input. Never hide required navigation just to achieve aesthetic symmetry.

**Keep forest-green primary CTA and live state, deep eggplant navigation/identity, warm paper cards, real dark mode and Sunlight mode.** Do not reintroduce lime or give green to every positive status.
