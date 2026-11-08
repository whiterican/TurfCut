import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,count} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-applicants-cases.json','utf8'));
const browser=await launch();const results=[];const failures=[];
try{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await ownerContext(browser,width,theme);const page=await context.newPage();
  await page.goto(`${base}/hiring/${fixture.jobId}/applicants?selected=${fixture.workers[0].engagementId}`);await count(page,0);
  await page.getByRole('checkbox',{name:`Select ${fixture.workers[0].displayName}`,exact:true}).check();await count(page,1);
  await page.locator('summary').filter({hasText:'Columns and filters'}).first().click();
  if(width===1440)await page.locator('[data-inspector] summary').filter({hasText:'Not selected'}).click();
  const targets=[];
  for(const target of await page.locator('main .btn-sm, #applicants-bulk button').all()){
   if(!await target.isVisible())continue;
   await target.evaluate(e=>e.scrollIntoView({block:'center'}));
   const m=await target.evaluate(e=>{
    const r=e.getBoundingClientRect();const x=r.left+r.width/2;const hits=[];
    for(let y=r.top-8;y<=r.bottom+8;y+=0.25){const n=document.elementFromPoint(x,y);if(n&&(n===e||e.contains(n)))hits.push(y);}
    return {text:e.textContent,visibleHeight:r.height,hitHeight:hits.length?hits.at(-1)-hits[0]+0.25:0};
   });assert.ok(m.hitHeight>=44,`${m.text}: ${m.hitHeight}px`);targets.push(m);
  }
  results.push({width,theme,targets});await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('targets-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),note:'Only scoped small actions and the bulk submit button are measured. Native checkboxes and inherited filter chips are unchanged, not claimed as44px.',results,failures},null,2)+'\n');await browser.close();}
