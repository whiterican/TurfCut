// Console: opening a stop's history must move focus to the inspector and bring it into view.
import { createRequire } from 'node:module'; import { createHmac } from 'node:crypto';
const { chromium } = createRequire(process.env.PW)('playwright');
const [,, base, jobId, sub] = process.argv;
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 36000; const h = enc({ alg: 'HS256', typ: 'JWT' }), pl = enc({ sub, aud: 'authenticated', role: 'authenticated', exp });
const token = `${h}.${pl}.${createHmac('sha256', 'local-only-auth-fixture').update(`${h}.${pl}`).digest('base64url')}`;
const b = await chromium.launch(); const out = {};
for (const width of [390, 1440]) {
  const c = await b.newContext({ viewport: { width, height: 844 } });
  await c.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + enc({ access_token: token, refresh_token: 'x', expires_in: 36000, expires_at: exp, token_type: 'bearer', user: { id: sub } }), domain: 'localhost', path: '/' }]);
  const p = await c.newPage();
  await p.goto(`${base}/jobs/${jobId}/walkbooks/console`, { waitUntil: 'networkidle', timeout: 90000 });
  const link = p.locator('a[href*="stop="]:visible').first();
  await link.focus(); await p.keyboard.press('Enter');
  await p.waitForSelector('#stop-history', { timeout: 15000 }); await p.waitForTimeout(800);
  out[width] = await p.evaluate(() => { const el = document.getElementById('stop-history'); const r = el.getBoundingClientRect(); return { focused: document.activeElement?.id || document.activeElement?.tagName, inView: r.top < innerHeight && r.bottom > 0 }; });
  await c.close();
}
await b.close();
console.log(JSON.stringify(out));
process.exit(Object.values(out).every((o) => o.focused === 'stop-history' && o.inView) ? 0 : 1);
