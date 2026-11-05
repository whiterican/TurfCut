// Writes ../../COVERAGE.md from ../../mockups-manifest.json and the list of screens kept as they are.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../..");
const m = JSON.parse(readFileSync(`${OUT}/mockups-manifest.json`, "utf8"));
const cur = JSON.parse(readFileSync(`${OUT}/current/manifest.json`, "utf8"));
const sha = m[0]?.source.app ?? "", docs = m[0]?.source.docs ?? "";
const byFrame = new Map();
const screens = [...new Set(m.map((r) => r.screen))];
for (const r of [...m].sort((a, b) => screens.indexOf(a.screen) - screens.indexOf(b.screen))) { if (!byFrame.has(r.frame)) byFrame.set(r.frame, { screen: r.screen, state: r.state, renders: [] }); byFrame.get(r.frame).renders.push(r); }
let md = `# Coverage index\n\nEvery proposed frame, at every width and theme, from \`mockups-manifest.json\` (the app's stylesheet, fonts and harvested parts at master \`${sha}\`; the generator is \`src/gen/\` as committed with this file, \`source.docs\` in the manifest being the commit it was last built on top of; DPR 2, full content height, viewport 390×844 or 1440×900; "clipped" names elements whose content is wider than their hidden-overflow box, visually-hidden elements excluded: the only one is the Leaflet map container, whose tile layer is wider than its box by design (the row also reports the tiles, pin, zoom buttons and attribution in it); "font" is whether Inter was loaded before the capture). The annotated copy of a frame is \`annotated/<frame>-390-light.png\`.\n\n`;
let screen = "";
for (const [frame, f] of byFrame) {
  if (f.screen !== screen) { screen = f.screen; md += `\n## ${screen}\n\n| Frame | State | Width | Light | Dark | Viewport | Height | Overflow | Clipped | Font | Hit targets (visible→hit) |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`; }
  const widths = [...new Set(f.renders.map((r) => r.width))];
  for (const w of widths) {
    const l = f.renders.find((r) => r.width === w && r.theme === "light"), d = f.renders.find((r) => r.width === w && r.theme === "dark");
    const ht = Object.entries(l.hitTargets ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v.visible}→${v.hit}`).join(", ") || "—";
    const vp = l.viewportFile ? `[open](${l.viewportFile})${l.scrolledFile ? ` · [scrolled](${l.scrolledFile})` : ""}` : "—";
    const mapNote = l.map ? ` Map: ${l.map.loaded}/${l.map.total} tiles${l.map.pin ? ", pin" : ""}${l.map.controls ? ", zoom" : ""}${l.map.attribution ? ", attribution" : ""}.` : "";
    md += `| \`${frame}\` | ${f.state}${mapNote} | ${w} | [light](${l.file}) | [dark](${d.file}) | ${vp} | ${l.contentHeight} / ${d.contentHeight} | ${l.horizontalOverflow} / ${d.horizontalOverflow} | ${l.clipped.join(" ") || 0} / ${d.clipped.join(" ") || 0} | ${l.fontReady && d.fontReady ? "yes" : "NO"} | ${ht} |\n`;
  }
}
md += `\n## Kept as they are (today's capture is the proposal)\n\nThese screens change only through the shared pieces above. Their reference is the \`current/\` capture at master \`${cur[0]?.source.commit.slice(0, 7) ?? ""}\`, light and dark (the app's own theme switch), DPR 2, full height.\n\n| Screen | Role | Width | Light | Dark |\n| --- | --- | --- | --- | --- |\n`;
const keep = ["hiring-overview", "matches", "invites", "worker-invitations", "worker-invitations-empty", "applicants-filters", "worker-denied-finance"];
for (const c of cur.filter((c) => keep.includes(c.screen) && c.theme !== "dark")) { const d = cur.find((x) => x.screen === c.screen && x.width === c.width && x.theme === "dark"); md += `| ${c.screen} | ${c.role} | ${c.width} | [light](current/${c.file}) | ${d ? `[dark](current/${d.file})` : "—"} |\n`; }
md += `\n## What the checks cover\n\n"Overflow" is the document's width beyond the viewport. "Clipped" names elements whose content is wider than their hidden-overflow box (visually-hidden elements excluded). "Hit targets" measures the first step, small action and filter chip: the visible box and the box its absolutely placed ::before extends it to (\`proposed.css\` §7 for the steps and this family's actions; the app's own rule for filter chips). The map row counts the tiles loaded in the box and whether the pin, zoom buttons and attribution are present. The viewport column is the first screen as it opens, with the dock where it really sits; in the full-height exports the dock is drawn at the page's end so it covers nothing. A squeezed column or an occluded field is checked by eye on those captures, not by the manifest.\n`;
writeFileSync(`${OUT}/COVERAGE.md`, md);
console.log("COVERAGE.md", byFrame.size, "frames", m.length, "renders");
