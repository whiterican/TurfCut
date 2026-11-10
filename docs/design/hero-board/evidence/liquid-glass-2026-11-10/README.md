# Liquid Glass (Nov 10, 2026)

Caden asked for Liquid Glass throughout the app, in the manner of iOS 26. Astra is out, so the design calls are Claude's at Caden's word; she can revisit them.

All evidence is the running app on the local test database in Chromium. It is not a real iPhone or Safari, where the blur is drawn differently.

## What changed

- **Controls that float over content are glass**: the dock, the site header, the menu button and its drawer, bottom sheets, and the surfaces that already read the glass tokens (icon buttons, the chat composer and thread bar, map controls). Each is a translucent pane of the card colour with the page blurred behind it, a bright top edge and a soft drop.
- **The dock is light glass with ink icons**, the current one in a tinted capsule. It was the solid eggplant frame.
- **Cards are the content layer**: nearly solid (86% by day, 88% by night), with the same lit top edge and a faint sheen. They are not blurred: a blur behind every card is slow on phones and makes text harder to read.
- **A wash of the brand's sky colour** sits at the top of every page, so the glass has something to pick up.
- **Solid fallbacks**: Sunlight (made for glare) keeps opaque surfaces and its black dock. So does anyone whose device asks for reduced transparency, more contrast or forced colours.

## Checks

- `tsc` and `eslint` are clean; vitest passes 1,044 tests.
- The dock test now checks the worst case behind the pane: black under the day's glass, white under the night's. The icons stay at 4.5:1 or better on the pane and on the current capsule. That check set the night pane at 74% (70% measured 4.40:1).
- `sweep.txt`: the 31-page sweep, no sideways overflow.

## Evidence

- `light.png`: worker Home, Jobs, a job's page, an organization's Overview, 390 wide.
- `dark.png`: worker Home, the drawer open, a job's page, an organization's Pay, 390 wide, dark.
- `dark-desktop-1280.png`: an organization's Overview with the sidebar, dark.

## Not done

- The organization's sidebar is still the solid eggplant frame. It becomes glass with the sidebar work that follows (a worker sidebar, and both sidebars on tablets).
- Not checked: a real device, Safari, Sunlight by eye, print, the admin console.
