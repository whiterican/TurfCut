import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,count,longest,readable,capture} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-applicants-cases.json','utf8'));
const browser=await launch();const results=[];const failures=[];
try{
 for(const theme of ['light','dark']){
  const context=await ownerContext(browser,768,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(`${base}/hiring/${fixture.jobId}/applicants?stage=open`,{timeout:120000});await count(page,0);
  await page.getByRole('checkbox',{name:`Select ${fixture.workers[0].displayName}`,exact:true}).check();await count(page,1);
  const form=page.locator('#applicants-bulk');await form.locator('select[name=bulk]').selectOption('decline');
  const reason=form.locator('select[name=reasonCode]');const option=await longest(reason);await reason.selectOption(option.value);
  await form.locator('textarea[name=note]').fill('Local read-only tablet viewport fixture');
  for(const size of [{width:768,height:1024},{width:1024,height:768}]){
   await page.setViewportSize(size);await count(page,1);
   assert.equal(await reason.inputValue(),option.value);assert.equal(await form.locator('select[name=bulk]').inputValue(),'decline');
   assert.equal(await form.locator('textarea[name=note]').inputValue(),'Local read-only tablet viewport fixture');
   const stageMeasurement=await readable(page.locator('select[name=stage]'));const reasonMeasurement=await readable(reason);
   assert.ok(await page.locator('[data-inspector]').isHidden() || await page.locator('[data-inspector]').count()===0);
   await page.evaluate(()=>scrollTo(0,0));const measurement=await capture(page,`tablet-${size.width}-${theme}`);
   assert.deepEqual(errors,[]);results.push({...measurement,viewportWidth:size.width,viewportHeight:size.height,theme,stageMeasurement,reasonMeasurement,selected:1,errors:[...errors]});
  }
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('tablet-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Read-only Applicants viewport sweep: same selected native controls remain mounted while resizing. Chromium DPR1, not native iPad/Safari/touch coverage or an app-wide tablet signoff. No server mutation submitted.',results,failures},null,2)+'\n');await browser.close();}
