# 01 — Home / discovery

**Route/source:** `/`, `src/app/page.tsx`, `HeroPage`, existing brand component. Signed-in Today is specified in 05; do not replace an urgent live shift with marketing.

**Order:** full-bleed authorized neighborhood/canvasser photograph → compact overlaid wordmark/location/notification controls where applicable → headline → supporting copy → forest action → small featured job card near the lower edge. The photograph should carry most of the first mobile screen, as in the reference. No large numbered how-it-works card before the featured content.

**Copy:** “Field work that matters.”; “Get paid to support the causes and campaigns you believe in.”; **Find Jobs**. “Featured near you” is conditional on real location-based selection; otherwise use **Available jobs**. Do not hardcode Denver or sample campaign names. Signed-out Find Jobs follows the existing authentication requirements and returns to discovery; no private job fetch bypass.

**Geometry/type:** 14px text inset; start pilot with a 600px image region at 390px, content-driven. Inter H1, white/cream text on a deliberately darkened photo overlay, 44px minimum CTA, compact white featured row. This height is a proposal, not a measured fact. At 1440, a broad photographic hero with bounded copy retains image dominance rather than stretching the phone card to screen width.

**Data/assets:** authorized brand photo with recorded provenance; eligible published job and exact pay helper for featured content. If no job is available, omit featured card; never seed a marketing job. Missing photo has a deliberate eggplant fallback preserving text contrast, not a broken image or generated pattern.

**States/evidence:** signed out, signed-in navigation behavior, available/no featured job, image failure, long headline at enlarged text. Capture 390/1440 light/dark; compare image occupancy, crop, headline wrapping, primary action and featured-card density. No phone frame in implementation.
