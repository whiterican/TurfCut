// Prints the candidate Work icons as SVG markup (JSON) for work-icons.mjs: node icons-to-svg.mjs > icons.json
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../../../package.json", import.meta.url));
const React = require("react"); const { renderToStaticMarkup } = require("react-dom/server"); const L = require("lucide-react");
const names = ["Briefcase", "CalendarClock", "CalendarDays", "Footprints", "Route", "ClipboardCheck", "ListChecks", "Backpack", "Timer", "Clock"];
const out = {};
for (const n of names) out[n] = renderToStaticMarkup(React.createElement(L[n], { "aria-hidden": true, className: "tab-icon" }));
process.stdout.write(JSON.stringify(out));
