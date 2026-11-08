import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {base,launch,ownerContext,longest} from './browser-fixture.mjs';
const fixture=JSON.parse(readFileSync(process.env.CASES_PATH||'/tmp/turfcut-applicants-cases.json','utf8'));
const people=JSON.parse(readFileSync(process.env.PEOPLE_PATH||'/tmp/turfcut-people-cases.json','utf8'));
const job=fixture.jobId;
const routes=[
 {name:'pipeline',route:'/hiring'},
 {name:'new-job',route:'/jobs/new'},
 {name:'job-page',route:`/jobs/${job}`},
 {name:'applicants',route:`/hiring/${job}/applicants?selected=${fixture.workers[0].engagementId}`},
 {name:'matches',route:`/hiring/${job}/matches`},
 {name:'invitations',route:`/hiring/${job}/invites`},
 ...people.filter(x=>['candidate-withheld','candidate-partial','worker-shared','worker-withheld'].includes(x.name)),
];
const browser=await launch();const captures=[];const findings=[];const failures=[];
async function record(page,name,size,theme,errors,extra={}){
 await page.evaluate(()=>document.fonts.ready);
 const m=await page.evaluate(()=>{
  const visible=e=>e.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true});
  const selects=[...document.querySelectorAll('main select')].filter(visible).map(s=>{
   const st=getComputedStyle(s);const c=document.createElement('canvas').getContext('2d');c.font=st.font||`${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
   const text=s.selectedOptions[0]?.text||'';const textWidth=c.measureText(text).width;const available=s.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight)-24;
   const helper=s.nextElementSibling?.getAttribute('aria-hidden')==='true'?s.nextElementSibling.textContent:null;
   return {name:s.name,text,textWidth,available,caption:helper,clippedWithoutCaption:textWidth>available&&helper!==text};
  });
  const smallTargets=[...document.querySelectorAll('main .btn-sm')].filter(visible).map(e=>({text:e.textContent.trim(),height:e.getBoundingClientRect().height}));
  const panel=document.querySelector('main[data-panel=inspector] .tpl-panel');
  return {documentHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,interLoaded:[...document.fonts].some(f=>/Inter/i.test(f.family)&&f.status==='loaded'),selects,smallTargets,inspectorVisible:!!(panel&&visible(panel)),template:document.querySelector('main')?.dataset.template,title:document.querySelector('h1')?.textContent};
 });
 assert.ok(m.interLoaded,name);assert.ok(m.title,name);
 if(m.overflow>0)findings.push({name,...size,theme,kind:'horizontal-page-overflow',pixels:m.overflow});
 for(const s of m.selects)if(s.clippedWithoutCaption)findings.push({routeName:name,...size,theme,kind:'selected-native-label-width-risk',...s});
 if(errors.length)failures.push({name,...size,theme,errors:[...errors]});
 const stem=`${name}-${size.width}-${theme}`;
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({caret:'initial',path:new URL(stem+'-viewport.png',import.meta.url).pathname});
 await page.screenshot({caret:'initial',path:new URL(stem+'.png',import.meta.url).pathname,fullPage:true,style:`.tabbar{position:absolute!important;top:${Math.max(0,m.documentHeight-84)}px!important;bottom:auto!important;transform:none!important}.site-header{position:relative!important;top:0!important;width:100%!important}`});
 captures.push({name,route:new URL(page.url()).pathname+new URL(page.url()).search,...size,theme,...m,errors:[...errors],...extra});
}
try{
 for(const theme of ['light','dark'])for(const route of routes){
  const context=await ownerContext(browser,768,theme);const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewportSize({width:768,height:1024});
  const response=await page.goto(base+route.route,{timeout:120000});assert.equal(response.status(),200,route.name);
  assert.equal(new URL(page.url()).pathname,new URL(base+route.route).pathname,'unexpected redirect');
  await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(route.name==='applicants'){
   const summary=page.locator('summary').filter({hasText:'Columns and filters'}).first();await summary.click();
   const stage=page.locator('select[name=stage]');await stage.selectOption('open');
   // GET filter submission is the only form submit in this audit.
   await page.getByRole('button',{name:'Show',exact:true}).click();await page.waitForURL('**stage=open*');
   const reason=page.locator('#applicants-bulk select[name=reasonCode]');
   await page.locator('#applicants-bulk select[name=bulk]').selectOption('decline');await reason.waitFor();
   await reason.selectOption((await longest(reason)).value);
  }
  if(route.name==='candidate-withheld'||route.name==='candidate-partial'){
   const summaries=page.locator('main summary');
   for(const summary of await summaries.all()){
    if(/When they applied|When you invited/.test(await summary.innerText()))await summary.click();
   }
  }
  for(const size of [{width:768,height:1024},{width:1024,height:768}]){
   await page.setViewportSize(size);await record(page,route.name,size,theme,errors,{resizedWithoutReload:true});
   if(route.name==='applicants')assert.ok(await page.locator('main .tpl-panel').isHidden(),'organization inspector stays hidden below1280');
  }
  await context.close();
 }
}catch(e){failures.push(String(e));throw e;}
finally{
 writeFileSync(new URL('manifest.json',import.meta.url),JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base:'master ea9f5d8; excludes unmerged130/131/132/133',scope:'Read-only local hiring audit, Chromium DPR1 mouse/keyboard, not native iPad/Safari/touch or app-wide signoff. No mutation action submitted; Applicants filter uses GET. Viewports are resized on the same page without reload.',fixture,routes,captures,findings,failures},null,2)+'\n');await browser.close();
}
