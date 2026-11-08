# Hiring slice 2: publishing groups on the job page

Captured at `46bb022` (`redesign/hiring-job-page`). Its app code is the same as `d8335c4`, the last code change; the commit after it changes a test only. These are the running app's own job pages on the local test database: real fixtures, real roles, nothing synthetic. Each state is shown at 390 and 1440, light and dark, as a full page plus a light viewport scrolled to Publishing. Full-height captures draw the fixed dock at the page's end. `manifest.json` records, before any screenshot, each group's title, reasons, link and note, the Publish button's state, whether Edit draft shows, the all-clear line (null while anything blocks), horizontal overflow and console errors.

| State | Who | Job | Matches frame (#126) |
| :--- | :--- | :--- | :--- |
| `job-and-counsel-owner` | Owner (edit + settings) | Aurora draft: Boulder profile never approved; contacts and disclosure missing | `publishing-blocked`, without the settings group: this organization is approved and signed |
| `job-and-counsel-finance` | Finance (settings read, no job edit) | Same draft | `publishing-restricted`: reasons, no Publish or Edit draft |
| `settings-owner2` | Owner of Second Pass Org | Its only draft: organization not approved, terms unsigned, classification not reviewed | `publishing-blocked`'s settings group, with the link |

What the manifest shows, in every capture:

- No horizontal overflow at 390. At 1440 the page's own scrollbar makes `over` read −15.
- No console errors.
- Publish shows and is disabled for the owners. For Finance neither Publish nor Edit draft shows.
- The settings link shows for Second Pass Org's owner. No settings group appears for Pass Test Org, which is approved and signed.
- Every "In this job" reason carries its step label (`Step 5 · Campaign disclosure`).
- The counsel group carries "Turfcut staff approve rule profiles."

Not captured:

- **Every check passing.** No local draft passes every check, and that branch of the page is unchanged code.
- **A viewer with neither settings nor edit access.** Every default role can read settings, so only a custom role reaches this case. The component hides the link when `canReadSettings` is false; the unit tests cover the grouping.
- **A paused job.** None is in the fixtures. It takes the same path as a draft.

**One change from PLAN §2's table, after review.** The table put every rule-profile problem under "With counsel". Two of them are fixed by the organization in step 1, not by counsel: an unknown profile ("Pick an approved jurisdiction") and a superseded one ("the organization has to file the job under the current rules"). Under counsel, the second sat right beside "Turfcut staff approve rule profiles.", which contradicts it. Both now sit under "In this job" with "Step 1 · The work". So does a state that doesn't match its profile ("Pick a CO profile"). Approval, effective date, expiry and missing compensation rules stay with counsel. The words are unchanged.

The Aurora draft still lists both "hasn't been approved" and "superseded" for one never-approved profile. That is PLAN question 7, a separately reviewed behaviour change, and is unchanged here. They now appear in different groups.

Rerun: start the local stack, then `node capture.mjs <outDir> <commit>` (uses the session's Playwright and storage states).
