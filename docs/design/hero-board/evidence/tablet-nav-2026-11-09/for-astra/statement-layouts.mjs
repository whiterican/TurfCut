import pw from "/opt/node-tools/node_modules/playwright/index.js";
// Mockups, for Astra: the statement period's table today, with the job name under the date, and as stacked rows to 1024.
// Rearranged in the browser only; the app is unchanged. node statement-layouts.mjs   env: STORAGE (an owner's storage state), OUT, BASE.
const OUT = process.env.OUT ?? "."; const BASE = process.env.BASE ?? "http://localhost:3475";
const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const variants = {
  today: () => {},
  // (a) The job name on a second line under the date; the Job column goes.
  "job-under-date": () => {
    const t = document.querySelector("table.statement-lines");
    t.querySelector('thead th:nth-child(3)').remove();
    t.querySelector('thead th:nth-child(2)').textContent = "Date · Job";
    for (const tr of t.querySelectorAll("tbody tr:not(.statement-subtotal)")) {
      const job = tr.querySelector('td[data-label="Job"]'); const date = tr.querySelector('td[data-label="Date"]');
      if (!job || !date) continue;
      const line = document.createElement("div"); line.textContent = job.textContent; line.style.cssText = "white-space:normal;font-size:0.8125rem;color:var(--muted);margin-top:2px;min-width:8rem";
      date.appendChild(line); job.remove();
    }
    const sub = t.querySelector(".statement-subtotal th[colspan]"); if (sub) { sub.colSpan = 3; sub.setAttribute("aria-colspan", "3"); }
  },
  // (b) The phone's stacked rows, used up to 1024: copy the narrow-width stack rules without their media query.
  "stacked-to-1024": () => {
    const rules = [];
    for (const sheet of document.styleSheets) { let list; try { list = sheet.cssRules; } catch { continue; }
      const walk = (rs) => { for (const r of rs) { if (r.cssRules && r.conditionText && /width < 40rem|max-width: 39\.99|not \(min-width: 40rem\)/.test(r.conditionText)) { for (const x of r.cssRules) if (/data-table-stack|statement-lines/.test(x.cssText)) rules.push(x.cssText); } else if (r.cssRules) walk(r.cssRules); } };
      walk(list); }
    const st = document.createElement("style"); st.textContent = rules.join("\n"); document.head.appendChild(st);
    return rules.length;
  },
};
const out = [];
for (const w of [768, 1024]) for (const [name, fn] of Object.entries(variants)) {
  const c = await b.newContext({ storageState: process.env.STORAGE, viewport: { width: w, height: 1024 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: "reduce", timezoneId: "America/Denver" });
  const p = await c.newPage();
  await p.goto(BASE + "/pay/statements/2026-10", { waitUntil: "networkidle", timeout: 240000 }); await p.waitForTimeout(1200);
  const n = await p.evaluate(fn);
  const m = await p.evaluate(() => { const t = document.querySelector("table.statement-lines"), wrap = t.closest(".data-table-wrap"), box = wrap.getBoundingClientRect();
    const cut = [...t.querySelectorAll('tbody td[data-label="Current state"]')].some((cell) => cell.getBoundingClientRect().right > box.right + 1);
    return { overflow: wrap.scrollWidth - wrap.clientWidth, currentStateCutOff: cut, tableHeight: Math.round(t.getBoundingClientRect().height) }; });
  const el = p.locator("table.statement-lines").locator("xpath=ancestor::*[contains(@class,'data-table-wrap')]");
  await el.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -60));
  await el.screenshot({ path: `${OUT}/stmt-${name}-${w}.png` });
  out.push({ width: w, variant: name, rulesCopied: n ?? null, ...m });
  console.log(w, name, JSON.stringify(m), n ?? "");
  await c.close();
}
await b.close();
