# Tablet pass: every route outside the hiring family

The app-wide tablet pass Caden asked for. The hiring routes were audited separately by Codex in #134; this covers everything else. [Board claim](https://github.com/whiterican/TurfCut/issues/128).

## How it was run

`audit.mjs` loads each route as its real role on the local test database: a worker (Jordan), an organization owner, Turfcut staff, or signed out. It starts at 768×1024 portrait, then resizes to 1024×768 landscape without reloading, like a rotation. It runs once in light and once in dark. At each size it records, before any screenshot:

- horizontal overflow (`over`; −15 at 1024 is the page's own scrollbar);
- any element past the right edge that no ancestor scrolls or clips;
- whether the bottom dock or the organization rail shows;
- the main column's width;
- every visible native select whose chosen option is wider than its text box (24px allowance for the arrow, as in #130);
- console and page errors.

This is Chromium with touch enabled, at DPR 1. It is not a real iPad, Safari, the on-screen keyboard or split-screen.

- **`baseline/`:** 46 routes × 2 sizes × 2 themes = 184 measured states on master `ea9f5d8`, with a light screenshot at each size (92) and `manifest.json`. `w-header-1024.png` and `w-header-1280.png` show the worker header at both widths.
- **`after/`:** the Field map and its review queue recaptured at `d00546c`, the commit with the fix.

## Results

**No route overflows sideways at either size, in either theme.** Nothing sits past the right edge. The organization rail appears at 1024 and the dock at 768, as designed. The only console errors are on the worker's shift page, which returns 404 because the fixture shift isn't Jordan's; that's a fixture limit, not a layout fault.

### Fixed in this PR

**The Field map's job filter** (`src/app/globals.css`, `.map-controls`). From `lg` the field strip is a row and the live figures take the room, so at 1024 the select shrank to about 84px and showed "All jo…". Two changes fix it:
- the select has a 12rem floor from `lg`;
- the controls form no longer shrinks from `lg`, so Show stays beside the select and the figures wrap instead.

| Width | Before | After |
| :--- | :--- | :--- |
| 1024 | Select 84px, "All jobs" clipped | Select 192px, whole; Show beside it |
| 390 | Not affected (rules apply from `lg`) | Select 292px, unchanged, no overflow |
| 1440 | Unchanged | Select 192px, Show beside it, no overflow |

### For Astra and Caden: the worker header at 1024–1279

Between 1024 and 1279 the worker's eight top-bar destinations show as icons only (`AppNav.tsx`, `TopNav`). That was a deliberate #113 review call: the names stay as the links' accessible names and as tooltips, and the labels appear from 1280. It's the right trade-off on a laptop, but iPad landscape (1024, 1180, 1194) falls inside that band, and on a touchscreen:

- **Tooltips never show,** so the eight icons are unnamed to a sighted user.
- **Two of them look alike.** "Jobs" and "Work" are both briefcases (`w-header-1024.png`).
- **Turfcut staff get the same header** on admin pages.

Two options, both without changing the desktop decision for a mouse:

1. **Touch tablets keep the labelled bottom dock up to 1279.** Under `(hover: none) and (pointer: coarse)` the worker header nav hides and the dock (which has labels) stays, as it does at 768. Mouse and trackpad users still get the #113 icon bar.
2. **Labels under the icons from 1024 to 1279.** Small stacked labels (about 11px), on every pointer type. Eight items fit in roughly 670px, but this changes the desktop look the #113 review settled.

I'd take option 1, since it's the narrower change and keeps #113 intact for mice. It's a design call, so this PR doesn't build either one.

## Not covered

- **Hiring routes:** in #134.
- **Detail pages with no local fixture:** a campaign's public page and post, a receipt, a pay or worker dispute, a statement period.
- **The worker's own shift page:** 404 for this worker.
- **Real devices:** native iPad, Safari, the on-screen keyboard, split-screen and safe-area insets.

Rerun: start the local stack, then `node audit.mjs <outDir> <commit> [slug filter]`. It uses the session's Playwright and storage states.
