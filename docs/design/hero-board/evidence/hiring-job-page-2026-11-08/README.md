# Hiring slice 2: publishing groups on the job page

Captured at `ec80553`, the PR head with every code change. These are the running app's own job pages on the local test database: real roles and the existing fixtures, plus three local fixtures described below. Each state is shown at 390 and 1440, light and dark, as a full page plus a light viewport scrolled to Publishing. Full-height captures draw the fixed dock at the page's end. `manifest.json` records, before any screenshot, each group's title, reasons, link and note, the Publish button's state, whether Edit draft shows, the all-clear line (null while anything blocks), horizontal overflow and console errors.

| State | Who | Job | Matches frame (#126) |
| :--- | :--- | :--- | :--- |
| `job-and-counsel-owner` | Owner (edit + settings) | Aurora draft: Boulder profile never approved; contacts and disclosure missing | `publishing-blocked`, without the settings group: this organization is approved and signed |
| `job-and-counsel-finance` | Finance (settings read, no job edit) | Same draft | `publishing-restricted`: reasons, no Publish or Edit draft |
| `settings-owner2` | Owner of Second Pass Org | Its only draft: organization not approved, terms unsigned, classification not reviewed | `publishing-blocked`'s settings group, with the link |
| `clear-owner` | Owner | A local draft given the published fixture job's publishable fields: every check passes | `publishing-clear`: "Every check passes…", Publish enabled, Edit draft |
| `paused-owner` | Owner | A local job set to paused, contacts removed: one job blocker | Publish disabled; the page's existing "Edit job" button above the section stays reachable |
| `settings-custom-role` | The Finance user given a **custom role** (desk full, jobs read, jobsEdit full, **no orgSettings**), organization terms unsigned for that run only | Aurora draft | `publishing-restricted`'s case: all three groups, the settings group **without** its link; Publish and Edit draft show, since the role can edit jobs |

What the manifest shows, in every capture:

- No horizontal overflow at 390. At 1440 the page's own scrollbar makes `over` read −15.
- No console errors.
- Publish shows and is disabled for the owners. For Finance neither Publish nor Edit draft shows.
- The settings link shows for Second Pass Org's owner. No settings group appears for Pass Test Org, which is approved and signed.
- Every "In this job" reason carries its step label (`Step 5 · Campaign disclosure`).
- The counsel group carries "Turfcut staff approve rule profiles."

The last three states use local fixtures made for this evidence in the local test database only. Two spare drafts took the published fixture job's publishable fields. For the custom-role run, the Finance user's profile was switched to the custom role and the organization's contractor terms unsigned, both restored straight after and checked. That run's manifest is `manifest-custom-role.json`; everything else is in `manifest.json`.

**One change from PLAN §2's table, after review.** The table put every rule-profile problem under "With counsel". Two of them are fixed by the organization in step 1, not by counsel: an unknown profile ("Pick an approved jurisdiction") and a superseded one ("the organization has to file the job under the current rules"). Under counsel, the second sat right beside "Turfcut staff approve rule profiles.", which contradicts it. Both now sit under "In this job" with "Step 1 · The work". So does a state that doesn't match its profile ("Pick a CO profile"). Approval, effective date, expiry and missing compensation rules stay with counsel. The words are unchanged.

The Aurora draft still lists both "hasn't been approved" and "superseded" for one never-approved profile. That is PLAN question 7, a separately reviewed behaviour change, and is unchanged here. They now appear in different groups.

Rerun: start the local stack, then `node capture.mjs <outDir> <commit>` (uses the session's Playwright and storage states).
