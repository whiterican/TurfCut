import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,longest} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(new URL('applicants-cases.json',import.meta.url),'utf8'));
const browser=await launch();const results=[];const failures=[];
try{
 for(const theme of ['light','dark'])for(const size of [{width:768,height:1024},{width:1024,height:768}]){
  const context=await ownerContext(browser,size.width,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewportSize(size);await page.goto(`${base}/hiring/${fixture.jobId}/applicants`,{timeout:120000});
  await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);
  const navs=page.getByRole('navigation',{name:'Main',exact:true});const visibleNavs=[];
  for(const nav of await navs.all())if(await nav.isVisible())visibleNavs.push(nav);
  assert.equal(visibleNavs.length,1,'one visible main navigation');
  const nav=visibleNavs[0];const isDock=await nav.evaluate(e=>e.classList.contains('tabbar'));
  assert.equal(isDock,size.width===768,'dock at768, organization rail at1024');
  let moreDialog=null;
  if(isDock){
   const more=nav.getByRole('button',{name:'More',exact:true});await more.focus();await page.keyboard.press('Enter');
   await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
   assert.ok(await page.getByRole('dialog').isHidden());assert.ok(await more.evaluate(e=>e===document.activeElement));moreDialog='Enter opens; Escape closes and restores trigger focus';
  }
  const summary=page.locator('summary').filter({hasText:'Columns and filters'}).first();
  await summary.focus();await page.keyboard.press('Space');assert.ok(await summary.evaluate(e=>e.parentElement.open));
  const stage=page.locator('select[name=stage]');await stage.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await stage.inputValue(),'open');
  await page.getByRole('button',{name:'Show',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForURL('**stage=open*');await page.waitForLoadState('networkidle');
  const bulk=page.locator('#applicants-bulk select[name=bulk]');await bulk.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await bulk.inputValue(),'decline');
  const reason=page.locator('#applicants-bulk select[name=reasonCode]');const option=await longest(reason);
  const index=await reason.evaluate((s,value)=>[...s.options].findIndex(o=>o.value===value),option.value);
  await reason.focus();await page.keyboard.press('Home');
  // Home skips the disabled placeholder; start from the first enabled option.
  const first=await reason.evaluate(s=>[...s.options].findIndex(o=>o.value===s.value));
  for(let i=first;i<index;i++)await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');assert.equal(await reason.inputValue(),option.value);
  const focusStops=[];await summary.focus();
  for(let i=0;i<50;i++){
   await page.keyboard.press('Tab');
   const m=await page.evaluate(()=>{
    const e=document.activeElement;if(!e||e===document.body)return null;
    const r=e.getBoundingClientRect();const x=r.left+r.width/2;const y=r.top+r.height/2;const top=document.elementFromPoint(x,y);const st=getComputedStyle(e);
    return {tag:e.tagName,name:e.getAttribute('name'),text:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,80),inMain:!!e.closest('main'),visible:e.checkVisibility({visibilityProperty:true}),inViewport:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,centerUncovered:!!top&&(top===e||e.contains(top)),blocker:top?{tag:top.tagName,className:top.className,text:top.textContent?.trim().slice(0,80)}:null,rect:{x:r.x,y:r.y,width:r.width,height:r.height},fragments:[...e.getClientRects()].map(f=>{const n=document.elementFromPoint(f.left+f.width/2,f.top+f.height/2);return {uncovered:!!n&&(n===e||e.contains(n)),inViewport:f.top>=0&&f.bottom<=innerHeight&&f.left>=0&&f.right<=innerWidth};}),focusVisible:e.matches(':focus-visible'),outlineStyle:st.outlineStyle,outlineWidth:st.outlineWidth};
   });if(m){focusStops.push(m);if(m.inMain&&m.tag!=='DIV'&&!m.fragments.some(f=>f.uncovered&&f.inViewport))await page.screenshot({caret:'initial',path:new URL(`keyboard-observation-${size.width}-${theme}-${i}.png`,import.meta.url).pathname});}
  }
  const observations=focusStops.filter(m=>m.inMain&&m.tag!=='DIV'&&(!m.visible||!m.fragments.some(f=>f.uncovered&&f.inViewport)));
  assert.deepEqual(observations,[],'all sampled main controls have an uncovered visible fragment');
  let horizontalOnly=null;
  if(size.width===1024){
   horizontalOnly=await page.locator('.data-table-wrap').evaluate(w=>{
    w.focus({preventScroll:true});w.scrollLeft=w.scrollWidth;
    const before={x:w.scrollLeft,tableY:w.scrollTop,pageY:scrollY};
    w.querySelector('thead button').focus({preventScroll:true});
    return {before,after:{x:w.scrollLeft,tableY:w.scrollTop,pageY:scrollY}};
   });
   assert.ok(horizontalOnly.after.x<horizontalOnly.before.x,'focus reveals the leftmost sort after rightward scrolling');
   assert.equal(horizontalOnly.after.tableY,horizontalOnly.before.tableY);assert.equal(horizontalOnly.after.pageY,horizontalOnly.before.pageY);
  }
  await reason.focus();await reason.evaluate(e=>e.scrollIntoView({block:'center'}));
  await page.screenshot({caret:'initial',path:new URL(`keyboard-${size.width}-${theme}.png`,import.meta.url).pathname});
  assert.deepEqual(errors,[]);results.push({...size,theme,isDock,moreDialog,selectedReason:option.text,checks:['native summary Space toggle','stage Home/ArrowDown/Enter selection and Enter GET submission','bulk Home/ArrowDown/Enter selects decline','longest reason reached with native keyboard'],focusStops,observations,horizontalOnly,errors});await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('keyboard-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Read-only Chromium desktop keyboard at tablet viewport sizes; no mutation action submitted. Fifty Tab steps per case are sampled observations, not an exhaustive accessibility or native iPad keyboard certification.',results,failures},null,2)+'\n');await browser.close();}
