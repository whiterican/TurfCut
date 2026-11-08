import http from 'node:http';
import {createRequire} from 'node:module';
const {WebSocketServer}=createRequire(import.meta.url)('next/dist/compiled/ws');
// Local-only auth fixture: NOT an authentication implementation or security test.
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.writeHead(200);res.end('{}');return;}
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  let sub;try{sub=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub;}catch{}
  if(req.url?.split('?')[0]==='/auth/v1/user' && sub){res.end(JSON.stringify({id:sub,aud:'authenticated',role:'authenticated',email:'owner@local.example',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}));return;}
  res.writeHead(404);res.end(JSON.stringify({message:'Local fixture endpoint not implemented'}));
});
// No-op local realtime channel: acknowledge subscriptions/heartbeats only.
// This is fixture transport, not message delivery or realtime acceptance coverage.
const realtime=new WebSocketServer({server,path:'/realtime/v1/websocket'});
realtime.on('connection',socket=>socket.on('message',raw=>{
  let m;try{m=JSON.parse(raw.toString());}catch{return;}
  if(Array.isArray(m)){
    const [join,ref,topic,event]=m;
    if(['phx_join','heartbeat','phx_leave'].includes(event))socket.send(JSON.stringify([join,ref,topic,'phx_reply',{status:'ok',response:event==='phx_join'?{postgres_changes:[]}: {}}]));
  }else if(['phx_join','heartbeat','phx_leave'].includes(m.event)){
    socket.send(JSON.stringify({topic:m.topic,event:'phx_reply',ref:m.ref,join_ref:m.join_ref,payload:{status:'ok',response:m.event==='phx_join'?{postgres_changes:[]}: {}}}));
  }
}));
server.listen(55521,'127.0.0.1',()=>console.log('Local auth/realtime fixture on 127.0.0.1:55521'));
