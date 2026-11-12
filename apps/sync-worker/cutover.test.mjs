// Process-items cutover through the real Rust/WASM Worker, ephemeral D1 and R2 (specs/batch-06-shared-tools/sync-cutover.md,
// current-version-adoption.md). Synthetic Auth only; nothing here reaches a real account or the cloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {cloudFixture} from './testing.mjs';

const PUBLIC={plugin_id:'io.molis.work.artifacts',publisher_id:'molis',publisher_signature:'official-artifacts-binding',collection_id:'process_items',schema_version:1};
const N=JSON.stringify(Object.values(PUBLIC));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=name=>(name+'-').padEnd(24,'0');

async function account(t,options){
  const f=await cloudFixture(t,options);
  const send=async(path,{body,method=body===undefined?'GET':'POST',scope,user='alice'}={})=>{
    const headers={Authorization:'Bearer '+user,'Content-Type':'application/json'};if(scope)headers['X-Molis-Process-Items-Cutover']=scope;
    const response=await f.transport('https://sync.example.test'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();let json=null;try{json=JSON.parse(text);}catch{json=null;}
    return {status:response.status,body:json};
  };
  const bytes=async(path,{scope,user='alice'}={})=>{
    const headers={Authorization:'Bearer '+user};if(scope)headers['X-Molis-Process-Items-Cutover']=scope;
    const response=await f.transport('https://sync.example.test'+path,{headers});
    return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
  };
  const policy=(selections,revision,scope)=>send('/v1/policy',{method:'PUT',body:{spaceId:f.space('alice'),revision,selections},scope});
  const write=(operationId,key,value,{base=0,policyRevision,attachments=[],namespace=N,scope}={})=>send('/v1/changes',{body:{namespace,policyRevision,mutation:{operationId,key,base,value},attachments},scope});
  const put=(namespace,ref,data,part=0)=>f.transport('https://sync.example.test/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:ref.digest,part:String(part)}),{method:'PUT',headers:{Authorization:'Bearer alice'},body:data});
  const blob=async(data,namespace=N)=>{
    const ref={digest:hash(data),size:data.length};
    assert.equal((await send('/v1/blobs/reserve',{body:{namespace,...ref}})).status,200);
    for(let part=0;part*4194304<data.length;part++)assert.equal((await put(namespace,ref,data.subarray(part*4194304,(part+1)*4194304),part)).status,200);
    assert.equal((await send('/v1/blobs/complete',{body:{namespace,digest:ref.digest}})).status,200);
    return ref;
  };
  const chunk=(namespace,ref,part=0,scope)=>bytes('/v1/blobs/chunk?'+new URLSearchParams({namespace,digest:ref.digest,part:String(part)}),{scope});
  const status=async()=>(await send('/v1/process-items/cutover')).body;
  const plan=(planId,observed,key,sourceRevision,value,attachments=[])=>send('/v1/process-items/cutover/plan/item',{method:'PUT',body:{planId,expectedPolicyRevision:observed.policyRevision,expectedSourceHead:observed.sourceHead,key,sourceRevision,value,attachments}});
  const begin=(planId,observed,allowRetainedRead=true)=>send('/v1/process-items/cutover/begin',{body:{planId,expectedPolicyRevision:observed.policyRevision,expectedSourceHead:observed.sourceHead,adoptProcessItems:true,allowRetainedRead}});
  const seed=(current,item)=>send('/v1/process-items/cutover/seed',{body:{cutoverId:current.cutoverId,expectedPolicyRevision:current.policyRevision,expectedConsentRevision:current.consentRevision,key:item.key,sourceRevision:item.sourceRevision,value:item.value,attachments:item.attachments}});
  const finish=current=>send('/v1/process-items/cutover/finish',{body:{cutoverId:current.cutoverId,expectedPolicyRevision:current.policyRevision,expectedConsentRevision:current.consentRevision}});
  const consent=(current,adoptProcessItems,allowRetainedRead)=>send('/v1/process-items/cutover/consent',{body:{cutoverId:current.cutoverId,consentRevision:current.consentRevision,adoptProcessItems,allowRetainedRead}});
  const facts=async()=>JSON.stringify(await Promise.all(['sync_cutovers','sync_policy','sync_cutover_blobs','sync_events','sync_receipts','sync_usage'].map(async table=>(await f.db.prepare('SELECT * FROM '+table+' ORDER BY 1,2').all()).results)));
  return {f,send,bytes,policy,write,put,blob,chunk,status,plan,begin,seed,finish,consent,facts};
}

/** An account whose old stream holds a live item with an attachment, a plain live item, a deleted item and a retained branch. */
async function oldStream(t,options){
  const a=await account(t,options);
  assert.equal((await a.policy([a.f.selection,PUBLIC],0)).status,200);
  const photo=await a.blob(Buffer.from('original attachment bytes 🙂'));
  const alpha=await a.write('old-alpha','alpha',{text:'alpha'},{policyRevision:1,attachments:[photo]});
  const beta=await a.write('old-beta','beta',{text:'beta'},{policyRevision:1});
  const gone=await a.write('old-gone','gone',{text:'gone'},{policyRevision:1});
  const deleted=await a.write('old-gone-delete','gone',null,{policyRevision:1,base:gone.body.revision});
  const branch=await a.send('/v1/history/archive',{body:{namespace:N,policyRevision:1,mutation:{operationId:'old-alpha-branch',key:'alpha',base:alpha.body.revision,value:{text:'alpha branch'}},attachments:[]}});
  for(const result of [alpha,beta,gone,deleted,branch])assert.equal(result.status,200,JSON.stringify(result.body));
  return {...a,photo,old:{alpha:alpha.body.revision,beta:beta.body.revision,gone:deleted.body.revision,branch:branch.body.revision}};
}

test('BSH-14-C/A plan, seal, seed and finish adopt the exact old graph; the sealed stream and terminal keys never come back',{timeout:120000},async t=>{
  const a=await oldStream(t);
  assert.equal((await a.send('/v1/policy',{scope:id('nothing')})).status,403,'a scope without a seal reaches nothing');
  let observed=await a.status();assert.equal(observed.phase,'open');assert.equal(observed.sourceHead,a.old.branch,'the source watermark includes archives');
  const page=await a.send('/v1/process-items/cutover/source');assert.equal(page.status,200);
  assert.deepEqual(page.body.items.map(item=>[item.key,item.state,item.headRevision]),[['alpha','live',a.old.alpha],['beta','live',a.old.beta],['gone','deleted',a.old.gone]]);
  assert.deepEqual(page.body.items[0].value,{text:'alpha'});assert.deepEqual(page.body.items[0].attachments,[a.photo]);
  assert.equal((await a.send('/v1/process-items/cutover/source?sourceHead=1')).status,409);
  const first=id('plan-one'),alpha={key:'alpha',sourceRevision:a.old.alpha,value:{owner:'system.materials',text:'alpha'},attachments:[a.photo]};
  // Wrong key, revision, empty wire, borrowed attachment or a stale observation are refused and leave no plan behind.
  assert.equal((await a.plan(first,observed,'gone',a.old.gone,{text:'revived'})).body.error,'SYNC_SOURCE_CHANGED');
  assert.equal((await a.plan(first,observed,'alpha',a.old.beta,alpha.value,alpha.attachments)).body.error,'SYNC_SOURCE_CHANGED');
  assert.equal((await a.plan(first,observed,'alpha',a.old.alpha,null)).status,400);
  assert.equal((await a.plan(first,observed,'beta',a.old.beta,{text:'beta'},[a.photo])).body.error,'SYNC_BLOB_NOT_READY');
  assert.equal((await a.plan(first,{...observed,sourceHead:observed.sourceHead-1},'alpha',a.old.alpha,alpha.value,alpha.attachments)).body.error,'SYNC_SOURCE_CHANGED');
  assert.equal((await a.status()).plan,null);
  const planned=await a.plan(first,observed,alpha.key,alpha.sourceRevision,alpha.value,alpha.attachments);assert.equal(planned.status,200,JSON.stringify(planned.body));
  assert.deepEqual(planned.body.value,alpha.value);assert.match(planned.body.operationId,/^seed:[0-9a-f]{64}$/);
  // A missing key keeps the account open with nothing changed.
  let before=await a.facts();assert.equal((await a.begin(first,observed)).body.error,'SYNC_PLAN_MISMATCH');assert.equal(await a.facts(),before);
  // A new old write changes the observation: begin refuses, and the next plan replaces the stale one.
  const delta=await a.write('old-delta','delta',{text:'delta'},{policyRevision:1});assert.equal(delta.status,200);
  assert.equal((await a.plan(first,observed,'beta',a.old.beta,{text:'beta'})).body.error,'SYNC_SOURCE_CHANGED');
  before=await a.facts();assert.equal((await a.begin(first,observed)).body.error,'SYNC_SOURCE_CHANGED');assert.equal(await a.facts(),before);
  observed=await a.status();const second=id('plan-two');
  const items=[alpha,{key:'beta',sourceRevision:a.old.beta,value:{owner:'system.materials',text:'beta'},attachments:[]},{key:'delta',sourceRevision:delta.body.revision,value:{owner:'system.materials',text:'delta'},attachments:[]}];
  for(const item of items)assert.equal((await a.plan(second,observed,item.key,item.sourceRevision,item.value,item.attachments)).status,200);
  assert.equal((await a.plan(id('plan-rival'),observed,'beta',a.old.beta,{text:'beta'})).body.error,'SYNC_PLAN_CONFLICT','one open plan per observation');
  const reserve=items.reduce((sum,item)=>sum+Buffer.byteLength(JSON.stringify(item.value)),0);
  assert.equal((await a.status()).plan.planId,second);assert.equal((await a.status()).plan.items,3);
  const usedBefore=(await a.send('/v1/quota')).body.usedBytes;
  const sealed=await a.begin(second,observed);assert.equal(sealed.status,200,JSON.stringify(sealed.body));
  let current=sealed.body;assert.equal(current.phase,'seeding');assert.equal(current.cutoverId,second);assert.equal(current.reservedBytes,reserve);assert.equal(current.policyRevision,observed.policyRevision+1);
  assert.deepEqual((await a.begin(second,observed)).body.cutoverId,second,'a lost begin response finds the same seal');
  assert.equal((await a.begin(id('plan-other'),observed)).body.error,'SYNC_CUTOVER_SEALED');
  // The unscoped view hides N for good: no selection, no round head, no reselect, no new write, no plan; exact receipts still replay.
  assert.deepEqual((await a.send('/v1/policy')).body.selections,[a.f.selection]);
  assert.deepEqual((await a.send('/v1/round')).body.heads.map(head=>head.namespace),[a.f.namespace]);
  assert.equal((await a.policy([a.f.selection,PUBLIC],current.policyRevision)).body.error,'SYNC_COLLECTION_SEALED');
  assert.equal((await a.write('new-old','beta',{text:'late'},{policyRevision:current.policyRevision,base:a.old.beta})).body.error,'SYNC_COLLECTION_SEALED');
  assert.deepEqual((await a.write('old-beta','beta',{text:'beta'},{policyRevision:1})).body,{accepted:true,revision:a.old.beta});
  assert.equal((await a.send('/v1/history/archive',{body:{namespace:N,policyRevision:1,mutation:{operationId:'old-alpha-branch',key:'alpha',base:a.old.alpha,value:{text:'alpha branch'}},attachments:[]}})).body.revision,a.old.branch);
  assert.equal((await a.send('/v1/changes?namespace='+encodeURIComponent(N)+'&after=0')).status,403);
  assert.equal((await a.send('/v1/history?'+new URLSearchParams({namespace:N,key:'alpha'}))).status,403);
  assert.equal((await a.send('/v1/trash')).body.items.length,0,'ordinary trash drops the sealed stream before paging');
  assert.equal((await a.plan(second,observed,'beta',a.old.beta,{text:'beta'})).body.error,'SYNC_CUTOVER_SEALED');
  assert.equal((await a.write('x','k','v',{namespace:JSON.stringify(['process_items_adopted',second]),policyRevision:current.policyRevision})).status,400,'internal names are refused');
  // Other collections keep working, and the private stream stays stored while seeding.
  const other=await a.policy([a.f.selection],current.policyRevision);assert.equal(other.status,200);current=await a.status();
  assert.deepEqual(JSON.parse((await a.f.db.prepare('SELECT namespaces FROM sync_policy').first()).namespaces),[a.f.namespace,JSON.stringify(['process_items_adopted',second])]);
  assert.equal((await a.write('during','beta',{text:'scoped early'},{policyRevision:current.policyRevision,scope:second})).body.error,'SYNC_CUTOVER_SEEDING');
  // Seeds carry exactly the frozen wire, under live consent.
  assert.equal((await a.seed(current,{...items[0],value:{owner:'system.materials',text:'changed'}})).body.error,'SYNC_SEED_MISMATCH');
  assert.equal((await a.seed(current,{...items[1],sourceRevision:a.old.alpha})).body.error,'SYNC_SEED_MISMATCH');
  assert.equal((await a.seed({...current,consentRevision:current.consentRevision+1},items[0])).body.error,'SYNC_CONSENT_REQUIRED');
  assert.equal((await a.consent(current,false,true)).status,200);current=await a.status();
  assert.equal((await a.seed(current,items[0])).body.error,'SYNC_CONSENT_REQUIRED','withdrawn consent pauses seeding');
  assert.equal((await a.consent(current,true,true)).status,200);current=await a.status();assert.equal(current.reservedBytes,reserve,'the reservation is kept across a pause');
  const seeded=[];for(const item of items.slice(0,2)){const result=await a.seed(current,item);assert.equal(result.status,200,JSON.stringify(result.body));seeded.push(result.body);}
  assert.deepEqual((await a.seed(current,items[0])).body.revision,seeded[0].revision,'a seed replays its own receipt');
  assert.equal((await a.finish(current)).body.error,'SYNC_SEED_INCOMPLETE');
  seeded.push((await a.seed(current,items[2])).body);current=await a.status();assert.equal(current.reservedBytes,0);
  const readback=await a.send('/v1/process-items/cutover/seeds?cutoverId='+second);
  assert.deepEqual(readback.body.items.map(item=>[item.key,item.seeded,item.revision]),items.map((item,index)=>[item.key,true,seeded[index].revision]));
  assert.deepEqual(readback.body.items.map(item=>item.value),items.map(item=>item.value));
  const done=await a.finish(current);assert.equal(done.status,200,JSON.stringify(done.body));current=done.body;
  assert.equal(current.phase,'complete');assert.equal(current.completionHead,Math.max(...seeded.map(seed=>seed.revision)));assert.equal(current.selected,true);
  assert.equal((await a.finish(current)).body.completedAt,current.completedAt,'a repeated finish returns the original result');
  assert.equal((await a.f.db.prepare('SELECT COUNT(*) AS n FROM sync_cutover_items').first()).n,0,'the frozen plan is deleted');
  // The scoped view is the private stream under the public name.
  assert.deepEqual((await a.send('/v1/policy',{scope:second})).body.selections,[a.f.selection,PUBLIC]);
  assert.deepEqual((await a.send('/v1/policy')).body.selections,[a.f.selection]);
  assert.deepEqual((await a.send('/v1/round',{scope:second})).body.heads,[{namespace:a.f.namespace,revision:0},{namespace:N,revision:current.completionHead}]);
  const pulled=await a.send('/v1/changes?namespace='+encodeURIComponent(N)+'&after=0',{scope:second});assert.deepEqual(pulled.body.events.map(event=>event.key),['alpha','beta','delta']);
  const edit=await a.write('old-beta','beta',{text:'edited after adoption'},{policyRevision:current.policyRevision,base:seeded[1].revision,scope:second});assert.equal(edit.status,200);
  assert.ok(edit.body.revision>current.completionHead,'the same operation id in the new stream gets its own receipt');
  assert.deepEqual((await a.write('old-beta','beta',{text:'beta'},{policyRevision:1})).body.revision,a.old.beta,'the old receipt is untouched');
  assert.equal((await a.write('revive','gone',{text:'revived'},{policyRevision:current.policyRevision,scope:second})).body.error,'SYNC_ITEM_RETIRED');
  assert.equal((await a.write('seed:forged','fresh',{text:'x'},{policyRevision:current.policyRevision,scope:second})).status,400);
  assert.equal((await a.write('fresh','fresh',{text:'new'},{policyRevision:current.policyRevision,scope:second})).status,200);
  // A scoped policy turns the adopted collection off and on again; the unscoped view never sees it.
  const off=await a.policy([a.f.selection],current.policyRevision,second);assert.equal(off.status,200);
  assert.deepEqual((await a.send('/v1/policy',{scope:second})).body.selections,[a.f.selection]);
  assert.equal((await a.send('/v1/changes?namespace='+encodeURIComponent(N)+'&after=0',{scope:second})).status,403);
  const on=await a.policy([a.f.selection,PUBLIC],off.body.revision,second);assert.equal(on.status,200);
  assert.deepEqual((await a.send('/v1/policy',{scope:second})).body.selections,[a.f.selection,PUBLIC]);
  // Retained old history under the live grant, including the archive branch; withdrawn grant refuses.
  current=await a.status();
  const versions=await a.send('/v1/process-items/cutover/history?'+new URLSearchParams({cutoverId:second,consentRevision:String(current.consentRevision),key:'alpha'}));
  assert.deepEqual(versions.body.items.map(row=>[row.revision,row.action]),[[a.old.branch,'archive'],[a.old.alpha,'write']]);
  const branch=await a.send('/v1/process-items/cutover/history?'+new URLSearchParams({cutoverId:second,consentRevision:String(current.consentRevision),key:'alpha',revision:String(a.old.branch)}));
  assert.deepEqual(branch.body.event.value,{text:'alpha branch'});
  const old=await a.bytes('/v1/process-items/cutover/blob?'+new URLSearchParams({cutoverId:second,consentRevision:String(current.consentRevision),digest:a.photo.digest,part:'0'}));
  assert.equal(old.bytes.toString(),'original attachment bytes 🙂');
  assert.equal((await a.consent(current,true,false)).status,200);
  assert.equal((await a.send('/v1/process-items/cutover/history?'+new URLSearchParams({cutoverId:second,consentRevision:String(current.consentRevision),key:'alpha'}))).status,403,'an old grant revision is refused');
  current=await a.status();
  assert.equal((await a.send('/v1/process-items/cutover/history?'+new URLSearchParams({cutoverId:second,consentRevision:String(current.consentRevision),key:'alpha'}))).status,403,'a withdrawn grant is refused');
  assert.equal((await a.send('/v1/quota')).body.usedBytes>usedBefore,true,'seeds are charged once the reservation is spent');
});

test('BSH-14-A the reservation is exact: one byte short stays open; an exact fit seals and ordinary writes cannot spend it',{timeout:120000},async t=>{
  const a=await oldStream(t);const observed=await a.status(),planId=id('quota');
  const items=[{key:'alpha',sourceRevision:a.old.alpha,value:{text:'alpha'},attachments:[a.photo]},{key:'beta',sourceRevision:a.old.beta,value:{text:'beta'},attachments:[]}];
  let reserve=0;for(const item of items)reserve+=(await a.plan(planId,observed,item.key,item.sourceRevision,item.value,item.attachments)).body.contentBytes;
  const space=a.f.space('alice'),set=used=>a.f.db.prepare('UPDATE sync_usage SET used_bytes=? WHERE space=?').bind(used,space).run();
  await set(100000000-reserve+1);let before=await a.facts();
  assert.equal((await a.begin(planId,observed)).body.error,'SYNC_QUOTA_EXCEEDED');assert.equal(await a.facts(),before,'a refused begin changes nothing');
  assert.equal((await a.status()).phase,'open');
  await set(100000000-reserve);const sealed=await a.begin(planId,observed);assert.equal(sealed.status,200,JSON.stringify(sealed.body));assert.equal(sealed.body.reservedBytes,reserve);
  let current=sealed.body;
  assert.equal((await a.write('ordinary','k',{x:1},{namespace:a.f.namespace,policyRevision:current.policyRevision})).body.error,'SYNC_QUOTA_EXCEEDED','ordinary writes cannot spend the reservation');
  for(const item of items)assert.equal((await a.seed(current,item)).status,200);
  current=await a.status();assert.equal(current.reservedBytes,0);
  assert.equal((await a.send('/v1/quota')).body.usedBytes,100000000);
  assert.equal((await a.finish(current)).body.phase,'complete');
});

test('BSH-14-B protected generations: another collection needs its own reference; the old stream reads only under the live grant',{timeout:120000},async t=>{
  const a=await account(t);assert.equal((await a.policy([a.f.selection,PUBLIC],0)).status,200);
  const shared=await a.blob(Buffer.from('shared by both collections'),a.f.namespace);
  assert.equal((await a.write('own','own',{file:1},{namespace:a.f.namespace,policyRevision:1,attachments:[shared]})).status,200);
  const secret=await a.blob(Buffer.from('only the process items held this'));
  const alpha=await a.write('old-alpha','alpha',{text:'alpha'},{policyRevision:1,attachments:[secret,shared]});assert.equal(alpha.status,200);
  const observed=await a.status(),planId=id('protect'),item={key:'alpha',sourceRevision:alpha.body.revision,value:{text:'alpha'},attachments:[secret,shared]};
  assert.equal((await a.plan(planId,observed,item.key,item.sourceRevision,item.value,item.attachments)).status,200);
  let current=(await a.begin(planId,observed)).body;assert.equal(current.phase,'seeding');
  const status=(namespace,ref,scope)=>a.send('/v1/blobs/status?'+new URLSearchParams({namespace,digest:ref.digest}),{scope});
  assert.equal((await status(a.f.namespace,secret)).body.error,'SYNC_BLOB_PROTECTED');
  assert.equal((await a.chunk(a.f.namespace,secret)).status,403);
  assert.equal((await a.send('/v1/blobs/reserve',{body:{namespace:a.f.namespace,...secret}})).body.error,'SYNC_BLOB_PROTECTED');
  assert.equal((await a.write('borrow','borrow',{file:2},{namespace:a.f.namespace,policyRevision:current.policyRevision,attachments:[secret]})).body.error,'SYNC_BLOB_NOT_READY','knowing digest and size is not holding the bytes');
  assert.equal((await status(a.f.namespace,shared)).status,200,'an existing legitimate reference stays readable');
  assert.equal((await a.chunk(a.f.namespace,shared)).bytes.toString(),'shared by both collections');
  assert.equal((await a.write('again','again',{file:3},{namespace:a.f.namespace,policyRevision:current.policyRevision,attachments:[shared]})).status,200);
  assert.equal((await status(N,secret)).status,403,'the sealed stream has no ordinary blob reads');
  assert.equal((await a.send('/v1/blobs/status?'+new URLSearchParams({namespace:a.f.namespace,digest:secret.digest}),{user:'bob'})).status,403);
  const query=revision=>'/v1/process-items/cutover/blob?'+new URLSearchParams({cutoverId:planId,consentRevision:String(revision),digest:secret.digest,part:'0'});
  assert.equal((await a.bytes(query(current.consentRevision))).bytes.toString(),'only the process items held this');
  assert.equal((await a.bytes(query(current.consentRevision),{user:'bob'})).status,409,'another account has no seal to name');
  assert.equal((await a.consent(current,true,false)).status,200);current=await a.status();
  assert.equal((await a.bytes(query(current.consentRevision))).status,403,'a withdrawn grant reads nothing');
  assert.equal((await a.seed(current,item)).status,200,'seeding keeps its own consent');
  current=(await a.finish(current)).body;assert.equal(current.phase,'complete');
  assert.equal((await a.chunk(N,secret,0,planId)).bytes.toString(),'only the process items held this','the adopted stream holds its seed reference');
  assert.equal((await a.write('reuse','reuse',{file:4},{policyRevision:current.policyRevision,attachments:[secret],scope:planId})).status,200);
});

test('BSH-14-E a seal stops an upload in flight; another collection completes the same digest and a losing object is cleaned exactly',{timeout:120000},async t=>{
  const a=await account(t);assert.equal((await a.policy([a.f.selection,PUBLIC],0)).status,200);
  const data=Buffer.alloc(4194304+17,7);data.write('two parts');const ref={digest:hash(data),size:data.length};
  assert.equal((await a.send('/v1/blobs/reserve',{body:{namespace:N,...ref}})).status,200);
  assert.equal((await a.put(N,ref,data.subarray(0,4194304),0)).status,200);
  const observed=await a.status(),planId=id('upload');
  const sealed=await a.begin(planId,observed);assert.equal(sealed.status,200,'an empty old stream adopts through an empty plan');assert.equal(sealed.body.reservedBytes,0);
  assert.equal((await a.put(N,ref,data.subarray(4194304),1)).status,403);
  assert.equal((await a.send('/v1/blobs/complete',{body:{namespace:N,digest:ref.digest}})).status,403);
  assert.equal((await a.f.db.prepare('SELECT ready FROM sync_blobs WHERE digest=?').bind(ref.digest).first()).ready,0);
  assert.equal((await a.send('/v1/blobs/reserve',{body:{namespace:a.f.namespace,...ref}})).status,200,'nothing referenced it, so it is not protected');
  assert.equal((await a.put(a.f.namespace,ref,data.subarray(0,4194304),0)).status,200,'the identical recorded part is shared');
  assert.equal((await a.put(a.f.namespace,ref,data.subarray(4194304),1)).status,200);
  assert.equal((await a.send('/v1/blobs/complete',{body:{namespace:a.f.namespace,digest:ref.digest}})).status,200);
  assert.equal((await a.write('own','own',{file:1},{namespace:a.f.namespace,policyRevision:sealed.body.policyRevision,attachments:[ref]})).status,200);
  const read=Buffer.concat([(await a.chunk(a.f.namespace,ref,0)).bytes,(await a.chunk(a.f.namespace,ref,1)).bytes]);assert.ok(read.equals(data));
  const row=await a.f.db.prepare('SELECT generation FROM sync_blobs WHERE digest=?').bind(ref.digest).first();
  const prefix=[a.f.space('alice'),ref.digest,row.generation,'0'].join('/'),loser=prefix+'/'+'0'.repeat(64);
  await a.f.bucket.put(loser,Buffer.from('a losing writer'));
  for(let pass=0;pass<6&&await a.f.bucket.head(loser);pass++)await a.f.scheduled();
  assert.equal(await a.f.bucket.head(loser),null,'the losing checksum is removed');
  assert.ok((await a.chunk(a.f.namespace,ref,0)).bytes.equals(data.subarray(0,4194304)),'the recorded shared object stays');
});

test('BSH-14-F the Worker needs exactly v6 plus the cutover structure and patches nothing',{timeout:120000},async t=>{
  const schema=async f=>JSON.stringify((await f.db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).results);
  const old=await cloudFixture(t,{adoption:false}),before=await schema(old);
  const refused=await old.call('/v1/quota');assert.equal(refused.status,503);assert.equal((await refused.json()).error,'SYNC_SCHEMA_MISMATCH');
  assert.equal(await schema(old),before);assert.equal(old.requests.length,0,'refused before Auth');
  const partial=await cloudFixture(t,{adoption:false});
  const sql=readFileSync(new URL('../../server/migrations/sync/0002_process_items_cutover.sql',import.meta.url),'utf8');
  const statements=[...sql.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;|CREATE (?:TABLE|INDEX)[\s\S]*?;|DROP TRIGGER \w+;/g)].map(match=>match[0]);
  for(const statement of statements.slice(0,-1))await partial.db.prepare(statement).run();
  assert.equal((await partial.call('/v1/quota')).status,503,'a partial adoption is refused');
  const altered=await cloudFixture(t);
  await altered.db.prepare('DROP TRIGGER sync_events_seeded').run();
  await altered.db.prepare(statements.at(-1).replace('MAX(0,','MAX(0, ').replace(/;$/,'')).run();
  assert.equal((await altered.call('/v1/quota')).status,503,'a different definition is refused');
  const current=await cloudFixture(t);assert.equal((await current.call('/v1/quota')).status,200);
});

test('BSH-14-A thirty days after completion the old current bodies go; heads, receipts, pins and the adopted stream stay',{timeout:120000},async t=>{
  const a=await oldStream(t);
  assert.equal((await a.send('/v1/history/pin',{body:{namespace:N,key:'beta',revision:a.old.beta,policyRevision:1}})).status,200);
  const observed=await a.status(),planId=id('expire');
  const items=[{key:'alpha',sourceRevision:a.old.alpha,value:{text:'alpha'},attachments:[a.photo]},{key:'beta',sourceRevision:a.old.beta,value:{text:'beta'},attachments:[]}];
  for(const item of items)await a.plan(planId,observed,item.key,item.sourceRevision,item.value,item.attachments);
  let current=(await a.begin(planId,observed)).body;for(const item of items)await a.seed(current,item);current=(await a.finish(await a.status())).body;
  const count=async revision=>(await a.f.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE namespace=? AND revision=?').bind(N,revision).first()).n;
  await a.f.scheduled();assert.equal(await count(a.old.alpha),1,'nothing goes before thirty days');
  await a.f.db.prepare('UPDATE sync_cutovers SET completed_at=completed_at-2678400000').run();
  await a.f.scheduled();
  assert.equal(await count(a.old.alpha),0);assert.equal(await count(a.old.beta),1,'a pinned body stays');
  assert.equal((await a.f.db.prepare('SELECT COUNT(*) AS n FROM sync_heads WHERE namespace=? AND deleted_at IS NULL').bind(N).first()).n,2,'old heads stay and never become terminal');
  assert.equal((await a.f.db.prepare("SELECT COUNT(*) AS n FROM sync_receipts WHERE namespace=? AND operation='old-alpha'").bind(N).first()).n,1);
  assert.deepEqual((await a.send('/v1/changes?namespace='+encodeURIComponent(N)+'&after=0',{scope:planId})).body.events.map(event=>event.key),['alpha','beta']);
  assert.equal((await a.chunk(N,a.photo,0,planId)).status,200,'the adopted reference keeps the attachment');
});
