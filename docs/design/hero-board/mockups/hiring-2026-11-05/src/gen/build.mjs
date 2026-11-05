// Builds and renders the hiring-family mockups from the app's own compiled
// stylesheet (../app/app.css, saved from a local dev build), its fonts
// (../media), and fragments harvested from the running app (../parts). The
// proposed changes are the only hand-written markup, in frames.mjs, plus the
// few rules in ../proposed.css. Run from the repository root:
//
//   node docs/design/hero-board/mockups/hiring-2026-11-05/src/gen/build.mjs [--sha <commit>] [--only <name>]
//
// Needs Playwright with Chromium (PLAYWRIGHT_PATH may point at an install,
// e.g. /opt/node-tools/node_modules/playwright). Writes:
//   ../frames/<name>-<width>.html         the composed page (clean)
//   ../<name>-<width>-<theme>.png          clean render, DPR 2, full height
//   ../annotated/<name>-390-light.png      the same frame with its notes under it
//   ../mockups-manifest.json               one row per render
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { FRAMES } from "./frames.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const OUT = path.resolve(SRC, "..");
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_PATH ?? "playwright";
const pw = require(pwPath);

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i === -1 ? null : args[i + 1]; };
const docsSha = argOf("--sha") ?? execSync("git rev-parse --short HEAD", { cwd: OUT }).toString().trim();
// The stylesheet, fonts and harvested parts come from the app build whose pages current/ captured.
const appSha = JSON.parse(readFileSync(`${OUT}/current/manifest.json`, "utf8"))[0].source.commit.slice(0, 7);
const only = argOf("--only");

mkdirSync(`${SRC}/frames`, { recursive: true });
mkdirSync(`${OUT}/annotated`, { recursive: true });

const b = await pw.chromium.launch();
const work = await b.newPage();

/** A fragment of a harvested part: the first element matching `sel` (or, with `heading`, the match whose heading reads so), with Next's form plumbing removed. */
export async function pick(part, sel, opts = {}) {
  await work.setContent(readFileSync(`${SRC}/parts/${part}.html`, "utf8"));
  const html = await work.evaluate(([s, o]) => {
    let el = document.querySelector(s);
    if (o.heading) el = [...document.querySelectorAll(s)].find((e) => e.querySelector("h2, h3")?.textContent.trim() === o.heading) ?? null;
    if (!el) return null;
    if (o.unhide) el.removeAttribute("hidden");
    el.querySelectorAll('input[type="hidden"][name^="$ACTION"], script, next-route-announcer').forEach((x) => x.remove());
    el.querySelectorAll("form").forEach((f) => { f.removeAttribute("action"); f.removeAttribute("enctype"); f.removeAttribute("method"); });
    el.querySelectorAll("[style*='view-transition']").forEach((x) => x.removeAttribute("style"));
    return el.outerHTML;
  }, [sel, opts]);
  if (html === null) throw new Error(`pick: no ${sel} in ${part}`);
  return html;
}

const page = (body, { width }) => `<!doctype html>
<html lang="en" class="inter_ce929fb-module__qqrwVG__variable h-full antialiased">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mockup</title>
<link rel="stylesheet" href="../app/app.css"><link rel="stylesheet" href="../proposed.css"></head>
<body class="min-h-full flex flex-col" data-mockup-width="${width}">${body}
<script>document.querySelectorAll('.step-track [aria-current="step"]').forEach((s) => s.scrollIntoView({ inline: "center", block: "nearest" }));</script>
</body></html>`;

const shell = {
  header: () => pick("shell-header-phone", "header"),
  rail: () => pick("shell-rail-desktop", "aside.org-rail"),
  dock: (who = "owner") => pick(who === "worker" ? "worker-invitations-dock" : "shell-dock-phone", "nav.tabbar"),
};

/** The organization shell around a <main>: header, rail (shown from lg by the app's CSS), content, dock (hidden from lg). */
export async function orgShell(main, who = "owner") {
  return `${await shell.header()}<div class="org-shell">${await shell.rail()}<div class="skip-target min-w-0 flex-1" id="content"><div class="flex flex-1 flex-col">${main}</div></div></div>${await shell.dock(who)}`;
}
/** A worker's shell: header and the worker dock, no rail. */
export async function workerShell(main) {
  return `${await shell.header()}<div class="skip-target min-w-0 flex-1" id="content"><div class="flex flex-1 flex-col">${main}</div></div>${await shell.dock("worker")}`;
}

const manifest = [];
const frames = only ? FRAMES.filter((f) => f.name === only) : FRAMES;
for (const frame of frames) {
  const ctx = { pick, orgShell, workerShell };
  for (const width of frame.widths) {
    const body = await frame.body(ctx, width);
    const notes = frame.notes ?? [];
    const noteBlock = notes.length ? `<aside class="mockup-notes" aria-label="Design notes"><h2>Notes</h2><ol>${notes.map((n) => `<li>${n}</li>`).join("")}</ol></aside>` : "";
    const clean = page(`<div class="mockup-tag">MOCKUP · synthetic data</div>${body}`, { width });
    const annotated = page(`<div class="mockup-tag">MOCKUP · synthetic data</div>${body}${noteBlock}`, { width });
    const file = `${SRC}/frames/${frame.name}-${width}.html`;
    writeFileSync(file, clean);
    const annFile = `${SRC}/frames/${frame.name}-${width}.annotated.html`;
    if (width === 390 && notes.length) writeFileSync(annFile, annotated);
    for (const theme of ["light", "dark"]) {
      const p = await b.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
      await p.goto(`file://${file}`);
      if (theme === "dark") await p.evaluate(() => document.documentElement.classList.add("dark"));
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(120);
      const info = await p.evaluate((vw) => {
        const clipped = [...document.querySelectorAll("body *")].filter((e) => {
          const cs = getComputedStyle(e);
          return (cs.overflowX === "hidden" || cs.overflow === "hidden") && e.scrollWidth > e.clientWidth + 1 && !e.closest(".step-track") && !e.classList.contains("sr-only");
        }).filter((e) => e.clientWidth > 1) // a visually-hidden element (the stacked table's 1px <thead>) isn't clipped content
          .map((e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => "." + c).join(""));
        // Against the configured viewport, not innerWidth: a mobile viewport widens to its content, which would hide the overflow.
        return { height: document.documentElement.scrollHeight, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - vw), clippedElements: clipped.length, clipped, fontReady: document.fonts.check("16px Inter") && document.fonts.check("700 16px Inter") };
      }, width);
      const out = `${OUT}/${frame.name}-${width}-${theme}.png`;
      await p.screenshot({ path: out, fullPage: true });
      manifest.push({ frame: frame.name, screen: frame.screen, state: frame.state, width, theme, dpr: 2, file: path.basename(out), contentHeight: info.height, horizontalOverflow: info.horizontalOverflow, clippedElements: info.clippedElements, clipped: info.clipped, fontReady: info.fontReady, viewportHeight: width < 600 ? 844 : 900, source: { app: appSha, docs: docsSha, stylesheet: "src/app/app.css", parts: frame.parts ?? [] } });
      console.log(path.basename(out), info.height, "over", info.horizontalOverflow, "clipped", info.clipped.join(",") || 0, "font", info.fontReady);
      if (width === 390 && theme === "light" && notes.length) {
        await p.goto(`file://${annFile}`);
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(120);
        await p.screenshot({ path: `${OUT}/annotated/${frame.name}-390-light.png`, fullPage: true });
      }
      await p.close();
    }
  }
}
await b.close();
// With --only, the frame's rows replace their predecessors in the existing manifest.
const mf = `${OUT}/mockups-manifest.json`;
const merged = only && existsSync(mf) ? [...JSON.parse(readFileSync(mf, "utf8")).filter((r) => r.frame !== only), ...manifest] : manifest;
writeFileSync(mf, JSON.stringify(merged, null, 2) + "\n");
console.log(manifest.length, "renders");
