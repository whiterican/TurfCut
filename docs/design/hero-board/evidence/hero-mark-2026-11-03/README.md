# Sign-in band brand mark (#124, 2026-11-03)

These captures record the code at `9b9fadc8954aa5ac07059da6ab167318333cb576`, the commit Astra approved after reviewing its source. That is the PR head before this docs-only commit.

They were taken from a local dev server on a clean tree, full page at DPR 2, light theme, in America/Denver. `manifest.json` gives the following for each capture:
- the route and role;
- the width;
- how many brand marks are visible;
- whether the worker header class was present;
- horizontal overflow;
- console errors.

None of the captures has horizontal overflow or console errors.

| Capture | Who | Visible marks | Shows |
| --- | --- | --- | --- |
| `login-guest-390-light.png` | Signed out | 1 | The header carries the mark. The band is the line alone. |
| `signup-guest-390-light.png` | Signed out | 1 | Same as login. |
| `login-worker-390-light.png` | Signed-in worker (synthetic local fixture) | 1 | A worker's header is hidden below lg, so the band keeps the mark. |
| `login-guest-1440-light.png` | Signed out | 2 | Desktop is unchanged: the header mark, plus the left panel's mark as its picture. |

The worker is a synthetic account that exists only in a local test database.
