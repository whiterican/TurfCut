# 11 — Field Map

**Routes/source:** organization `/field` and `/field/[date]` currently render `FieldBoard` lists; worker `/shifts/turf` has `TurfMap`/`TurfWorkbench`. Reuse `readTurf`, field-day loaders, existing map marks and Leaflet; do not pretend a full territory inventory already exists.

**Order:** date/job/authorized-turf filters → large geographic map → right-hand selected/listed turf context. Polygon color distinguishes records/status with a written legend. Pictured numbered markers must represent actual scoped records or defined clusters, not tracked people. Keep OpenStreetMap attribution. Map controls are 44px targets with accessible names.

**Geometry:** 1440px desktop workspace with roughly 300px right panel, 20px gap and map filling the remaining available region; bounded by actual app chrome, not a decorative browser frame. On phones, 320px minimum useful map height, filters wrap deliberately, list/detail below or a usable sheet. Keep text/list alternative usable if map tiles fail/offline.

**Data/boundaries:** job, shift, assigned polygon, staging point and manually recorded marks retain organization/worker ownership. The existing single-map component may need a reviewed multi-polygon view model; this is projection work, not automatic authorization for new territory entities or API/grant changes. Server filter scope and displayed labels must agree. Never infer completion denominators from pins, area or aggregate doors.

**Copy:** **Field Map**, **All jobs** when supported by actual selection; list shows actual job/turf label and assignment/status. **No assigned turf to show.**; **Map tiles couldn’t load. Your shift details are still available.** only when the fallback really remains usable. Do not say live tracking or show percent complete without real model support.

**Acceptance:** one/multiple authorized polygons, empty, invalid/missing geometry, tile failure, worker/other-organization isolation, filter change, selected polygon/list row parity, readable light/dark legend. Verify map resize when sidebar or viewport changes and prevent viewport overflow; preserve safe tooltip text handling.
