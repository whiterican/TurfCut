# Builder selections: local browser evidence

Implementation commit: `1e508a6`. Board: [#128](https://github.com/whiterican/TurfCut/issues/128).

The native selects retain their existing words, values, labels and validation attributes. When the selected option is wider than the available text area, a wrapping copy appears below the select using the existing text-hint style. It is aria-hidden because the native option already exposes the full text. Short selections have no caption. A conservative 24px allowance covers the native picker arrow.

These screenshots render the actual JobForm, ReadingPage and Masthead in the running Next app. They use synthetic local defaults and an ignored preview route, without a database, authentication or autosave. The root header is signed out; these do not claim authenticated organization rail/dock or end-to-end save/permission coverage. No backend behavior changed.

## Reproduce

Install the locked app dependencies, generate Prisma Client, and create `src/app/zz-preview/readable-selects/page.tsx` with the fixture below (never commit that route). Start `npm run dev -- --hostname 0.0.0.0 --port 3018`. With an existing external Playwright installation, run:

`PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/builder-readable-selects-2026-11-08/capture.mjs`

Chromium defaults to `/usr/bin/chromium`; override with `CHROMIUM_PATH`. Override the local URL with `PREVIEW_URL`. This adds no app dependency.

The script records viewport and full-page images at 320×844, 390×844 and 1440×900 in light and dark. It measures the actual longest option with loaded Inter, checks wrapping/page overflow, native keyboard changes, FormData, short-value caption removal and native form reset. It also simulates an empty computed font shorthand at 320px and clicks a real reset button added only to the local fixture. The font simulation verifies the fallback path in Chromium; it does not claim Firefox coverage. The manifest names the implementation commit and discloses the fixture.

## Local-only fixture

```tsx
import { JobForm } from "@/components/JobForm";
import { ReadingPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
const jurisdictionId = "00000000-0000-0000-0000-000000000021";
export default function Preview() {
  return <ReadingPage org head={<Masthead title="Edit draft" />}>
    <p className="text-hint">Local synthetic fixture · no database · autosave disabled</p>
    <JobForm jobId="local-select-fixture" autosave={false} jurisdictions={[{id: jurisdictionId, label: "Synthetic local jurisdiction", problems: []}]} defaults={{
      title: "Local select test", type: "PETITION", jurisdictionId,
      startsAt: "2026-12-01", endsAt: "2026-12-02", city: "Denver", state: "CO", launchMode: "SELF",
      compensationMethod: "HOURLY", payRate: "25", headcount: "1", hiringModes: ["application"],
      contactEmergency: "Local fixture", contactDisputes: "Local fixture", contactLostMaterials: "Local fixture",
      affiliation: "nonpartisan", message: "Synthetic disclosure for local testing.",
      campaignType: "nonpartisan_civic", canvassApp: ""
    }} />
  </ReadingPage>;
}
```
