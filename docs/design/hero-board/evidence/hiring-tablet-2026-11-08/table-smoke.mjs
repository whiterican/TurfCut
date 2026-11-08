import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext} from './browser-fixture.mjs';
const browser=await launch();const results=[];const failures=[];
try{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await ownerContext(browser,width,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(base+'/hiring',{timeout:120000});await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
  const measurements=[];
  for(const button of await page.locator('.data-table-sort').all()){
   const m=await button.evaluate(b=>{
    b.focus({preventScroll:true});const r=b.getBoundingClientRect();const w=b.closest('.data-table-wrap').getBoundingClientRect();
    return {label:b.textContent.trim(),left:r.left,right:r.right,wrapLeft:w.left,wrapRight:w.right};
   });assert.ok(m.left>=m.wrapLeft&&m.right<=m.wrapRight,m.label);measurements.push(m);
  }
  const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,interLoaded:[...document.fonts].some(f=>/Inter/i.test(f.family)&&f.status==='loaded')}));
  assert.equal(m.overflow,0);assert.ok(m.interLoaded);assert.deepEqual(errors,[]);
  await page.screenshot({caret:'initial',path:new URL(`table-smoke-${width}-${theme}.png`,import.meta.url).pathname});
  results.push({width,theme,...m,measurements,errors});await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('table-smoke-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Actual Pipeline route; native sort buttons remain inside their table scrollport at320/390/1440 in both themes. No mutations submitted.',results,failures},null,2)+'\n');await browser.close();}
