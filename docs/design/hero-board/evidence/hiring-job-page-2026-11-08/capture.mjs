// Evidence for hiring slice 2 (publishing groups): node capture.mjs <outDir> <commit>
// Real job pages on the local test database. Records the app's own state, then screenshots.
import pw from "/opt/node-tools/node_modules/playwright/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
const [out, commit] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const BASE = "http://localhost:3475";
const FP = "/tmp/claude-0/-home-user-TurfCut/af2c4bc2-e73f-5766-b49f-f47c873c5da0/scratchpad/fp/";
const PASS_DRAFTS = ["c01a4f88-a2a3-4940-9979-a7b05dda2eae", "1f68924f-9b39-4085-8e89-d63357365d65", "5e37208d-afe5-46d9-9eb0-ad3218f92f41", "5ff09edd-458c-4501-8c4e-404a90df81a8", "533c0a6f-b30a-4381-b8df-2370b82d4da3", "8afad136-1ea4-442b-932e-0fd48d41e63a", "a5da27fd-e9cd-4105-a4e9-9f91bfe96a8e", "e2a4c842-f564-4fbb-bd42-b9b5b41a73b2"];
const SECOND_DRAFT = "66c30b7d-eccc-4d62-892d-1101cf020d66";

const b = await pw.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const ctx = async (user, w, theme) => {
  const c = await b.newContext({ storageState: FP + user + ".json", viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: 2, isMobile: w < 600, hasTouch: w < 600, timezoneId: "America/Denver" });
  await c.addInitScript((t) => { try { localStorage.setItem("turfcut-theme", t); } catch {} }, theme);
  return c;
};
const record = () => {
  const sec = [...document.querySelectorAll("section.section")].find((s) => s.querySelector("h2")?.textContent === "Publishing");
  if (!sec) return { publishing: null, over: document.documentElement.scrollWidth - innerWidth };
  const groups = [...sec.querySelectorAll(".alert-warning h3")].map((h) => ({
    title: h.textContent,
    reasons: [...h.parentElement.querySelectorAll("li")].map((li) => li.textContent),
    link: h.parentElement.querySelector("a")?.textContent ?? null,
    note: h.parentElement.querySelector("p")?.textContent ?? null,
  }));
  const pub = [...sec.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith("Publish"));
  return {
    over: document.documentElement.scrollWidth - innerWidth,
    headline: sec.querySelector(".alert-warning > p")?.textContent ?? null,
    groups,
    clear: sec.querySelector(".text-muted-sm")?.textContent ?? null,
    publish: pub ? { disabled: pub.disabled } : null,
    editDraft: !![...sec.querySelectorAll("a")].find((a) => a.textContent === "Edit draft"),
  };
};
const dockToEnd = () => { const d = document.querySelector("nav.tabbar"); if (d && getComputedStyle(d).position === "fixed") { const gap = parseFloat(getComputedStyle(d).bottom) || 0; document.documentElement.style.position = "relative"; d.style.position = "absolute"; d.style.top = `${document.documentElement.scrollHeight - d.offsetHeight - gap}px`; d.style.bottom = "auto"; } };

// Find a Pass Test draft that passes every check (owner view).
let clearId = null;
{
  const c = await ctx("owner", 1440, "light"); const p = await c.newPage();
  for (const id of PASS_DRAFTS.slice(1)) {
    await p.goto(`${BASE}/jobs/${id}`, { waitUntil: "networkidle", timeout: 240000 });
    const r = await p.evaluate(record);
    console.log("scan", id, JSON.stringify(r.groups?.map((g) => g.title) ?? r));
    if (r.clear?.startsWith("Every check passes")) { clearId = id; break; }
  }
  await c.close();
}

const states = [
  ["job-and-counsel-owner", "owner", PASS_DRAFTS[0], "Aurora draft: Boulder profile never approved; owner (edit + settings)"],
  ["job-and-counsel-finance", "finance", PASS_DRAFTS[0], "Same draft, Finance role (settings read, no job edit): no buttons"],
  ["settings-owner2", "owner2", SECOND_DRAFT, "Second Pass Org: not approved, terms unsigned, classification not reviewed"],
  ...(clearId ? [["clear-owner", "owner", clearId, "A Pass Test draft that passes every check"]] : []),
];
const manifest = [];
for (const [name, user, id, note] of states) for (const w of [390, 1440]) for (const theme of ["light", "dark"]) {
  const c = await ctx(user, w, theme); const p = await c.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("/realtime/v1/")) errs.push(m.text().slice(0, 160)); });
  await p.goto(`${BASE}/jobs/${id}`, { waitUntil: "networkidle", timeout: 240000 });
  await p.waitForTimeout(300);
  const info = await p.evaluate(record);
  let vp = null;
  if (theme === "light") {
    await p.evaluate(() => { const h = [...document.querySelectorAll("h2")].find((x) => x.textContent === "Publishing"); h?.scrollIntoView({ block: "start" }); scrollBy(0, -80); });
    await p.waitForTimeout(200);
    vp = `${name}-${w}-viewport.png`;
    await p.screenshot({ path: `${out}/${vp}` });
    await p.evaluate(() => scrollTo(0, 0));
  }
  await p.evaluate(dockToEnd);
  const file = `${name}-${w}-${theme}.png`;
  await p.screenshot({ path: `${out}/${file}`, fullPage: true });
  manifest.push({ name, user, job: id, note, width: w, theme, file, viewport: vp, ...info, consoleErrors: errs.length, source: { commit } });
  console.log(file, JSON.stringify(info), "errs", errs.length, errs[0] ?? "");
  await c.close();
}
await b.close();
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
