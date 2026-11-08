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
export async function longest(select){return select.evaluate(s=>{
 const style=getComputedStyle(s);const c=document.createElement('canvas').getContext('2d');c.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
 return [...s.options].map(o=>({value:o.value,text:o.text,width:c.measureText(o.text).width})).sort((a,b)=>b.width-a.width)[0];
});}
