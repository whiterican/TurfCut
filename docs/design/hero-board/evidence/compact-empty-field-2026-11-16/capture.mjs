// Captures the Desk's empty Field activity panel at 390, 768 and 1440, light and dark, and records what was measured.
// Needs: the app on http://localhost:3020 against a local database only, the local auth fixture
// (../hiring-tablet-2026-11-08/auth-fixture.mjs, port 55521), and an OWNER profile with the fixture's user id.
// Run from the repository root: PLAYWRIGHT_PATH=<playwright module> node docs/design/hero-board/evidence/compact-empty-field-2026-11-16/capture.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const dir = new URL('./', import.meta.url).pathname;
const sub = '00000000-0000-0000-0000-0000000000aa';
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const browser = await chromium.launch(); // Playwright's own Chromium; no system browser path.
const results = [];
try {
  for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
    const exp = Math.floor(Date.now() / 1000) + 36000;
    const h = enc({ alg: 'HS256', typ: 'JWT' }), b = enc({ sub, aud: 'authenticated', role: 'authenticated', exp });
    const token = `${h}.${b}.${createHmac('sha256', 'local-only-auth-fixture').update(`${h}.${b}`).digest('base64url')}`;
    const c = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : width === 768 ? 1024 : 844 }, deviceScaleFactor: 1 });
    await c.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + enc({ access_token: token, refresh_token: 'local-only', expires_in: 36000, expires_at: exp, token_type: 'bearer', user: { id: sub } }), domain: 'localhost', path: '/' }]);
    await c.addInitScript((t) => localStorage.setItem('turfcut-theme', t), theme);
    const p = await c.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://localhost:3020/desk', { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const section = p.locator('section[aria-labelledby="field-activity"]');
    const panel = section.locator('.empty-state').filter({ hasText: 'No assigned turf to show.' });
    await panel.waitFor();
    assert.equal(await panel.locator('a').getAttribute('href'), '/field');
    const m = await section.evaluate((s) => {
      const e = s.querySelector('.empty-state'); const cs = getComputedStyle(e); const tile = s.querySelector('.need-tile');
      return {
        height: Math.round(e.getBoundingClientRect().height),
        radius: cs.borderTopLeftRadius, needTileRadius: tile ? getComputedStyle(tile).borderTopLeftRadius : null,
        art: e.querySelector('svg[data-art]')?.dataset.art ?? null, mapKeyShown: !!s.querySelector('[aria-label="Map key"]'),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.equal(m.overflow, 0); assert.equal(m.art, 'turf'); assert.equal(m.mapKeyShown, false); assert.deepEqual(errors, []);
    await section.screenshot({ path: `${dir}${width}-${theme}.png` });
    results.push({ width, theme, ...m, errors }); await c.close();
  }
} finally {
  writeFileSync(`${dir}manifest.json`, JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browser: 'Playwright Chromium', route: '/desk, local OWNER, seeded org with no turf', note: 'Local database and local auth fixture only. The screenshot is the Field activity section.', results }, null, 2) + '\n');
  await browser.close();
}
