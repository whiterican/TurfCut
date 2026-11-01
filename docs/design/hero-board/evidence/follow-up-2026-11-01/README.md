# Redesign follow-up evidence (2026-11-01, #115)

Every capture is from commit `c327982`, with a clean tree (`manifest.json` → `source.clean: true`).
Each one is at DPR 2, at widths 390 and 1440, in light and dark.
The clock is frozen at 2026-10-30T19:00:00Z, in America/Denver.
Every capture has zero horizontal overflow.

The fixtures are synthetic and live only in the local preview database. They are the same ones described in `../b2-members-field-2026-11-01/README.md`, plus three credentials for Alex Rivera: a self-reported CO circulator registration, a training certificate verified by this organization from the original document, and an expired self-reported notary status.

| Capture | Who | What it shows |
| --- | --- | --- |
| `noaccess-no-access-notice-*` | Door captain | The page they land on after a guard turned them away. It is captured with the flag already set, because the preview harness can't follow the last unprefixed redirect hop. The notice sits above the heading, on the page's measure; beside the rail it is left-aligned. |
| `field-two-two-jobs-*` | Owner | On a phone, the figure definitions sit behind "What these mean", so the map starts higher. From 1024 up they stay beside the figures. |
| `landing-signed-out-*` | Signed out | Find jobs spans the content on a phone and sizes to its label from 640 up. |
| `pay-populated-*`, `pay-ready-ready-to-pay-*` | Owner | One summary band, with each figure stating its time ("… now", "paid in the last 30 days"). The queue chips match the job feed. The Ready to pay queue shows a real item, and the payout can't be sent until the worker finishes Stripe setup. |
| `credentials-populated-*` | Owner | One list with a row per hired worker, each showing that worker's credentials. "Record a check" appears beside the self-reported credential that hasn't expired. The 390 captures are full page, so the floating dock appears partway down. |
| `field-error-error-*` | Owner, database stopped | The last-resort `global-error` page on the token values. It is light or dark by the system setting (`prefers-color-scheme`), because it runs without the app's theme script. |
