import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cloudFixture} from './testing.mjs';

async function file(f,text='retained bytes'){
 const bytes=Buffer.from(text),ref={digest:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
 assert.equal((await f.call('/v1/blobs/reserve','alice',{namespace:f.namespace,...ref})).status,200);
 const url='https://sync.example.test/v1/blobs/chunk?'+new URLSearchParams({namespace:f.namespace,digest:ref.digest,part:'0'});
 assert.equal((await f.transport(url,{method:'PUT',headers:{Authorization:'Bearer alice'},body:bytes})).status,200);
 assert.equal((await f.call('/v1/blobs/complete','alice',{namespace:f.namespace,digest:ref.digest})).status,200);return ref;
}
async function deleted(f,key='asset',ref){
 assert.equal((await f.write('create-'+key,key,{content:key},ref?{attachments:[ref]}:{})).status,200);
 const saved=await f.db.prepare('SELECT revision FROM sync_heads WHERE space=? AND namespace=? AND key=?').bind(f.space('alice'),f.namespace,key).first();
 assert.equal((await f.write('delete-'+key,key,null,{base:saved.revision})).status,200);
 return (await f.db.prepare('SELECT revision FROM sync_heads WHERE space=? AND namespace=? AND key=?').bind(f.space('alice'),f.namespace,key).first()).revision;
}
const age=async(f,days)=>f.db.prepare('UPDATE sync_heads SET deleted_at=unixepoch()*1000-? WHERE deleted_at IS NOT NULL').bind(days*86400000).run();
const oldBlobs=async f=>f.db.prepare('UPDATE sync_blobs SET created_at=unixepoch()*1000-172800000').run();
const restore=(f,revision,operationId='restore',key='asset')=>f.call('/v1/trash/restore','alice',{namespace:f.namespace,key,revision,operationId,policyRevision:1});
const purge=(f,revision,key='asset',confirm=true)=>f.call('/v1/trash/purge','alice',{namespace:f.namespace,key,revision,confirm});

for(const mode of ['read-only','mistyped-mode'])test('PCSYNC-26 operator '+mode+' preserves D1/R2 across every mutation and scheduled GC',async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');const ref=await file(f,'paired backup original');
 await deleted(f,'asset',ref);await age(f,31);await oldBlobs(f);
 const tables=(await f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' AND name<>'sync_rate_windows' ORDER BY name").all()).results.map(row=>row.name);
 const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await f.db.prepare('SELECT * FROM "'+name+'"').all()).results])));
 const objects=async()=>Promise.all((await f.bucket.list()).objects.map(async object=>({key:object.key,body:Buffer.from(await(await f.bucket.get(object.key)).arrayBuffer()).toString('base64')})));
 const original=await snapshot(),bytes=await objects();assert.equal(bytes.length,1);
 await f.writeMode(mode);assert.deepEqual(await snapshot(),original,'changing operator bindings must retain the same database');
 assert.equal((await f.call('/v1/changes','invalid',{})).status,401,'maintenance does not bypass Auth');
 assert.equal((await f.call('/v1/changes','wrong-app',{})).status,403);
 const routes=[['PUT','/v1/policy'],['POST','/v1/changes'],['POST','/v1/blobs/reserve'],['PUT','/v1/blobs/chunk'],['POST','/v1/blobs/complete'],['POST','/v1/history/archive'],['POST','/v1/history/pin'],['POST','/v1/history/restore'],['POST','/v1/history/purge'],['POST','/v1/trash/restore'],['POST','/v1/trash/purge'],['POST','/v1/maintenance']];
 for(const user of ['alice','bob'])for(const [method,route]of routes){
  const response=await f.call(route,user,{SYNC_WRITE_MODE:'read-write'},method);assert.equal(response.status,503,method+' '+route);
  assert.equal(response.headers.get('Retry-After'),'60');assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{error:mode==='read-only'?'SYNC_READ_ONLY':'SYNC_INVALID_WRITE_MODE'});
 }
 if(mode==='read-only'){
  const summary=await f.call('/v1/round');assert.equal(summary.status,200);assert.equal((await summary.json()).heads.length,1);
  assert.equal((await f.call('/v1/quota')).status,200);assert.equal((await f.call('/v1/blobs/status?'+new URLSearchParams({namespace:f.namespace,digest:ref.digest}))).status,200);
 }else assert.equal((await f.call('/v1/round')).status,503,'invalid operator configuration fails closed');
 await f.scheduled();assert.deepEqual(await snapshot(),original);assert.deepEqual(await objects(),bytes,'scheduled GC cannot invalidate a paired backup');
 assert.ok((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_rate_windows').first()).n>0,'existing rate checks remain active');
 await f.writeMode('read-write');assert.equal((await f.call('/v1/maintenance','alice',{})).status,200);
 assert.equal((await f.bucket.list()).objects.length,0,'the same retained generation is collected only after writes explicitly resume');
 assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,0);
});

test('PCSYNC-19/26 active transport compaction preserves head, fixed owner content, receipts and account scope',async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');const ref=await file(f,'superseded transport bytes');
 // Controlled server-clock fixture: seed the original timestamp on INSERT, with every production trigger intact.
 const seedOld=async(user,operation,key,value,attachments=[])=>{
  const fingerprint=createHash('sha256').update(JSON.stringify([key,0,value,attachments,'write'])).digest('hex');
  await f.db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,action,created_at) VALUES (?,?,?,?,0,?,?,1,?,'write',unixepoch()*1000-2678400000)").bind(f.space(user),f.namespace,operation,key,JSON.stringify(value),JSON.stringify(attachments),fingerprint).run();
  return f.db.prepare('SELECT revision FROM sync_heads WHERE space=? AND namespace=? AND key=?').bind(f.space(user),f.namespace,key).first();
 };
 const original=await seedOld('alice','old','asset',{saved:'old'},[ref]);assert.ok(original.revision>0);
 const current=await(await f.write('current','asset',{saved:'current',owner_history:['v1','v2']},{base:original.revision})).json();
 const bob=await seedOld('bob','bob-old','bob-asset',{private:'bob'});await f.write('bob-current','bob-asset',{private:'new bob'},{user:'bob',base:bob.revision});
 await assert.rejects(()=>f.db.prepare('UPDATE sync_events SET created_at=0').run(),/SYNC_EVENTS_IMMUTABLE/);await oldBlobs(f);
 const before=(await(await f.call('/v1/quota')).json()).usedBytes;await f.call('/v1/maintenance','alice',{});
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE space=?').bind(f.space('alice')).first()).n,2,'replacing an old live graph starts a fresh 30-day retention period');
 assert.equal((await f.bucket.list()).objects.length,1,'nested originals keep their raw bytes while retained');
 // Controlled server clock for expiry; clients cannot edit this retention metadata.
 await f.db.prepare('UPDATE sync_version_retention SET retained_until=unixepoch()*1000-1 WHERE space=?').bind(f.space('alice')).run();
 await f.call('/v1/maintenance','alice',{});
 const rows=await f.db.prepare('SELECT operation,value FROM sync_events WHERE space=? ORDER BY revision').bind(f.space('alice')).all();assert.equal(rows.results.length,1);assert.equal(rows.results[0].operation,'current');assert.deepEqual(JSON.parse(rows.results[0].value).owner_history,['v1','v2']);assert.equal((await f.bucket.list()).objects.length,0);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE space=?').bind(f.space('bob')).first()).n,2,'an account pass does not compact another account');
 const replay=await(await f.write('old','asset',{saved:'old'},{attachments:[ref]})).json();assert.equal(replay.revision,original.revision);assert.equal((await f.db.prepare("SELECT revision FROM sync_heads WHERE space=? AND key='asset'").bind(f.space('alice')).first()).revision,current.revision);
 const used=(await(await f.call('/v1/quota')).json()).usedBytes;assert.ok(used<before);await f.call('/v1/maintenance','alice',{});assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,used);
});

test('PCSYNC-17/18 restore within 30 server days is idempotent and competes atomically with confirmed purge',async t=>{
 const f=await cloudFixture(t);await f.enable();const ref=await file(f),revision=await deleted(f,'asset',ref);await age(f,29);await oldBlobs(f);
 const trash=await(await f.call('/v1/trash')).json();assert.equal(trash.items.length,1);assert.equal(trash.items[0].expiresAt-trash.items[0].deletedAt,30*86400000);
 assert.equal((await f.call('/v1/trash','bob')).status,200);assert.equal((await(await f.call('/v1/trash','bob')).json()).items.length,0);
 assert.equal((await purge(f,revision,'asset',false)).status,400);
 const results=await Promise.all([restore(f,revision),purge(f,revision)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 if(results[0].status===200){assert.equal((await restore(f,revision)).status,200);await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,1);}
 else{assert.equal((await restore(f,revision,'too-late')).status,409);await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,0);}
});
test('PCSYNC-17/19 expiry prunes business history but retains tombstones and idempotency receipts',async t=>{
 const f=await cloudFixture(t);await f.enable();const ref=await file(f),revision=await deleted(f,'asset',ref);await age(f,31);await oldBlobs(f);
 assert.equal((await restore(f,revision)).status,409,'expiry is enforced before a maintenance run');
 const before=await(await f.call('/v1/quota')).json();assert.ok(before.usedBytes>ref.size);
 assert.equal((await f.call('/v1/maintenance','alice',{})).status,200);assert.equal((await f.bucket.list()).objects.length,0);assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,0);
 assert.equal((await f.write('create-asset','asset',{content:'asset'},{attachments:[ref]})).status,200,'a lost historical response remains replayable after pruning');
 assert.equal((await f.write('revive','asset',{content:'old device'},{base:revision})).status,409);
 const pull=await(await f.call('/v1/changes?namespace='+encodeURIComponent(f.namespace)+'&after=0')).json();assert.equal(pull.events.length,1);assert.equal(pull.events[0].value,null);assert.equal(pull.events[0].revision,revision);
 assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,0);
});
test('PCSYNC-18 shared references and incomplete cleanup never release bytes prematurely',async t=>{
 const f=await cloudFixture(t);await f.enable();const ref=await file(f);await deleted(f,'asset',ref);await f.write('keep','kept',{content:'kept'},{attachments:[ref]});await age(f,31);await oldBlobs(f);
 await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,1);assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,ref.size+Buffer.byteLength(JSON.stringify({content:'kept'})));
 const spare=await file(f,'abandoned');await oldBlobs(f);const bytesBefore=(await(await f.call('/v1/quota')).json()).usedBytes;
 await f.db.prepare("CREATE TRIGGER simulated_failure BEFORE DELETE ON sync_blobs BEGIN SELECT RAISE(ABORT,'simulated'); END").run();
 await f.call('/v1/maintenance','alice',{});assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytesBefore);
 const job=await f.db.prepare('SELECT state,last_error FROM sync_gc_jobs WHERE digest=?').bind(spare.digest).first();assert.equal(job.state,'pending');assert.equal(job.last_error,'SYNC_GC_FAILED');
 await f.db.prepare('DROP TRIGGER simulated_failure').run();await f.call('/v1/maintenance','alice',{});assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytesBefore-spare.size);
 await f.call('/v1/maintenance','alice',{});assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,bytesBefore-spare.size,'repeat cleanup is accounted once');
});
test('PCSYNC-12/19 generations protect reuploads and the scheduled sweep catches late orphan writes',async t=>{
 const f=await cloudFixture(t);await f.enable();const ref=await file(f,'reused bytes');const old=(await f.bucket.list()).objects[0].key;await oldBlobs(f);await f.call('/v1/maintenance','alice',{});
 const renewed=await file(f,'reused bytes');assert.deepEqual(renewed,ref);const current=(await f.bucket.list()).objects[0].key;assert.notEqual(current,old);
 await f.bucket.put(old,Buffer.from('late original request'));await f.scheduled();
 const objects=(await f.bucket.list()).objects;assert.ok(objects.some(o=>o.key===current));assert.ok(!objects.some(o=>o.key===old));assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,ref.size);
});


test('PCSYNC-17/18 nested removal retains the complete old graph and file from replacement time, with CAS-only recovery',async t=>{
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');const ref=await file(f,'nested child original bytes');
 const original={parent:{id:'parent',title:'完整父项'},children:[{id:'child',parent:'parent',text:'完整子项',file:ref.digest}],history:[{reason:'original'}]};
 const fingerprint=createHash('sha256').update(JSON.stringify(['graph',0,original,[ref],'write'])).digest('hex');
 await f.db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,created_at) VALUES (?,?,?,'graph',0,?,?,1,?,unixepoch()*1000-2678400000)").bind(f.space('alice'),f.namespace,'old-graph',JSON.stringify(original),JSON.stringify([ref]),fingerprint).run();
 const previous=(await f.db.prepare("SELECT revision FROM sync_heads WHERE space=? AND key='graph'").bind(f.space('alice')).first()).revision;
 const current=await(await f.write('remove-nested','graph',{parent:original.parent,children:[],history:original.history},{base:previous})).json();await oldBlobs(f);
 await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,1);
 const query=path=>path+'?'+new URLSearchParams({namespace:f.namespace,key:'graph',revision:String(previous)});
 const inspected=await(await f.call(query('/v1/history/version'))).json();assert.equal(inspected.retained,true);assert.deepEqual(inspected.event.value,original);assert.deepEqual(inspected.event.attachments,[ref]);
 const listed=await(await f.call('/v1/history/keys?'+new URLSearchParams({namespace:f.namespace}))).json();assert.deepEqual(listed.items.map(x=>x.key),['graph']);assert.equal(listed.items[0].versions,1);
 assert.equal((await f.call(query('/v1/history/version'),'bob')).status,404,'another account cannot read the original graph or its file');
 const restore=revision=>f.call('/v1/history/restore','alice',{namespace:f.namespace,key:'graph',sourceRevision:previous,revision,operationId:'restore-nested',policyRevision:1});
 assert.equal((await restore(current.revision+1)).status,409);const restored=await restore(current.revision);assert.equal(restored.status,200,await restored.clone().text());const receipt=await restored.json();
 assert.deepEqual(JSON.parse((await f.db.prepare('SELECT value FROM sync_events WHERE revision=?').bind(receipt.revision).first()).value),original);
 assert.deepEqual(await(await restore(current.revision)).json(),receipt,'retry restores once');
 await f.call('/v1/maintenance','alice',{});assert.equal((await f.bucket.list()).objects.length,1,'the restored current head continues to own its bytes');
});
