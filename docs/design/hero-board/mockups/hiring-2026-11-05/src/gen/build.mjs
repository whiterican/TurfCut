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
mkdirSync(`${OUT}/viewport`, { recursive: true });

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
<link rel="stylesheet" href="../app/leaflet.css"><link rel="stylesheet" href="../app/app.css"><link rel="stylesheet" href="../proposed.css"></head>
<body class="min-h-full flex flex-col" data-mockup-width="${width}">${body}
<script>document.querySelectorAll('.step-track [aria-current="step"]').forEach((s) => s.scrollIntoView({ inline: "center", block: "nearest" }));
// The staging map: the harvested Leaflet panes are re-centred for this column's width and the tile layer is filled from
// src/media (zoom 16 around tile 14000/24688, the harvested centre). The pin, zoom buttons and attribution are the app's (no radius is drawn today).
document.querySelectorAll(".turf-map").forEach((map) => {
  const w = map.clientWidth, h = map.clientHeight, cx = Math.round(w / 2), cy = Math.round(h / 2);
  const pane = map.querySelector(".leaflet-map-pane"); if (pane) pane.style.transform = "translate3d(" + cx + "px, " + cy + "px, 0)";
  const layer = map.querySelector(".leaflet-tile-pane .leaflet-layer > .leaflet-tile-container") || map.querySelector(".leaflet-tile-pane .leaflet-layer");
  if (layer) {
    layer.style.transform = ""; layer.innerHTML = "";
    for (let tx = Math.floor(-cx / 256); tx * 256 < w - cx; tx++) for (let ty = Math.floor(-cy / 256); ty * 256 < h - cy; ty++) {
      const img = new Image(); img.alt = ""; img.className = "leaflet-tile leaflet-tile-loaded"; img.src = "../media/tile-16-" + (14000 + tx) + "-" + (24688 + ty) + ".png";
      img.style.cssText = "width:256px;height:256px;transform:translate3d(" + tx * 256 + "px," + ty * 256 + "px,0);opacity:1"; layer.appendChild(img);
    }
  }
  const svg = map.querySelector(".leaflet-overlay-pane svg");
  if (svg) { svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", (-cx) + " " + (-cy) + " " + w + " " + h); svg.style.transform = "translate3d(" + (-cx) + "px, " + (-cy) + "px, 0)"; }
});</script>
</body></html>`;

// The rail and dock are harvested per route (shells.mjs): /jobs/new, /hiring/<job>/applicants and /workers/<id>, so each
// frame carries the app's own aria-current (Jobs "true" and More "true" on the builder; Hiring on the hiring pages; nothing on a worker page).
const shell = {
  header: () => pick("shell-header-phone", "header"),
  rail: (area) => pick(`shell-rail-${area}`, "aside.org-rail"),
  dock: (area) => pick(area === "worker" ? "worker-invitations-dock" : `shell-dock-${area}`, "nav.tabbar"),
};

/** The organization shell around a <main>: header, rail (shown from lg by the app's CSS), content, dock (hidden from lg). */
export async function orgShell(main, area = "hiring") {
  return `${await shell.header()}<div class="org-shell">${await shell.rail(area)}<div class="skip-target min-w-0 flex-1" id="content"><div class="flex flex-1 flex-col">${main}</div></div></div>${await shell.dock(area)}`;
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
        // Hit targets: the visible box plus an absolutely placed ::before that extends it (the app's filter-chip technique).
        // Hit-tested, not computed: probe above and below the visible box with elementFromPoint until the pointer no longer lands on the control.
        const hit = (sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.offsetHeight && x.textContent.trim()); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2; const on = (y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); }; let top = r.top, bottom = r.bottom; while (top > 0 && on(top - 0.25)) top -= 0.25; while (bottom < innerHeight && on(bottom + 0.25)) bottom += 0.25; scrollTo(0, 0); return { visible: Math.round(r.height), hit: Math.round(bottom - top) }; };
        const hitTargets = { step: hit(".step-track .step"), btnSm: hit(".tpl-head .btn-sm, main .btn-sm"), filterChip: hit(".filter-chip") };
        const map = document.querySelector(".turf-map");
        const mapTiles = map ? { loaded: [...map.querySelectorAll(".leaflet-tile")].filter((i) => i.complete && i.naturalWidth > 0).length, total: map.querySelectorAll(".leaflet-tile").length, controls: !!map.querySelector(".leaflet-control-zoom"), attribution: !!map.querySelector(".leaflet-control-attribution"), pin: !!map.querySelector(".leaflet-overlay-pane path") } : null;
        const clipped = [...document.querySelectorAll("body *")].filter((e) => {
          const cs = getComputedStyle(e);
          return (cs.overflowX === "hidden" || cs.overflow === "hidden") && e.scrollWidth > e.clientWidth + 1 && !e.closest(".step-track") && !e.classList.contains("sr-only");
        }).filter((e) => e.clientWidth > 1) // a visually-hidden element (the stacked table's 1px <thead>) isn't clipped content
          .map((e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => "." + c).join(""));
        // Against the configured viewport, not innerWidth: a mobile viewport widens to its content, which would hide the overflow.
        return { hitTargets, mapTiles, height: document.documentElement.scrollHeight, horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - vw), clippedElements: clipped.length, clipped, fontReady: document.fonts.check("16px Inter") && document.fonts.check("700 16px Inter") };
      }, width);
      const out = `${OUT}/${frame.name}-${width}-${theme}.png`;
      // The viewport as it opens (the dock where it really sits), light theme; then, where asked, scrolled to a target.
      let viewportFile = null, scrolledFile = null;
      if (theme === "light") {
        viewportFile = `viewport/${frame.name}-${width}.png`;
        await p.screenshot({ path: `${OUT}/${viewportFile}`, fullPage: false });
        if (frame.scrollTo && await p.$(frame.scrollTo)) { await p.$eval(frame.scrollTo, (e) => e.scrollIntoView({ block: "center" })); await p.waitForTimeout(100); scrolledFile = `viewport/${frame.name}-${width}-scrolled.png`; await p.screenshot({ path: `${OUT}/${scrolledFile}`, fullPage: false }); await p.evaluate(() => scrollTo(0, 0)); }
      }
      // Full height: the fixed dock is drawn at the page's end instead of baked across the first viewport's boundary.
      await p.evaluate(() => { const d = document.querySelector("nav.tabbar"); if (d && getComputedStyle(d).position === "fixed") { const gap = parseFloat(getComputedStyle(d).bottom) || 0; document.documentElement.style.position = "relative"; d.style.position = "absolute"; d.style.top = `${document.documentElement.scrollHeight - d.offsetHeight - gap}px`; d.style.bottom = "auto"; } });
      await p.screenshot({ path: out, fullPage: true });
      manifest.push({ frame: frame.name, screen: frame.screen, state: frame.state, width, theme, dpr: 2, file: path.basename(out), contentHeight: info.height, horizontalOverflow: info.horizontalOverflow, clippedElements: info.clippedElements, clipped: info.clipped, fontReady: info.fontReady, hitTargets: info.hitTargets, map: info.mapTiles, viewportFile, scrolledFile, viewportHeight: width < 600 ? 844 : 900, source: { app: appSha, docs: docsSha, stylesheet: "src/app/app.css", parts: frame.parts ?? [] } });
      console.log(path.basename(out), info.height, "over", info.horizontalOverflow, "clipped", info.clipped.join(",") || 0, "font", info.fontReady, "hit", JSON.stringify(info.hitTargets), info.mapTiles ? "map " + JSON.stringify(info.mapTiles) : "");
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
