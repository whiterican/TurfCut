import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,count,longest,readable,capture} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-applicants-cases.json','utf8'));
const browser=await launch();const captures=[];const failures=[];
try{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await ownerContext(browser,width,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const route=`${base}/hiring/${fixture.jobId}/applicants`;
  async function shot(state,detail={}){await page.evaluate(()=>scrollTo(0,0));const m=await capture(page,`${state}-${width}-${theme}`);assert.deepEqual(errors,[]);captures.push({state,width,theme,...m,...detail,errors:[...errors]});}
  await page.goto(route,{timeout:120000});await count(page,0);
  const form=page.locator('#applicants-bulk');assert.ok(await form.locator('fieldset').isHidden());
  const meta=await page.locator('.page-header .text-muted-sm').innerText();
  await shot('none-selected',{meta});
  const a=page.getByRole('checkbox',{name:`Select ${fixture.workers[0].displayName}`,exact:true});
  const b=page.getByRole('checkbox',{name:`Select ${fixture.workers[1].displayName}`,exact:true});
  await a.check();await count(page,1);await shot('one-selected');
  await b.check();await count(page,2);await shot('two-selected');
  await b.uncheck();await count(page,1);await form.locator('select[name=bulk]').selectOption('decline');
  const reason=form.locator('select[name=reasonCode]');const option=await longest(reason);await reason.selectOption(option.value);await shot('bulk-long-reason',{selection:await readable(reason)});
  await page.goto(route);await count(page,0);
  const filters=page.locator('details').filter({hasText:'Columns and filters'}).first();await filters.locator('summary').first().click();
  const stage=filters.locator('select[name=stage]');await stage.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await stage.inputValue(),'open');await filters.getByRole('button',{name:'Show',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('stage')==='open');
  await shot('long-stage-filter',{selection:await readable(page.locator('select[name=stage]'))});
  await page.goto(`${route}?since=2099-12-31`);await page.getByText('No applicants match these filters.',{exact:true}).waitFor();
  assert.equal(await page.locator('.page-header .text-muted-sm').innerText(),meta);assert.equal(await page.locator('#applicants-bulk').count(),0);
  await shot('filtered-empty',{meta});
  if(fixture.emptyJob){
   await page.goto(`${base}/hiring/${fixture.emptyJob.id}/applicants`);await page.getByText('Nobody has applied yet',{exact:true}).waitFor();
   const emptyMeta=await page.locator('.page-header .text-muted-sm').innerText();assert.match(emptyMeta,/^0 applicants/);assert.equal(await page.locator('#applicants-bulk').count(),0);
   await shot('empty',{meta:emptyMeta});
  }
  await page.goto(`${route}?selected=${fixture.workers[0].engagementId}`);
  const inspector=page.locator('[data-inspector]');
  if(width===1440){
   await inspector.waitFor({state:'visible'});assert.equal(await inspector.getByText('Political fit',{exact:true}).count(),0);await shot('inspector');
   await inspector.locator('summary').filter({hasText:'Not selected'}).click();
   const select=inspector.locator('select[name=reasonCode]');const longestReason=await longest(select);await select.selectOption(longestReason.value);
   await shot('inspector-long-reason',{selection:await readable(select)});
  }else assert.ok(await inspector.isHidden());
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture,captures,failures},null,2)+'\n');await browser.close();}
