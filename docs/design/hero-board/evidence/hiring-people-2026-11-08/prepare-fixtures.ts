import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { saveSharing } from "@/lib/sharing-data";
import { DEFAULT_SHARING, SHARE_PARTS } from "@/lib/sharing";
import { savePreferences } from "@/lib/political-fit-data";
import { loadPipelineFacts } from "@/lib/engagements-data";
const p=db();
const orgId="00000000-0000-0000-0000-000000000001";
const sam="00000000-0000-0000-0000-000000000103";
const riley="00000000-0000-0000-0000-000000000104";
async function main(){
 const databaseUrl=new URL(process.env.DATABASE_URL || '');
 if(!['localhost','127.0.0.1'].includes(databaseUrl.hostname) || databaseUrl.port!=='55438' || databaseUrl.pathname!=='/turfcut_acc_c3') throw Error('Local Codex DB only');
 const r=await saveSharing(sam,sam,{...DEFAULT_SHARING,audiences:Object.fromEntries(SHARE_PARTS.map(k=>[k,'NOBODY']))});if(!r.ok)throw Error(JSON.stringify(r));
 await savePreferences(riley,riley,{visibilityMode:'APPLIED_TO',identityLabels:[{label:'independent',shared:true}],partyRelationship:{relationship:'no_affiliation',shared:true},issuePositions:{},campaignBoundaries:[]},null);
 const rows=await p.engagement.findMany({where:{job:{orgId}},include:{worker:true,job:true},orderBy:{createdAt:'asc'}});
 const facts=await loadPipelineFacts(rows.map(e=>e.id));
 const pick=(name:string, pred:(e:typeof rows[number])=>boolean, note:string)=>{const e=rows.find(pred);if(!e)throw Error('Missing '+name);return{name,route:`/hiring/${e.jobId}/people/${e.id}`,workerId:e.workerId,note};};
 const now=Date.now();
 const cases=[
 pick('candidate-withheld',e=>e.workerId===sam&&e.status==='APPLIED','Local Sam fixture: all sharing audiences set to NOBODY through saveSharing; no production data.'),
 pick('candidate-partial',e=>e.workerId===riley&&e.status==='APPLIED','Synthetic Riley fixture: identity and party relationship shared through versioned savePreferences; other fit fields withheld.'),
 pick('candidate-hired',e=>e.workerId.endsWith('101')&&e.status==='ACTIVE','Base seed verified-work history, unmodified.'),
 pick('candidate-offer-expired',e=>e.status==='OFFERED'&&!!facts.get(e.id)?.offerExpiresAt&&facts.get(e.id)!.offerExpiresAt!.getTime()<now,'Actual expired-offer fixture from c3 acceptance.'),
 pick('candidate-offer',e=>e.status==='OFFERED'&&!!facts.get(e.id)?.offerExpiresAt&&facts.get(e.id)!.offerExpiresAt!.getTime()>now,'Actual open-offer fixture from c3 acceptance.'),
 pick('candidate-invited',e=>e.status==='INVITED'&&!!e.inviteExpiresAt&&e.inviteExpiresAt.getTime()>now,'Actual invitation fixture; profile availability follows current relationship/sharing loader.'),
 pick('candidate-invite-expired',e=>e.status==='INVITED'&&!!e.inviteExpiresAt&&e.inviteExpiresAt.getTime()<now,'Actual expired-invitation fixture from c3 acceptance.'),
 pick('candidate-not-selected',e=>e.status==='DECLINED'&&!e.worker.closedAt,'Actual declined engagement; other relationships may keep the live profile open.'),
 pick('candidate-closed-account',e=>!!e.worker.closedAt,'Actual closed-account fixture; shows retained history and snapshot only.'),
 ];
 cases.push({name:'worker-shared',route:`/workers/00000000-0000-0000-0000-000000000101`,workerId:'00000000-0000-0000-0000-000000000101',note:'Base seed shared profile.'});
 cases.push({name:'worker-withheld',route:`/workers/${sam}`,workerId:sam,note:'Local all-withheld sharing fixture.'});
 cases.push({name:'worker-partial',route:`/workers/${riley}`,workerId:riley,note:'Synthetic partial-sharing preference fixture.'});
 writeFileSync(process.env.CASES_PATH || '/tmp/turfcut-people-cases.json',JSON.stringify(cases,null,2));console.log(cases.map(x=>x.name).join('\n'));
}
main().finally(()=>p.$disconnect());
