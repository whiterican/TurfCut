// Renders each frame inside the real app shell (logged-in, local app) and screenshots it.
// Usage: node render.mjs <baseUrl>   (default http://localhost:3475). Needs a local app with the fp test users.
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = pkg;
const here = path.dirname(new URL(import.meta.url).pathname);
const base = process.argv[2] ?? 'http://localhost:3475';
const css = fs.readFileSync(path.join(here, 'proposed.css'), 'utf8');
const frames = [
  ['h1-people-list', 'owner@fp.test', '/hiring'],
  ['h2-person-record', 'owner@fp.test', '/hiring'],
  ['h3-follow-ups', 'owner@fp.test', '/hiring'],
  ['f1-worker-today', 'jordan@fp.test', '/'],
  ['f2-walkbook-import', 'owner@fp.test', '/hiring'],
  ['f3-leads-list', 'owner@fp.test', '/hiring'],
];
const sizes = [['phone', 390, 1100], ['desktop', 1440, 900]];
const b = await chromium.launch();
fs.mkdirSync(path.join(here, 'renders'), { recursive: true });
for (const email of [...new Set(frames.map((f) => f[1]))]) {
  for (const scheme of ['light', 'dark']) {
    for (const [sizeName, w, h] of sizes) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(base + '/login');
      await p.fill('input[name=email]', email);
      await p.fill('input[name=password]', 'password123');
      await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login')), p.click('button[value=password]')]);
      for (const [name, who, shell] of frames.filter((f) => f[1] === email)) {
        await p.goto(base + shell);
        await p.waitForSelector('main.tpl');
        await p.waitForTimeout(800);
        const html = fs.readFileSync(path.join(here, 'frames', name + '.html'), 'utf8');
        await p.evaluate(({ html, css }) => {
          const main = document.querySelector('main.tpl');
          main.outerHTML = html;
          const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
          const bn = document.createElement('div'); bn.className = 'mock-banner'; bn.textContent = 'MOCKUP — not built, demo data only'; document.body.appendChild(bn);
        }, { html, css });
        await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(here, 'renders', `${name}-${sizeName}-${scheme}.png`), fullPage: false });
      }
      await ctx.close();
    }
  }
}
await b.close();
console.log('rendered');
