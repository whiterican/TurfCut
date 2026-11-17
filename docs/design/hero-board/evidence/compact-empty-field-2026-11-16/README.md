# Compact empty Field activity panel

When an organization has no assigned turf, the Desk's Field activity panel no longer
holds the map's full height (`.overview-map` in `globals.css`: 360px, and 440px from
1280px up). It is the shared `EmptyState`, the same as every other empty page:

- a new `turf` drawing: a folded map with a dashed turf outline and **no pin**, because
  the field map never shows anyone's position;
- the existing privacy sentence, unchanged;
- an "Open Field" link to `/field`;
- card corners (24px), level with the need tiles beside it, since it takes the map's slot.

The map key ("Assigned turf", "Workers checked in") shows only when there is a map.
With turf, the code path is the same as before (the map, the same aside label and key);
that state is **not captured here**.

Started by Codex (`1341c55`, `b12070e`); finished by Claude after Caden reassigned it,
at `103000a`.

## Measured (`manifest.json`)

Panel height 298px at 390 and 278px at 768 and 1440, light and dark, against the map box's
360px / 360px / 440px at the same widths (`formerMapHeight`, a temporary `.overview-map` probe
in the same grid; not a before screenshot). No page overflow, no page errors, no map key,
link to `/field`. The screenshots are the Field activity section only. The script refuses to
run while `src/` has uncommitted changes, so the manifest's commit is the code shown.

## How it was captured

Real `/desk` route. The database setup is not recorded by the script: a local Postgres
built like the acceptance databases (shim, setup SQL, base seed) plus one OWNER profile
with the fixture's user id, on the seed's organization, and the local-only auth
fixture `../hiring-tablet-2026-11-08/auth-fixture.mjs` on port 55521. No production
services. Real iPhone and Safari appearance is not established.

1. Start the auth fixture: `node docs/design/hero-board/evidence/hiring-tablet-2026-11-08/auth-fixture.mjs`.
2. Start the app on port 3020 with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55521` and
   `DATABASE_URL` / `DIRECT_URL` pointing at the local database.
3. From the repository root: `PLAYWRIGHT_PATH=<playwright module> node docs/design/hero-board/evidence/compact-empty-field-2026-11-16/capture.mjs`.
   It uses Playwright's own Chromium.
