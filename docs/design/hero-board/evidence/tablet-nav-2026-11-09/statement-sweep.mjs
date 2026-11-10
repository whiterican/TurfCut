// The statement period's Job column (tablet pass #135), for Astra: what a minimum width on it would do.
// For each viewport and each candidate min-width (set inline on the Job cells), records the title's own
// text lines, how far the table overflows its box, and whether the Current state column is cut off.
// node statement-sweep.mjs <outDir> <commit>   env: STORAGE (an organization owner's storage state), BASE, PERIOD (default 2026-10).
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const STORAGE = process.env.STORAGE; if (!STORAGE) throw new Error("Set STORAGE to an organization owner's storage state");
const BASE = process.env.BASE ?? "http://localhost:3475"; const PERIOD = process.env.PERIOD ?? "2026-10";
mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const rows = [];
for (const w of [640, 700, 768, 820, 900, 1024, 1280, 1440]) {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: w, height: 900 }, deviceScaleFactor: 1, timezoneId: "America/Denver" });
  const p = await c.newPage();
  await p.goto(`${BASE}/pay/statements/${PERIOD}`, { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(1000);
  for (const minWidth of ["none (today)", "7rem", "8rem", "9rem", "10rem"]) {
    const m = await p.evaluate((mw) => {
      document.querySelectorAll('table.statement-lines tbody td[data-label="Job"]').forEach((td) => (td.style.minWidth = mw.startsWith("none") ? "" : mw));
      const t = document.querySelector("table.statement-lines"), wrap = t.closest(".data-table-wrap"), box = wrap.getBoundingClientRect();
      const td = t.querySelector('tbody td[data-label="Job"]'); const r = document.createRange(); r.selectNodeContents(td);
      const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
      const stateCut = [...t.querySelectorAll('tbody td[data-label="Current state"]')].some((cell) => cell.getBoundingClientRect().right > box.right + 1);
      return { jobLines: lines, jobWidth: Math.round(td.getBoundingClientRect().width), overflow: wrap.scrollWidth - wrap.clientWidth, currentStateCutOff: stateCut };
    }, minWidth);
    rows.push({ viewport: `${w}x900`, minWidth, ...m, source: { commit } });
  }
  console.log(w, rows.slice(-5).map((r) => `${r.minWidth}: ${r.jobLines}l over ${r.overflow}${r.currentStateCutOff ? " CUT" : ""}`).join(" | "));
  await c.close();
}
await b.close();
writeFileSync(`${out}/statement-sweep.json`, JSON.stringify(rows, null, 2) + "\n");
