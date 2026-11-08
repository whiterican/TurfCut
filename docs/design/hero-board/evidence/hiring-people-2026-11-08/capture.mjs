import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const cases=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-people-cases.json','utf8'));
const base=process.env.PREVIEW_URL||'http://localhost:3020';
assert.ok(new URL(base).hostname==='localhost','local-only auth fixture');
const out=new URL('./',import.meta.url);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const captures=[];const interactions=[];const failures=[];
const sub='00000000-0000-0000-0000-0000000000aa';
function authToken(){const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({sub,aud:'authenticated',role:'authenticated',iss:'http://127.0.0.1:55521/auth/v1',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+36000})).toString('base64url');return `${h}.${p}.${createHmac('sha256','local-only-auth-fixture').update(`${h}.${p}`).digest('base64url')}`;}
async function measure(page){return page.evaluate(()=>({
 height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,
 interLoaded:[...document.fonts].some(f=>/Inter/i.test(f.family)&&f.status==='loaded'),
 title:document.querySelector('h1')?.textContent,
 activeNav:[...document.querySelectorAll('nav [aria-current]')].map(e=>({text:e.textContent,href:e.getAttribute('href'),current:e.getAttribute('aria-current')})),
 disclosures:[...document.querySelectorAll('main details')].map(d=>({summary:d.querySelector('summary')?.textContent,open:d.open})),
}));}
async function capture(page,name,width,theme,state,errors){
 const m=await measure(page);assert.equal(m.overflow,0,`${name} overflow`);assert.ok(m.interLoaded);
 const stem=`${name}-${width}-${theme}${state?'-'+state:''}`;
 await page.screenshot({caret:'initial',path:new URL(stem+'-viewport.png',out).pathname});
 // For full-height exports only, place the fixed dock at the page's end.
 // Viewport images keep its real fixed position and behavior.
 const top=Math.max(0,m.height-84);
 await page.screenshot({caret:'initial',path:new URL(stem+'.png',out).pathname,fullPage:true,style:`.tabbar{position:absolute!important;top:${top}px!important;bottom:auto!important;transform:none!important}.site-header{position:relative!important;top:0!important;width:100%!important}`});
 captures.push({name,width,theme,state,...m,errors:[...errors]});
}
try{
 for(const width of [390,1440]) for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===1440?900:844},deviceScaleFactor:1});
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:authToken(),refresh_token:'local-only',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer',user:{id:sub}})).toString('base64url'),domain:'localhost',path:'/'}]);
  await context.addInitScript(t=>localStorage.setItem('turfcut-theme',t),theme);
  const page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  for(const fixture of cases){
   errors=[];await page.goto(base+fixture.route,{timeout:120000});await page.evaluate(()=>document.fonts.ready);
   await page.locator('.tabbar').waitFor({state:'attached'});
   assert.equal(new URL(page.url()).pathname,fixture.route,'guarded local route must render');
   await capture(page,fixture.name,width,theme,'',errors);
   if(fixture.name.includes('withheld')){
    const shared=page.getByRole('heading',{name:'What they share with you now',exact:true}).locator('..');
    assert.equal(await shared.locator('details').count(),0,'withheld parts must not expand');
    assert.equal(await shared.locator('.status-not-shared').count(),5);
   }
   if(fixture.name==='candidate-partial'||fixture.name==='worker-partial'){
    const summary=page.locator('summary').filter({hasText:'Political fit'});
    assert.match(await summary.innerText(),/2 of 4 fields shared/);
    await summary.focus();await page.keyboard.press('Enter');
    assert.ok(await summary.evaluate(s=>s.parentElement.open));
    assert.ok(await summary.locator('..').getByText('Party relationship',{exact:true}).isVisible());
    await capture(page,fixture.name,width,theme,'fit-open',errors);
    interactions.push({name:fixture.name,width,theme,check:'native keyboard opens partial-fit disclosure, all fields retained'});
   }
   if(fixture.name==='candidate-hired'||fixture.name==='worker-shared'){
    const summary=page.locator('summary').filter({hasText:'Scorecard'});
    await summary.click();await capture(page,fixture.name,width,theme,'scorecard-open',errors);
   }
   if(fixture.name==='candidate-not-selected'){
    const snapshot=page.locator('summary').filter({hasText:/When they applied|When you invited them/});
    await snapshot.focus();await page.keyboard.press('Enter');
    assert.ok(await snapshot.evaluate(s=>s.parentElement.open));
    await capture(page,fixture.name,width,theme,'snapshot-open',errors);
    interactions.push({name:fixture.name,width,theme,check:'native keyboard opens retained snapshot'});
   }
   assert.deepEqual(errors,[]);
  }
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('manifest.json',out),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture:'Real guarded routes and local PostgreSQL c3 fixtures; synthetic loopback auth returns only the selected local user. This exercises app session/profile/grant code, not production Supabase authentication. Sam all-withheld and Riley partial fit are explicit synthetic sharing choices. No production access.',cases,captures,interactions,failures},null,2)+'\n');await browser.close();}
