// The statement period's Job column (tablet pass #135): how many lines a job title takes, and how wide the table scrolls.
// node statementm.mjs <outDir> <commit> <label>   env: STORAGE (an organization owner's storage state), BASE, PERIOD (default 2026-10).
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit, label] = process.argv.slice(2);
const STORAGE = process.env.STORAGE; if (!STORAGE) throw new Error("Set STORAGE to an organization owner's storage state");
const BASE = process.env.BASE ?? "http://localhost:3475"; const PERIOD = process.env.PERIOD ?? "2026-10";
mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const rows = [];
for (const [w, h] of [[640, 900], [768, 1024], [1024, 768], [1440, 900]]) {
  const c = await b.newContext({ storageState: STORAGE, viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 1440, timezoneId: "America/Denver" });
  const p = await c.newPage();
  await p.goto(`${BASE}/pay/statements/${PERIOD}`, { waitUntil: "networkidle", timeout: 240000 });
  await p.waitForFunction(() => document.readyState === "complete").catch(() => {}); await p.waitForTimeout(1000);
  const m = await p.evaluate(() => {
    const t = document.querySelector("table.statement-lines"), wrap = t?.closest(".data-table-wrap");
    const jobs = [...t.querySelectorAll('tbody td[data-label="Job"]')].map((td) => { const r = document.createRange(); r.selectNodeContents(td); const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))); return { text: td.textContent.trim(), width: Math.round(td.getBoundingClientRect().width), lines: tops.size }; }); // lines: the title's own text lines (the cell itself stretches to the row's tallest cell)
    return { stacked: getComputedStyle(t).display === "block", tableScrollWidth: wrap.scrollWidth, wrapWidth: wrap.clientWidth, scrollsSideways: wrap.scrollWidth > wrap.clientWidth + 1, jobs, pageOver: document.documentElement.scrollWidth - innerWidth };
  });
  await p.locator("table.statement-lines").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -80));
  const file = `statement-${label}-${w}.png`; await p.screenshot({ path: `${out}/${file}` });
  rows.push({ label, viewport: `${w}x${h}`, ...m, file, source: { commit } });
  console.log(label, w, JSON.stringify({ ...m, jobs: m.jobs.map((j) => `${j.lines}l/${j.width}px`) }));
  await c.close();
}
await b.close();
writeFileSync(`${out}/statement-${label}.json`, JSON.stringify(rows, null, 2) + "\n");
