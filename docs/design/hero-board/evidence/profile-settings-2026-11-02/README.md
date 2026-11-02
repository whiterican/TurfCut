# Profile, Settings and Who sees what (#121, 2026-11-02)

This is the profile and settings family built from the plan in `../../mockups/profile-settings-2026-11-02/PLAN.md`.

Every capture is listed in `manifest.json` with its commit (clean tree), route, role, width and theme. Captures are full page at DPR 2 in America/Denver. None has horizontal overflow or console errors (the realtime socket of the local auth stand-in is ignored).

## Fixtures

The data is synthetic and exists only in a local test database, built during the functional pass through the app's own forms.

| Who | State |
| --- | --- |
| Jordan Blake (worker) | Findable, with a home area Turfcut can't place ("Capitol Hil"), saved through the Who sees what form. Political-fit consent needs reconfirming. Verified shifts, with pay not yet sent, which blocks closing the account. |
| Alex Rivera (worker) | Seeded worker. Sharing never saved (the defaults), so Profile shows "Choose who sees what". |
| Pass Test Org owner, staff | Signed up through the forms. Staff status was set by SQL, as for every staff member. |

The doors-per-hour rates on Jordan's work record come from test shifts tens of seconds long. They aren't representative; see question 3 in the plan.

## Captures

| Capture | What it shows |
| --- | --- |
| `profile-findable-unplaced-reconfirm-*` | The menu with real statuses, Political fit "Needs reconfirming" in danger. The home-area warning under the menu, linking to Who sees what. The work record unchanged. Experience behind "Add a campaign". Light and dark at 390; light at 1440 with the side nav. |
| `profile-add-campaign-open-390-light` | The existing ExperienceForm, opened from its button. |
| `profile-defaults-first-visit-390-light` | Sharing never saved: "Who sees what · Defaults" and the "Choose who sees what" card. |
| `settings-worker-close-blocked-*` | Titled Settings. Display choices as lists. Account, Your data, then Close my account as the last, separate danger section, with its blocker and no close button. |
| `settings-worker-sunlight-390-sun` | The choice lists in Sunlight: 2px edges and dividers. |
| `settings-signed-out-390-light` | Signed out: "Display settings", display options only. |
| `settings-organization-owner-390-light` | An organization owner: Account only (organization accounts aren't closed from here). |
| `settings-staff-1440-light` | Staff: the Turfcut staff section before the worker sections. |
| `sharing-findable-unplaced-*` | One card per part with its audiences as rows. The words are unchanged (pinned in `src/lib/sharing-copy.test.ts`). The home-area warning beside the place field. |
| `sharing-defaults-never-saved-390-light` | Defaults, "You haven't changed anything yet". |
| `political-fit-needs-reconfirming-390-light` | Political fit's visibility choice as a list, with the reconfirm notice unchanged. |

## Not captured here

- **Close allowed (the confirmation step):** it needs a worker with no unpaid pay and no open disputes. The step itself is unchanged.
- **A failed sign-out or save:** the existing inline messages are unchanged.
- **Closure facts unavailable:** both sections stay hidden, as before (`src/app/settings/page.tsx`).
