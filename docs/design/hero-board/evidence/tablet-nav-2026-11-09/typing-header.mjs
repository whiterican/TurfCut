import pw from "/opt/node-tools/node_modules/playwright/index.js";
// While typing on a touch tablet the top bar stands in for the dock: is it on screen far down a long form? (#136)
// node typing-header.mjs <outFile.json> <commit>   env: STORAGE (a worker's storage state), BASE.
import { writeFileSync } from "node:fs";
const [outFile, commit] = process.argv.slice(2);
const STORAGE = process.env.STORAGE; if (!STORAGE) throw new Error("Set STORAGE to a worker's storage state");
const BASE = process.env.BASE ?? "http://localhost:3475"; const rows = [];
const b = await pw.chromium.launch();
for (const [name, touch] of [["touch", true], ["mouse", false]]) {
  const c = await b.newContext({ storageState: STORAGE, viewport:{width:1024,height:768}, hasTouch: touch });
  const p = await c.newPage();
  for (const path of ["/profile/availability", "/profile"]) {
    await p.goto(BASE + path, { waitUntil:"networkidle", timeout:240000 }); await p.waitForTimeout(800);
    const r = await p.evaluate(async () => {
      const typing = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=file]):not([readonly]), textarea:not([readonly])';
      const fields = [...document.querySelectorAll("main " + typing)].filter((e) => e.offsetParent);
      const f = fields.at(-1); if (!f) return { fields: 0, pageH: document.documentElement.scrollHeight };
      scrollTo(0, document.documentElement.scrollHeight); f.focus({ preventScroll: true }); f.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 300));
      const nav = document.querySelector("nav.topnav"), nr = nav.getBoundingClientRect(), fr = f.getBoundingClientRect(), dock = document.querySelector("nav.tabbar");
      return { fields: fields.length, scrollY: Math.round(scrollY), topnavShown: getComputedStyle(nav).display !== "none", topnavTop: Math.round(nr.top), topnavOnScreen: nr.top >= 0 && nr.bottom <= innerHeight, dockShown: getComputedStyle(dock).display !== "none", fieldTop: Math.round(fr.top), headerPos: getComputedStyle(document.querySelector(".site-header")).position };
    });
    rows.push({ pointer: name, viewport: "1024x768", path, ...r, source: { commit } }); console.log(name, path, JSON.stringify(r));
  }
  await c.close();
}
await b.close();
writeFileSync(outFile, JSON.stringify(rows, null, 2) + "\n");
