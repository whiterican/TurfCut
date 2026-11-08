import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const cases=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-people-cases.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];const failures=[];
try{
 for(const width of [320,390,1440]) for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900}});
  const sub='00000000-0000-0000-0000-0000000000aa';
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const b=Buffer.from(JSON.stringify({sub,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+36000})).toString('base64url');
  const token=`${h}.${b}.${createHmac('sha256','local-only-auth-fixture').update(`${h}.${b}`).digest('base64url')}`;
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'local-only',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer',user:{id:sub}})).toString('base64url'),domain:'localhost',path:'/'}]);
  await context.addInitScript(t=>localStorage.setItem('turfcut-theme',t),theme);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const fixture=cases.find(x=>x.name==='candidate-withheld');
  await page.goto('http://localhost:3020'+fixture.route);await page.evaluate(()=>document.fonts.ready);
  await page.locator('.tabbar').waitFor({state:'attached'});
  const targets=[];
  for(const el of await page.locator('main .btn-sm').all()){
   if(!await el.isVisible())continue;
   await el.scrollIntoViewIfNeeded();
   const hit=await el.evaluate(button=>{
    const r=button.getBoundingClientRect();const x=r.left+r.width/2;const ys=[];
    for(let y=r.top-8;y<=r.bottom+8;y+=0.25){const hit=document.elementFromPoint(x,y);if(hit&&(hit===button||button.contains(hit)))ys.push(y);}
    return {label:button.textContent,visibleHeight:r.height,hitHeight:ys.length?ys.at(-1)-ys[0]+0.25:0};
   });
   assert.ok(hit.hitHeight>=44,`${hit.label}: ${hit.hitHeight}px target`);targets.push(hit);
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.equal(overflow,0);
  assert.deepEqual(errors,[]);
  const denied=await page.goto('http://localhost:3020/workers/00000000-0000-0000-0000-000000000105');
  assert.equal(await page.getByRole('heading',{name:'Former worker',exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'What they share with you now'}).count(),0);
  assert.ok(errors.every(e=>e.includes('404')), 'only the expected refused-route HTTP404 may be logged');
  const other='00000000-0000-0000-0000-0000000000cc';
  const otherBody=Buffer.from(JSON.stringify({sub:other,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+36000})).toString('base64url');
  const otherToken=`${h}.${otherBody}.${createHmac('sha256','local-only-auth-fixture').update(`${h}.${otherBody}`).digest('base64url')}`;
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:otherToken,refresh_token:'local-only',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer',user:{id:other}})).toString('base64url'),domain:'localhost',path:'/'}]);
  await page.goto('http://localhost:3020/workers/00000000-0000-0000-0000-000000000101');
  await page.getByText("This profile isn't available",{exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'What they share with you now'}).count(),0);
  await page.screenshot({caret:'initial',path:new URL(`worker-denied-${width}-${theme}.png`,import.meta.url).pathname,fullPage:true});
  results.push({width,theme,targets,overflow,deniedWorker:{status:denied.status(),check:'closed-account route renders no live profile or worker name; not-found may be streamed with HTTP200'},unrelatedOrg:'explicit profile refusal and no shared data under a different local organization owner',errors});
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('interactions-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture:'Same isolated local database and synthetic auth as capture.mjs; pointer targets measured at quarter-pixel intervals with elementFromPoint.',results,failures},null,2)+'\n');await browser.close();}
