# Profile photo (Nov 10 2026)

Caden: "The ability to add a custom profile photo needs to be added" and "Everyone can add photos".

## What was built

- **Settings → Photo**, for every signed-in person (workers and organization members): add, change or remove a photo of yourself.
- The photo shows in three places, all of them your own view: the menu button, the head of the menu drawer, and the foot of the sidebar.
- The browser crops the photo to an upright 512-pixel square before sending it, so a phone photo of several MB uploads as a few dozen KB.
- The server judges the bytes itself (PNG or JPEG, up to 2 MB) and strips location and camera details, using the same check as campaign images (moved to `src/lib/image-clean.ts` so it is not tied to the social layer).

## Who sees a photo

Only the person it belongs to, for now. A photo shows race, age and gender, so it stays out of everything an organization sees while hiring. Whether an organization may see a worker's photo at all (for example only after hiring) is an open decision for Caden; nothing in this change shows a photo to anyone else.

- The file lives in a private storage bucket, `profile-photos`. Only the server reads or writes it.
- `GET /api/profile-photo` takes no id: it can only serve the signed-in person's own photo. Signed out, it answers 401.
- The response is `private, no-cache` with an ETag, so a shared phone asks the server every time and never shows the last person's photo.
- Nothing ranks, matches or infers anything from a photo.
- Closing an account removes the photo; the daily purge job retries a removal that failed.

## Data model (approved by Caden)

- `Profile.avatarKey`, nullable text.
- Private bucket `profile-photos` (2 MB limit, PNG and JPEG only).
- SQL: `prisma/profile-photo.sql`, also folded into `prisma/supabase-manual-setup.sql`.

## Design calls (Astra is out; made by Claude)

- The section sits on Settings, between the display options and Account, because Settings is the one page every role has.
- Without a photo the circle shows the person's initial, as the menu button already did.
- The sidebar and drawer show a photo only when there is one; they are unchanged otherwise.

## Checked

Chromium against the local stack with a stand-in for storage:

| Check | Result |
| :--- | :--- |
| Worker on a 390px phone adds a photo | Saved; shown on Settings, menu button and drawer |
| Owner on a 1280px desktop, dark | Saved; shown in the sidebar foot; removed again |
| A GIF | Refused in the browser: "Choose a JPEG or PNG photo." |
| Signed-out request | 401 |
| Repeat request with the ETag | 304 |
| Console and network errors | None |

Not checked: real Supabase Storage (the local stack fakes it) and a real iPhone camera roll.

## Screens

- `worker-phone-1-empty.png`, `worker-phone-2-added.png`: Settings before and after.
- `worker-phone-4-drawer.png`: the drawer head with the photo.
- `owner-desktop-dark-3-nav.png`: the sidebar foot with the photo.
