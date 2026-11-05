# Summary-band and tile figures on one line (#125, 2026-11-05)

Captures for the `white-space: nowrap` rule on `.summary-band dd` and `.stat-tile-figure`, at `8e6c3b11cb709ffbe446bd8f9ddd3c8a23d80503` (the PR's code; the capturing tree differed only in docs). Local dev server, local test database, light theme, DPR 2, America/Denver. `manifest.json` lists each capture with, for every figure on the page, its text, how many lines it takes and whether it is clipped (`scrollWidth > clientWidth`), plus horizontal overflow and console errors.

Every figure is one line and none is clipped; no page overflows; no console errors.

| Capture | Where | Width | Text size |
| --- | --- | --- | --- |
| `field-390`, `field-320` | Field: the band with "0 / 0 on the ground" | 390, 320 | default |
| `field-390-large-text`, `field-320-large-text` | same | 390, 320 | the largest setting (XL, 125%) |
| `desk-390`, `desk-320`, `*-large-text` | Desk: the "0 / 0 Checked in" tile in the two-column grid | 390, 320 | default, XL |
| `hiring-320`, `pay-320`, `earnings-320`, `admin-320`, `*-large-text` | The other users of `.summary-band` | 320 | default, XL |

Notes:

- The figure text in `manifest.json` reads "0 0" for a live figure: `innerText` includes the live region's spoken copy beside the visible digits (`CountUp`). The visible figure is one number.
- The values are what the fixtures hold ($0.10, $0.14, counts of 0 to 2). No larger value exists in the test database, so a long money figure is not captured here; `money()` never contained a breakable space, so the rule changes nothing for it.
- **Seen, outside this diff:** at 320px with XL text the Desk tile *labels* ("Signatures submitted", "Shifts under way") break inside words (`desk-320-large-text.png`). The figures above them stay on one line and are not clipped. The labels' wrapping is not changed by this PR; it is reported on the PR for a decision.
