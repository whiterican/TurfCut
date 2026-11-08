// Field filter measurements: node fieldm.mjs <outDir> <commit>
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
const FP = "/tmp/claude-0/-home-user-TurfCut/af2c4bc2-e73f-5766-b49f-f47c873c5da0/scratchpad/fp/";
const JOB = "86d8312d-003d-4ffd-8b70-1a06f0d9b28f";
const LONG = "Pass test canvass 390 · north and east precincts, weekend mornings"; // simulated in the page, not in the database
const b = await pw.chromium.launch();
const rows = [];
for (const text of ["md", "xl"]) for (const [w, h] of [[390, 844], [1024, 768], [1440, 900]]) for (const scen of ["all-jobs", "job-selected", "job-selected-long-title"]) {
  const c = await b.newContext({ storageState: FP + "owner.json", viewport: { width: w, height: h } });
  await c.addInitScript((t) => { if (t !== "md") document.documentElement.setAttribute("data-text", t); }, text);
  const p = await c.newPage();
  await p.goto(`http://localhost:3475/field${scen === "all-jobs" ? "" : `?job=${JOB}`}`, { waitUntil: "networkidle", timeout: 240000 });
  if (text !== "md") await p.evaluate((t) => document.documentElement.setAttribute("data-text", t), text);
  if (scen === "job-selected-long-title") await p.evaluate((t) => { document.querySelector("#field-job").selectedOptions[0].text = t; }, LONG);
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => {
    const s = document.querySelector("#field-job"), f = s.form, strip = document.querySelector(".field-strip > div");
    const r = (e) => e ? Math.round(e.getBoundingClientRect().width) : null;
    const btns = [...f.querySelectorAll("button, a")].map((e) => ({ text: e.textContent.trim(), top: Math.round(e.getBoundingClientRect().top) }));
    const c = getComputedStyle(s), ctx = document.createElement("canvas").getContext("2d"); ctx.font = c.font;
    const textW = ctx.measureText(s.selectedOptions[0].text).width, box = s.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - 24;
    return { selectWidth: r(s), selectTop: Math.round(s.getBoundingClientRect().top), controls: btns, figuresWidth: r(strip), selectedText: s.selectedOptions[0].text, textFits: textW <= box, over: document.documentElement.scrollWidth - innerWidth };
  });
  const file = `field-${text}-${w}-${scen}.png`;
  if (w !== 1440 || scen !== "all-jobs") await p.screenshot({ path: `${out}/${file}`, clip: await p.$eval(".field-strip", (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 8 + scrollY), width: innerWidth, height: r.height + 16 }; }) });
  rows.push({ textSize: text, width: w, scenario: scen, simulatedTitle: scen === "job-selected-long-title", ...m, file, source: { commit } });
  console.log(text, w, scen, JSON.stringify(m));
  await c.close();
}
await b.close();
writeFileSync(`${out}/field-measurements.json`, JSON.stringify(rows, null, 2) + "\n");
