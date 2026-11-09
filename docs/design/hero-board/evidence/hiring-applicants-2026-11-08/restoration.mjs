import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,count,capture} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-applicants-cases.json','utf8'));
const browser=await launch();const results=[];const failures=[];
try{
 for(const width of [390,1440])for(const theme of ['light','dark']){
  const context=await ownerContext(browser,width,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(`${base}/hiring/${fixture.jobId}/applicants`,{timeout:120000});await count(page,0);
  const form=page.locator('#applicants-bulk');const box=page.getByRole('checkbox',{name:`Select ${fixture.workers[0].displayName}`,exact:true});
  // Simulate the restoration contract deterministically: a property write, no change event/attribute mutation.
  const before=await box.getAttribute('checked');await box.evaluate(e=>{e.checked=true});
  assert.equal(await box.getAttribute('checked'),before);assert.ok(await box.isChecked());
  assert.ok(await form.locator('fieldset').isHidden());await count(page,0);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await count(page,1);assert.ok(await form.locator('fieldset').isVisible());
  await box.evaluate(e=>{e.checked=false});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await count(page,0);assert.ok(await form.locator('fieldset').isHidden());
  // Exercise a route unmount/remount before another restoration notification.
  await page.getByRole('link',{name:'Job page',exact:true}).click();await page.waitForURL(`**/jobs/${fixture.jobId}`);
  await page.goBack();await page.waitForURL(`**/hiring/${fixture.jobId}/applicants`);
  await page.locator('#applicants-bulk').waitFor();
  await box.evaluate(e=>{e.checked=true});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await count(page,1);assert.ok(await form.locator('fieldset').isVisible());
  const measurement=await capture(page,`restored-selection-${width}-${theme}`);
  assert.deepEqual(errors,[]);results.push({width,theme,...measurement,errors,checks:['property-only restoration syncs on pageshow','restored unchecked state collapses controls','route return subscribes again']});
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('restoration-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Deterministic Chromium property-only checkbox restoration plus synthetic persisted pageshow; actual route navigation/back also exercised. Not a claim of native BFCache restoration across browsers. No server mutation submitted.',results,failures},null,2)+'\n');await browser.close();}
