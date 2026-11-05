// Writes ../../COVERAGE.md from ../../mockups-manifest.json and the list of screens kept as they are.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../..");
const m = JSON.parse(readFileSync(`${OUT}/mockups-manifest.json`, "utf8"));
const cur = JSON.parse(readFileSync(`${OUT}/current/manifest.json`, "utf8"));
const sha = m[0]?.source.commit ?? "";
const byFrame = new Map();
for (const r of m) { if (!byFrame.has(r.frame)) byFrame.set(r.frame, { screen: r.screen, state: r.state, renders: [] }); byFrame.get(r.frame).renders.push(r); }
let md = `# Coverage index\n\nEvery proposed frame, at every width and theme, from \`mockups-manifest.json\` (source commit \`${sha}\`, DPR 2, full content height; "clipped" counts elements whose content is wider than their hidden-overflow box, screen-reader-only text excluded; "font" is whether Inter was loaded before the capture). The annotated copy of a frame is \`annotated/<frame>-390-light.png\`.\n\n`;
let screen = "";
for (const [frame, f] of byFrame) {
  if (f.screen !== screen) { screen = f.screen; md += `\n## ${screen}\n\n| Frame | State | Width | Light | Dark | Height | Overflow | Clipped | Font |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`; }
  const widths = [...new Set(f.renders.map((r) => r.width))];
  for (const w of widths) {
    const l = f.renders.find((r) => r.width === w && r.theme === "light"), d = f.renders.find((r) => r.width === w && r.theme === "dark");
    md += `| \`${frame}\` | ${f.state} | ${w} | [light](${l.file}) | [dark](${d.file}) | ${l.contentHeight} / ${d.contentHeight} | ${l.horizontalOverflow} / ${d.horizontalOverflow} | ${l.clippedElements} / ${d.clippedElements} | ${l.fontReady && d.fontReady ? "yes" : "NO"} |\n`;
  }
}
md += `\n## Kept as they are (today's capture is the proposal)\n\nThese screens change only through the shared pieces above. Their reference is the \`current/\` capture at master \`${cur[0]?.source.commit ?? ""}\`, light theme, DPR 2.\n\n| Screen | State | Width | Capture |\n| --- | --- | --- | --- |\n`;
const keep = ["hiring-overview", "matches", "invites", "worker-invitations", "worker-invitations-empty", "applicants-filters", "worker-denied-finance", "builder-no-access"];
for (const c of cur.filter((c) => keep.includes(c.screen))) md += `| ${c.screen} | ${c.role} | ${c.width} | [${c.file}](current/${c.file}) |\n`;
md += `\nDark renders of the kept screens: the same pages with \`.dark\` on \`<html>\`; the tokens are the app's (\`DARK_MODE.md\`), and the proposed frames above show every shared piece in dark.\n`;
writeFileSync(`${OUT}/COVERAGE.md`, md);
console.log("COVERAGE.md", byFrame.size, "frames", m.length, "renders");
