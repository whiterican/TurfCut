import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
export const base='http://localhost:3020';
export async function launch(){return chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});}
export async function ownerContext(browser,width=390,theme='light'){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},deviceScaleFactor:1});
 const sub='00000000-0000-0000-0000-0000000000aa';
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+36000})).toString('base64url');
 const token=`${h}.${b}.${createHmac('sha256','local-only-auth-fixture').update(`${h}.${b}`).digest('base64url')}`;
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:token,refresh_token:'local-only',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,token_type:'bearer',user:{id:sub}})).toString('base64url'),domain:'localhost',path:'/'}]);
 await context.addInitScript(t=>localStorage.setItem('turfcut-theme',t),theme);return context;
}
export async function count(page,n){await page.waitForFunction(n=>document.querySelector('#applicants-bulk > p')?.textContent===`${n} selected`,n);}
export async function longest(select){return select.evaluate(s=>{
 const style=getComputedStyle(s);const c=document.createElement('canvas').getContext('2d');c.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
 return [...s.options].map(o=>({value:o.value,text:o.text,width:c.measureText(o.text).width})).sort((a,b)=>b.width-a.width)[0];
});}
export async function readable(select){
 await select.page().evaluate(()=>document.fonts.ready);
 await select.page().waitForFunction(s=>{
  const st=getComputedStyle(s);const c=document.createElement('canvas').getContext('2d');c.font=st.font||`${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
  const text=s.selectedOptions[0].text;const available=s.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight)-24;
  return c.measureText(text).width<=available || (s.nextElementSibling?.getAttribute('aria-hidden')==='true' && s.nextElementSibling.textContent===text);
 },await select.elementHandle());const m=await select.evaluate(s=>{
 const style=getComputedStyle(s);const c=document.createElement('canvas').getContext('2d');c.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
 const helper=s.nextElementSibling?.getAttribute('aria-hidden')==='true'?s.nextElementSibling:null;
 return {text:s.selectedOptions[0].text,width:c.measureText(s.selectedOptions[0].text).width,available:s.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-24,helper:helper?.textContent||null,helperOverflow:helper?helper.scrollWidth-helper.clientWidth:0};
 });if(m.width>m.available)assert.equal(m.helper,m.text);assert.equal(m.helperOverflow,0);return m;}
export async function capture(page,name){
 await page.evaluate(()=>document.fonts.ready);const m=await page.evaluate(()=>({height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,interLoaded:[...document.fonts].some(f=>/Inter/i.test(f.family)&&f.status==='loaded')}));assert.equal(m.overflow,0,name);assert.ok(m.interLoaded);
 await page.screenshot({caret:'initial',path:new URL(name+'-viewport.png',import.meta.url).pathname});
 await page.screenshot({caret:'initial',path:new URL(name+'.png',import.meta.url).pathname,fullPage:true,style:`.tabbar{position:absolute!important;top:${Math.max(0,m.height-84)}px!important;bottom:auto!important;transform:none!important}.site-header{position:relative!important;top:0!important;width:100%!important}`});return m;
}
