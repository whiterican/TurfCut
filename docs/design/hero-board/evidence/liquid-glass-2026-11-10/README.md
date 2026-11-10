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

## More reflective, more transparent (later on Nov 10)

Caden asked for more of both.
- **Thinner panes.** Icon-only panes (the dock, icon buttons, map controls) are 45% of the card colour by day and 62% by night, from 62% and 74%. They hold icons, so the test asks 3:1 over the worst thing behind them, the bar for graphics. The drawer and sheets are 79% and 78%, from 80% and 82%. Bars with small grey text (the header, the sidebar, a thread's bar, the composer) are 80%, from 88%: muted text stays above 4.5:1 there. Cards are 80% and 82%.
- **The named menu button** moved to the drawer's denser pane, because it carries text.
- **More reflection.** The sheen is a diagonal glint (bright at the top-left corner, a fainter return at the bottom-right) in place of a top-down fade; the rim is brighter all the way round; the blur behind is richer (more saturation, a little contrast).

`more-light.png` and `more-dark.png`: Home, a job's page and the open drawer.

A separate Claude reviewer then computed the contrast for everything that sits on each pane, with the glint included. Two things did not hold and are corrected, so the final values are less thin than the first cut in three places:
- by night the white glint over a white backdrop took the dock's icons under 3:1 (2.69:1 at the corner). The night glint is now faint (8% at its brightest) and the night dock pane is 62%;
- the drawer and sheets carry small grey text, which fell to 3.80:1 by day and 4.23:1 by night. They are 79% and 78% (they were 80% and 82% before this change), and their faintest grey steps up to muted;
- the tests now pin those values, check muted text on the drawer's pane, and include the night glint.

The two screenshots were taken before these corrections: by night the dock is slightly denser and the glint fainter than shown.

## Review

A separate Claude reviewer measured the glass in light, dark, Sunlight, reduced transparency, more contrast and forced colours, and found nothing broken. Its findings, fixed:
- form fields had picked up the glass edge, which is near white by day, and lost their outline (they keep the page's hairline again);
- small grey text on the header, a chat thread's bar, the composer and the map credits could drop below AA when something dark scrolled underneath (those bars are now a denser pane, 88%, and a test checks the worst case);
- the page wash was strong enough to dim grey text at the top of a page (now 40% by day, 17% by night);
- in Sunlight and the solid fallback the header turned card-white instead of the page colour, and the fallback kept the lit edges;
- the dock's edge leaned on its shadow alone (now a faint ink line);
- the unread badge's ring, a second blur on buttons inside glass bars, a card that showed its swipe colour through, and a tinted strip above a chat thread's bar.

The screenshots and `sweep.txt` here were retaken after these fixes.

## Evidence

- `light.png`: worker Home, Jobs, a chat thread, an organization's Field map, 390 wide.
- `dark.png`: worker Home, the drawer open, a job's page, an organization's Pay, 390 wide, dark.
- `dark-desktop-1280.png`: an organization's Overview with the sidebar, dark.

## Not done

- The organization's sidebar is still the solid eggplant frame. It becomes glass with the sidebar work that follows (a worker sidebar, and both sidebars on tablets).
- Not checked: a real device, Safari, Sunlight by eye, print, the admin console.

## The drawer fits the screen (Caden's phone, Nov 10)

On Caden's iPhone, with the app installed to the home screen, the drawer stopped under a strip of page colour where the status bar sits, and its current row was a dark square block with a stray focus outline on the first row.

- An installed app draws the status bar's strip in the root's colour, above the page, where the page cannot paint. While the drawer is open the root now takes the drawer's own colour, and the drawer's top edge is square, so it reads as running to the top of the screen.
- The current row is the dock's tinted capsule with rounded ends; rows have no dividers.
- Opening the drawer focuses its panel, not its first row, so no outline appears on touch. Tab still goes to the rows.

`drawer-flush.png` is Chromium, which has no status-bar strip: it shows the rows and the square top edge. Whether iOS repaints the strip when the root's colour changes while the app is open is not verified here; it needs a look on the phone.

A separate Claude reviewer found that the first version of the root-colour rule could never apply: it sat inside a cascade layer, and the root's own background is outside every layer, so it won. The rule is now outside the layers, on screen only (print keeps white), driven by one token that Sunlight and the solid fallback set to the plain card colour. The drawer's pane also lost its glint and lit top edge, which would have drawn a seam against the flat strip. A test pins where the rule sits. Known compromise: the strip is the full width of the screen and the drawer is not, so the strip's right end sits above the dimmed page.
