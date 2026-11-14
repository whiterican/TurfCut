const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import fs from 'node:fs';
const out='docs/design/hero-board/evidence/statement-polish-2026-11-14';
const browser=await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto(`${process.env.BASE ?? 'http://127.0.0.1:3041'}/zz-polish-fixture`,{waitUntil:'networkidle',timeout:120000});
const results=[];
for(const width of [390,640,768,1024,1440]) {
 await page.setViewportSize({width,height:1000});
 for(const theme of ['light','dark']) {
  await page.evaluate(t=>{document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.classList.remove('sunlight');},theme);
  for(const mode of ['before','after']) {
   const override=mode==='before'?await page.addStyleTag({content:'table.statement-lines {table-layout:auto!important} table.statement-lines colgroup {display:none!important} table.statement-lines tbody th[scope="row"] {white-space:nowrap!important;overflow-wrap:normal!important} @media(max-width:735px){table.statement-lines tbody th[scope="row"] {white-space:normal!important}}'}):null;
   const metrics=await page.locator('table.statement-lines').evaluateAll(tables=>tables.map(t=>({width:t.clientWidth,layout:getComputedStyle(t).tableLayout,overflow:t.parentElement.scrollWidth-t.parentElement.clientWidth,columns:[...t.querySelectorAll('thead th')].map(c=>Math.round(c.getBoundingClientRect().right*10)/10)})));
   results.push({width,theme,mode,metrics});
   if([390,1440].includes(width)) await page.locator('article').screenshot({path:`${out}/${mode}-${width}-${theme}.png`});
   if(override) await override.evaluate(el=>el.remove());
  }
 }
}
await page.emulateMedia({media:'print'});
results.push({print:await page.locator('table.statement-lines').evaluateAll(ts=>ts.map(t=>getComputedStyle(t).tableLayout))});
fs.writeFileSync(`${out}/measurements.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.filter(r=>r.width===1440 || r.print)));
await browser.close();
