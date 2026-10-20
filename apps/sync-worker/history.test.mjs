import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {cloudFixture} from './testing.mjs';

const url=(f,path,extra={})=>path+'?'+new URLSearchParams({namespace:f.namespace,key:'asset',...extra});
const archive=(f,base,value,operation='archive',attachments=[])=>f.call('/v1/history/archive','alice',{namespace:f.namespace,policyRevision:1,mutation:{operationId:operation,key:'asset',base,value},attachments});
const pin=(f,revision)=>f.call('/v1/history/pin','alice',{namespace:f.namespace,key:'asset',revision,policyRevision:1});
const restore=(f,sourceRevision,revision,operationId='restore-history')=>f.call('/v1/history/restore','alice',{namespace:f.namespace,key:'asset',sourceRevision,revision,operationId,policyRevision:1});
const purge=(f,sourceRevision,revision,confirm=true)=>f.call('/v1/history/purge','alice',{namespace:f.namespace,key:'asset',sourceRevision,revision,confirm});
const head=async f=>f.db.prepare("SELECT h.revision,h.deleted_at,e.value FROM sync_heads h JOIN sync_events e ON h.revision=e.revision WHERE h.space=? AND h.namespace=? AND h.key='asset'").bind(f.space('alice'),f.namespace).first();
const used=async f=>(await(await f.call('/v1/quota')).json()).usedBytes;
async function file(f,text='unique retained bytes'){
 const bytes=Buffer.from(text),ref={digest:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
 assert.equal((await f.call('/v1/blobs/reserve','alice',{namespace:f.namespace,...ref})).status,200);
 assert.equal((await f.transport('https://sync.example.test/v1/blobs/chunk?'+new URLSearchParams({namespace:f.namespace,digest:ref.digest,part:'0'}),{method:'PUT',headers:{Authorization:'Bearer alice'},body:bytes})).status,200);
 assert.equal((await f.call('/v1/blobs/complete','alice',{namespace:f.namespace,digest:ref.digest})).status,200);return ref;
}
async function old(f,operation,key,value,base=0,action='write',attachments=[]){
 const fingerprint=createHash('sha256').update(JSON.stringify([key,base,value,attachments,action])).digest('hex');
 await f.db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,action,created_at) VALUES (?,?,?,?,?,?,?,1,?,?,unixepoch()*1000-2678400000)")
  .bind(f.space('alice'),f.namespace,operation,key,base,JSON.stringify(value),JSON.stringify(attachments),fingerprint,action).run();
 return (await f.db.prepare('SELECT revision FROM sync_receipts WHERE space=? AND namespace=? AND operation=?').bind(f.space('alice'),f.namespace,operation).first()).revision;
}

test('PCSYNC-15/16 archive retains an exact version without changing the head, pull cursor or double charging replay',async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');
 const initial=await(await f.write('current','asset',{text:'remote 中文'})).json(),before=await used(f),value={text:'unuploaded local 🙂'};
 const saved=await archive(f,initial.revision,value);assert.equal(saved.status,200,await saved.clone().text());const receipt=await saved.json();
 assert.ok(receipt.revision>initial.revision);assert.equal((await head(f)).revision,initial.revision);
 assert.equal(await used(f),before+Buffer.byteLength(JSON.stringify(value)));
 assert.deepEqual(await(await archive(f,initial.revision,value)).json(),receipt);assert.equal(await used(f),before+Buffer.byteLength(JSON.stringify(value)));
 assert.equal((await archive(f,initial.revision,{text:'different'})).status,409);
 assert.equal((await archive(f,0,value,'no-base')).status,400);
 assert.equal((await archive(f,999999,value,'wrong-base')).status,409);
 const pull=await(await f.call('/v1/changes?'+new URLSearchParams({namespace:f.namespace,after:'0'}))).json();assert.deepEqual(pull.events.map(e=>e.revision),[initial.revision]);
 const listed=await(await f.call(url(f,'/v1/history'))).json();assert.equal(listed.items.length,2);assert.equal(listed.items[0].retained,true);assert.equal(listed.items[0].current,false);
 const inspection=await(await f.call(url(f,'/v1/history/version',{revision:String(receipt.revision)}))).json();assert.deepEqual(inspection.event.value,value);assert.equal(inspection.currentRevision,initial.revision);
 assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(receipt.revision)}),'bob')).status,404);
 assert.equal((await f.call(url(f,'/v1/history',{namespace:'wrong'}))).status,403);
 assert.equal((await f.call(url(f,'/v1/history')+'&key=duplicate')).status,400);
});

test('PCSYNC-09/16/18 pins do not duplicate content charges and retained-only R2 refs survive transport compaction',async t=>{
 const f=await cloudFixture(t);await f.enable();const ref=await file(f);
 const original=await old(f,'original','asset',{remote:'original'}),before=await used(f);
 assert.equal((await pin(f,original)).status,200);assert.equal((await pin(f,original)).status,200);assert.equal(await used(f),before);
 const current=await(await f.write('new','asset',{current:'current'},{base:original})).json();
 const local={local:'not adopted',file:ref.digest},saved=await old(f,'retained-local','asset',local,current.revision,'archive',[ref]);
 await f.db.prepare('UPDATE sync_blobs SET created_at=unixepoch()*1000-2678400000').run();
 const charged=await used(f);assert.equal((await f.call('/v1/maintenance','alice',{})).status,200);
 assert.equal((await f.bucket.list()).objects.length,1);assert.equal(await used(f),charged);
 assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(original)}))).status,200,'a pinned old remote version is not redundant transport');
 assert.equal((await purge(f,saved,current.revision,false)).status,400);assert.equal((await purge(f,saved,current.revision+100)).status,409);
 assert.equal((await purge(f,current.revision,current.revision)).status,409,'the current business head is never a history purge target');
 assert.equal((await purge(f,saved,current.revision)).status,200);assert.equal((await purge(f,saved,current.revision)).status,200);
 assert.equal(await used(f),charged-Buffer.byteLength(JSON.stringify(local)));
 assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(saved)}))).status,404);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_history_pins WHERE revision=?').bind(saved).first()).n,0);
 await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,0);assert.equal(await used(f),charged-Buffer.byteLength(JSON.stringify(local))-ref.size);
 assert.equal((await head(f)).revision,current.revision);
});

test('PCSYNC-16 restored retained versions are new CAS heads and replay binds the exact selected source',async t=>{
 const f=await cloudFixture(t);await f.enable();
 const original=await(await f.write('original','asset',{text:'original'})).json();
 const remote=await(await f.write('remote','asset',{text:'remote'},{base:original.revision})).json();
 const branch=await(await archive(f,remote.revision,{text:'unadopted local'})).json();
 const restored=await restore(f,branch.revision,remote.revision);assert.equal(restored.status,200,await restored.clone().text());const result=await restored.json(),bytes=await used(f);
 assert.deepEqual(JSON.parse((await head(f)).value),{text:'unadopted local'});assert.equal((await head(f)).revision,result.revision);
 assert.deepEqual(await(await restore(f,branch.revision,remote.revision)).json(),result);assert.equal(await used(f),bytes);
 assert.equal((await restore(f,original.revision,remote.revision)).status,409,'one operation cannot be replayed for another source');
 assert.equal((await f.call('/v1/trash/restore','alice',{namespace:f.namespace,key:'asset',revision:remote.revision,operationId:'restore-history',policyRevision:1})).status,409,'trash restoration cannot alias a history request');
 assert.equal((await restore(f,result.revision,result.revision,'current')).status,409);
 assert.equal((await restore(f,original.revision,remote.revision,'stale')).status,409);
 assert.equal((await restore(f,999999,result.revision,'missing')).status,404);
 const pulled=await(await f.call('/v1/changes?'+new URLSearchParams({namespace:f.namespace,after:'0'}))).json();assert.ok(!pulled.events.some(event=>event.revision===branch.revision));
 assert.ok(pulled.events.some(event=>event.revision===result.revision));
 const policy=await f.call('/v1/policy','alice',{spaceId:f.space('alice'),revision:1,selections:[]},'PUT');assert.equal(policy.status,200);
 assert.equal((await f.call(url(f,'/v1/history'))).status,403);assert.equal((await restore(f,original.revision,result.revision,'disabled')).status,403);assert.equal(await used(f),bytes);
});

test('PCSYNC-16/18 history restore and confirmed purge compete atomically on both source and current head',async t=>{
 const f=await cloudFixture(t);await f.enable();const original=await(await f.write('original','asset',{text:'old'})).json();await pin(f,original.revision);
 const current=await(await f.write('current','asset',{text:'new'},{base:original.revision})).json();
 const results=await Promise.all([restore(f,original.revision,current.revision),purge(f,original.revision,current.revision)]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.every(r=>[200,404,409].includes(r.status)));
 if(results[0].status===200){assert.deepEqual(JSON.parse((await head(f)).value),{text:'old'});assert.equal(results[1].status,409);}
 else {assert.deepEqual(JSON.parse((await head(f)).value),{text:'new'});assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(original.revision)}))).status,404);}
 await f.call('/v1/maintenance','alice',{});assert.ok((await head(f)).value);
});

test('PCSYNC-17/19 trash restores its actual prior head, not a newer losing branch, and expiry prunes every retained branch',async t=>{
 const f=await cloudFixture(t);await f.enable();const first=await(await f.write('first','asset',{actual:'original'})).json();
 const branch=await(await archive(f,first.revision,{local:'unadopted'})).json();
 const deleted=await(await f.write('delete','asset',null,{base:first.revision})).json();
 const after=await(await archive(f,deleted.revision,{local:'after deletion'},'after-deletion')).json();assert.equal((await head(f)).revision,deleted.revision);
 const restored=await f.call('/v1/trash/restore','alice',{namespace:f.namespace,key:'asset',revision:deleted.revision,operationId:'restore-trash',policyRevision:1});assert.equal(restored.status,200);
 const current=await head(f);assert.deepEqual(JSON.parse(current.value),{actual:'original'});
 assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(branch.revision)}))).status,200);
 assert.equal((await f.call(url(f,'/v1/history/version',{revision:String(after.revision)}))).status,200);
 const again=await(await f.write('delete-again','asset',null,{base:current.revision})).json();
 await f.db.prepare('UPDATE sync_heads SET deleted_at=unixepoch()*1000-2678400000 WHERE space=?').bind(f.space('alice')).run();
 assert.equal((await restore(f,branch.revision,again.revision,'expired')).status,409);
 await f.call('/v1/maintenance','alice',{});assert.equal(await used(f),0);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_history_pins').first()).n,0);
 const rows=await f.db.prepare('SELECT revision,value FROM sync_events').all();assert.deepEqual(rows.results,[{revision:again.revision,value:'null'}]);
});

test('PCSYNC-01/16 history pagination is bounded and old v4/v5 D1 is refused without any schema or fact changes',async t=>{
 const f=await cloudFixture(t);await f.enable();const current=await(await f.write('current','asset',{current:true})).json();
 for(let i=0;i<22;i++)assert.equal((await archive(f,current.revision,{branch:i},'branch-'+i)).status,200);
 const first=await(await f.call(url(f,'/v1/history'))).json();assert.equal(first.items.length,20);assert.equal(first.more,true);
 const second=await(await f.call(url(f,'/v1/history',{before:String(first.next)}))).json();assert.equal(second.items.length,3);assert.equal(second.more,false);
 assert.equal(new Set([...first.items,...second.items].map(row=>row.revision)).size,23);
 for(const version of [4,5]){
 const prior=await cloudFixture(t,{schema:false}),sql=readFileSync(new URL('./fixtures/baseline-v'+version+'.sql',import.meta.url),'utf8');
 for(const [statement] of sql.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;|CREATE (?:TABLE|INDEX)[\s\S]*?;|INSERT INTO sync_schema[\s\S]*?;/g))await prior.db.prepare(statement).run();
 await prior.db.prepare("INSERT INTO sync_usage VALUES ('preserved',123)").run();
 const snapshot=async()=>JSON.stringify({schema:(await prior.db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).results,usage:(await prior.db.prepare('SELECT * FROM sync_usage').all()).results});
 const before=await snapshot(),response=await prior.call('/v1/history?namespace=ignored&key=ignored');assert.equal(response.status,503);assert.equal((await response.json()).error,'SYNC_SCHEMA_MISMATCH');
 assert.equal(prior.requests.length,0,'baseline refusal precedes Auth');assert.equal(await snapshot(),before);
 }
});

test('PCSYNC-01/16 a fresh device can enumerate retained asset keys with bounded account-scoped pagination',async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');
 for(let i=0;i<22;i++){
  const key='retained-'+String(i).padStart(2,'0'),receipt=await(await f.write('write-'+key,key,{index:i})).json();
  assert.equal((await f.call('/v1/history/pin','alice',{namespace:f.namespace,key,revision:receipt.revision,policyRevision:1})).status,200);
 }
 await f.write('unretained','not-retained',{ignored:true});
 const endpoint='/v1/history/keys?'+new URLSearchParams({namespace:f.namespace}),before=await used(f);
 const first=await(await f.call(endpoint)).json();assert.equal(first.items.length,20);assert.equal(first.more,true);assert.equal(first.next,'retained-19');
 assert.deepEqual(first.items.map(item=>item.key),Array.from({length:20},(_,i)=>'retained-'+String(i).padStart(2,'0')));
 assert.ok(first.items.every(item=>item.versions===1&&item.currentRevision>0&&item.retainedAt>0));
 const second=await(await f.call(endpoint+'&after='+encodeURIComponent(first.next))).json();assert.deepEqual(second.items.map(item=>item.key),['retained-20','retained-21']);assert.equal(second.more,false);
 assert.deepEqual((await(await f.call(endpoint,'bob')).json()).items,[]);assert.equal((await f.call(endpoint+'&namespace=duplicate')).status,400);
 assert.equal((await f.call(endpoint+'&after=')).status,400);assert.equal(await used(f),before,'listing cannot pin or charge content');
 await f.db.prepare("UPDATE sync_heads SET deleted_at=unixepoch()*1000-2678400000 WHERE key='retained-20'").run();
 assert.deepEqual((await(await f.call(endpoint+'&after=retained-19')).json()).items.map(item=>item.key),['retained-21'],'expired branches are hidden before maintenance');
 await f.call('/v1/policy','alice',{spaceId:f.space('alice'),revision:1,selections:[]},'PUT');assert.equal((await f.call(endpoint)).status,403);
});
