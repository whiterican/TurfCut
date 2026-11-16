# Compact empty Field activity panel

Implements Caden’s refinement brief while preserving the approved visual direction. Source `1341c55`. Only the no-turf dashboard state loses `overview-map`; real maps retain their fixed height. The empty state keeps its existing privacy copy and adds a link to `/field`. No loaders, permissions, data or shared theme tokens change.

Six actual local owner Desk captures at 390, 768 and 1440, light/dark: empty panel height is 198px on phone and 178px at larger widths. The prior map class measures 360/360/440px respectively. Those former heights come from a temporary CSS probe, not before screenshots. No page overflow or page runtime errors; link destination verified. Viewport screenshots retain the actual floating dock, so content below the viewport still requires scrolling. Navigation-clearance refinement is a separate task.

Fixtures reuse isolated local `turfcut_acc_st` and synthetic loopback auth from `../hiring-tablet-2026-11-08/auth-fixture.mjs`. No production services or mutation submissions. Real iPhone/Safari appearance is not established. Run the app on3020 with the isolated DB and auth URL on55521, then `PLAYWRIGHT_PATH=/path/to/playwright node docs/design/hero-board/evidence/compact-empty-field-2026-11-16/capture.mjs` from the repository root. Native Chromium is `/usr/bin/chromium`.

Validation: typecheck, page/harness ESLint, all 1,229 unit tests in 137 files, and diff checks passed. The first typecheck overlapped dev-server type generation and found missing generated files; after initialization the clean rerun passed.
