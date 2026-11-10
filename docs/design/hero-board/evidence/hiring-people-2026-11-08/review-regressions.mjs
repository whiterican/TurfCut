import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const captures=[];const failures=[];
async function authenticate(context,sub){
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+36000})).toString('base64url');
 const token=`${h}.${b}.${createHmac('sha256','local-only-auth-fixture').update(`${h}.${b}`).digest('base64url')}`;
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'local-only',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer',user:{id:sub}})).toString('base64url'),domain:'localhost',path:'/'}]);
}
try{
 for(const width of [390,1440]) for(const theme of ['light','dark']){
  for(const name of ['mixed-work','worker-preview']){
   const context=await browser.newContext({viewport:{width,height:900}});
   await authenticate(context,name==='mixed-work'?'00000000-0000-0000-0000-0000000000aa':'00000000-0000-0000-0000-000000000104');
   await context.addInitScript(t=>localStorage.setItem('turfcut-theme',t),theme);
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.goto(name==='mixed-work'?'http://localhost:3020/zz-preview/hiring-mixed':'http://localhost:3020/profile/preview?as=applied',{timeout:120000});
   await page.evaluate(()=>document.fonts.ready);
   if(name==='mixed-work'){
    const summary=page.locator('summary').filter({hasText:'Scorecard'});
    const text=await summary.innerText();
    assert.match(text,/Petition circulation: 1 verified shift.*20 accepted signatures/);
    assert.match(text,/Door-to-door canvass: 1 verified shift.*40 doors attempted/);
    assert.doesNotMatch(text,/2 verified shifts|7 verified hours/);
    assert.ok(await page.getByText('Coming up: Nov 10: free 9am–3pm.',{exact:true}).first().isVisible());
   }else{
    await page.getByRole('heading',{level:2,name:'What you share with this organization',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'What they share with you now',exact:true}).count(),0);
    assert.ok(await page.getByText('No verified shifts yet',{exact:true}).first().isVisible());
   }
   const measure=await page.evaluate(()=>({height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,interLoaded:[...document.fonts].some(f=>/Inter/i.test(f.family)&&f.status==='loaded')}));
   assert.equal(measure.overflow,0);assert.ok(measure.interLoaded);
   await page.screenshot({caret:'initial',path:new URL(`${name}-${width}-${theme}-viewport.png`,import.meta.url).pathname});
   await page.screenshot({caret:'initial',path:new URL(`${name}-${width}-${theme}.png`,import.meta.url).pathname,fullPage:true,style:`.tabbar{position:absolute!important;top:${Math.max(0,measure.height-84)}px!important;bottom:auto!important;transform:none!important}.site-header{position:relative!important;top:0!important;width:100%!important}`});
   assert.deepEqual(errors,[]);captures.push({name,width,theme,...measure,errors});
   await context.close();
  }
 }
}catch(e){failures.push(String(e));throw e;}
finally{writeFileSync(new URL('review-regressions-manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture:'mixed-work uses an ignored local route rendering the real OrgProfileSections with two synthetic computed shifts and date-only availability; worker-preview is the real guarded route with local worker104 and synthetic loopback auth. No production data or authentication coverage claimed.',captures,failures},null,2)+'\n');await browser.close();}
