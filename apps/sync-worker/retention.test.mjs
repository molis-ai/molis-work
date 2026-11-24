import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
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

test('PCSYNC-OPT-12 storage breakdown bills shared blobs once and stays in the caller space',async t=>{
 const f=await cloudFixture(t);await f.enable();
 const shared=await file(f,'one shared file'),spare=await file(f,'reserved bytes');
 assert.equal((await f.write('live','live','current',{attachments:[shared]})).status,200);
 await deleted(f,'trash',shared);
 const revision=(await f.db.prepare("SELECT revision FROM sync_heads WHERE key='live'").first()).revision;
 assert.equal((await f.write('next','live','latest',{base:revision,attachments:[shared]})).status,200);
 const own=await(await f.call('/v1/quota/breakdown')).json();
 assert.equal(own.currentBytes,shared.size+Buffer.byteLength(JSON.stringify('latest')));
 assert.equal(own.historyBytes,Buffer.byteLength(JSON.stringify('current')));
 assert.equal(own.trashBytes,Buffer.byteLength(JSON.stringify({content:'trash'})));
 assert.equal(own.reservedAttachmentBytes,spare.size);
 assert.equal(own.usedBytes,own.currentBytes+own.historyBytes+own.trashBytes+own.reservedAttachmentBytes);
 assert.equal((await(await f.call('/v1/quota/breakdown','bob')).json()).usedBytes,0);
});

test('PCSYNC-OPT-12 permanent trash removes only the confirmed revision and releases text capacity atomically',async t=>{
 const disabled=await cloudFixture(t,{permanentCleanup:false});await disabled.enable();
 const blocked=await deleted(disabled);
 assert.equal((await purge(disabled,blocked)).status,409);
 assert.equal((await(await disabled.call('/v1/trash')).json()).permanentCleanup,undefined);
 const f=await cloudFixture(t);await f.enable();await f.enable('bob');
 const revision=await deleted(f),other=await deleted(f,'other');
 assert.equal((await(await f.call('/v1/trash')).json()).permanentCleanup,true);
 assert.equal((await f.call('/v1/trash/purge','bob',{namespace:f.namespace,key:'asset',revision,confirm:true})).status,404);
 assert.equal((await purge(f,revision,'asset',false)).status,400);
 assert.equal((await purge(f,other,'asset')).status,409);
 assert.equal((await purge(f,revision)).status,200);
 assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,Buffer.byteLength(JSON.stringify({content:'other'})));
 assert.equal((await restore(f,revision)).status,404,'the permanently removed text is no longer recoverable');
});

test('PCSYNC-OPT-11 maintenance reclaims 20 generations and tombstone histories per pass',async t=>{
 const f=await cloudFixture(t);await f.enable();
 const keep=await file(f,'shared live attachment');
 assert.equal((await f.write('live','live','kept',{attachments:[keep]})).status,200);
 for(let i=0;i<22;i++){
   const ref=await file(f,'retained bytes '+i);
   await deleted(f,'expired-'+i,ref);
 }
 await deleted(f,'shared',keep);
 await age(f,31);await oldBlobs(f);
 const run=async()=>{
   const response=await f.call('/v1/maintenance','alice',{});
   assert.equal(response.status,200);
   return (await response.json()).collected;
 };
 assert.equal(await run(),20);
 const purged=await f.db.prepare('SELECT COUNT(*) AS n FROM sync_heads WHERE purged_at IS NOT NULL').first();
 assert.equal(purged.n,20);
 assert.equal(await run(),2);
 assert.equal((await f.bucket.list()).objects.length,1);
 const quota=(await(await f.call('/v1/quota')).json()).usedBytes;
 assert.equal(quota,keep.size+Buffer.byteLength(JSON.stringify('kept')));
});

for(const mode of ['read-only','mistyped-mode'])test('PCSYNC-26 operator '+mode+' preserves D1/R2 across every mutation and scheduled GC',async t=>{
 const f=await cloudFixture(t,{rateLimit:40});await f.enable();await f.enable('bob');const ref=await file(f,'paired backup original');
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
 const fromOneIP=()=>f.call('/v1/round','invalid',undefined,'GET','https://sync.example.test','192.0.2.9');
 for(let i=0;i<40;i++)assert.equal((await fromOneIP()).status,401);
 assert.equal((await fromOneIP()).status,429,'edge rate checks remain active during maintenance');
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_rate_windows').first()).n,0);
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
 const [restored,purged]=await Promise.all([restore(f,revision),purge(f,revision)]);
 const restoreWon=restored.status===200;
 if(restoreWon){
  assert.equal(purged.status,409);
  assert.equal((await purged.json()).error,'SYNC_RETENTION_CONFLICT');
  assert.equal((await restore(f,revision)).status,200);
 }else{
  assert.equal(purged.status,200);
  // An in-flight restore sees the purged head. A restore whose read starts later finds no retained content.
  const reason=(await restored.json()).error;
  assert.ok((restored.status===409 && reason==='SYNC_ITEM_PURGED') ||
   (restored.status===404 && reason==='SYNC_RECOVERY_MISSING'), `unexpected restore response: ${restored.status} ${reason}`);
 }
 await f.call('/v1/maintenance','alice',{});
 assert.equal((await f.bucket.list()).objects.length,restoreWon?1:0);
 // Exercise a completed purge on every run, regardless of which request won the race above.
 const gone=await deleted(f,'purged-first');
 assert.equal((await purge(f,gone,'purged-first')).status,200);
 const late=await restore(f,gone,'too-late','purged-first');
 assert.equal(late.status,404);assert.equal((await late.json()).error,'SYNC_RECOVERY_MISSING');
 const head=await f.db.prepare('SELECT revision,purged_at FROM sync_heads WHERE space=? AND namespace=? AND key=?').bind(f.space('alice'),f.namespace,'purged-first').first();
 assert.equal(head.revision,gone);assert.ok(head.purged_at>0);
 const prior=await deleted(f,'restored-first');
 const recover=()=>restore(f,prior,'recover-first','restored-first');
 assert.equal((await recover()).status,200);
 const stale=await purge(f,prior,'restored-first');
 assert.equal(stale.status,409);assert.equal((await stale.json()).error,'SYNC_RETENTION_CONFLICT');
 assert.equal((await recover()).status,200);
 const rows=await f.db.prepare("SELECT value FROM sync_events WHERE space=? AND namespace=? AND key=? AND action='restore'").bind(f.space('alice'),f.namespace,'restored-first').all();
 assert.deepEqual(rows.results.map(row=>JSON.parse(row.value)),[{content:'restored-first'}]);
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

test('PCSYNC-OPT-10 body compression and continuous-edit folding cut quota growth by >=70% while keeping conflicts and trash for 30 days',async t=>{
 const f=await cloudFixture(t);await f.enable();
 const codec=createSyncJsonContent({spaceId:f.space('alice'),authorize(){}});
 const blobs=new Map();
 let base=0,naiveTotal=0,foldedOp=null,foldedRevision=0;
 for(let i=0;i<30;i++){
  const doc={id:'doc-opt10',revision:i,sections:Array.from({length:40},(_,s)=>({title:`Section ${s}`,body:`Structured personal notes and goals content paragraph ${s} version ${i}. `.repeat(70)}))};
  const rawSize=Buffer.byteLength(JSON.stringify(doc));
  assert.ok(rawSize>=180_000,'each revision is ~200 KiB structured payload');
  naiveTotal+=rawSize;
  const encoded=codec.encode('doc-opt10',doc);
  const refs=[];
  for(const blob of encoded.blobs){
   blobs.set(blob.digest,blob.bytes);
   const ref={digest:blob.digest,size:blob.size};
   assert.equal((await f.call('/v1/blobs/reserve','alice',{namespace:f.namespace,...ref})).status,200);
   assert.equal((await f.transport('https://sync.example.test/v1/blobs/chunk?'+new URLSearchParams({namespace:f.namespace,digest:ref.digest,part:'0'}),{method:'PUT',headers:{Authorization:'Bearer alice'},body:blob.bytes})).status,200);
   assert.equal((await f.call('/v1/blobs/complete','alice',{namespace:f.namespace,digest:ref.digest})).status,200);
   refs.push(ref);
  }
  const op=`burst-${i}`;
  const res=await f.write(op,'doc-opt10',encoded.value,{base,attachments:refs});
  assert.equal(res.status,200);
  const {revision}=await res.json();
  if(i===10){foldedOp={op,base,value:encoded.value,attachments:refs};foldedRevision=revision;}
  if(i===15){
   const archived=await f.call('/v1/history/archive','alice',{namespace:f.namespace,policyRevision:1,mutation:{operationId:'conflict-pin',key:'doc-opt10',base:revision,value:{conflict:'must-keep-30-days'}},attachments:[]});
   assert.equal(archived.status,200);
  }
  base=revision;
  if(i===29){
   const decoded=await codec.decode('doc-opt10',encoded.value,async ref=>blobs.get(ref.digest));
   assert.deepEqual(decoded,doc,'compressed structured aggregate round-trips identically');
  }
 }
 const billed=(await(await f.call('/v1/quota')).json()).usedBytes;
 assert.ok(billed<naiveTotal*0.3,`expected >=70% savings, got billed=${billed} vs naive=${naiveTotal}`);
 const remaining=(await f.db.prepare("SELECT COUNT(*) AS n FROM sync_events WHERE space=? AND key='doc-opt10' AND action='write'").bind(f.space('alice')).first()).n;
 assert.equal(remaining,2,'burst folding keeps only burst baseline + current head');
 const replay=await f.write(foldedOp.op,'doc-opt10',foldedOp.value,{base:foldedOp.base,attachments:foldedOp.attachments});
 assert.equal(replay.status,200);
 assert.equal((await replay.json()).revision,foldedRevision,'folded edit receipt stays idempotent');
 const pinned=(await f.db.prepare("SELECT COUNT(*) AS n FROM sync_events WHERE space=? AND key='doc-opt10' AND action='archive'").bind(f.space('alice')).first()).n;
 assert.equal(pinned,1,'conflict archive branch is never folded');
 const trashed=await deleted(f,'trash-keep');
 assert.ok(trashed>0);
 await f.call('/v1/maintenance','alice',{});
 assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM sync_events WHERE space=? AND key='trash-keep' AND value<>'null'").bind(f.space('alice')).first()).n,1,'deleted trash body stays preserved for 30 days');
 // Zip-bomb / tampered compressed payload rejection
 const sample=codec.encode('doc-opt10',{x:'a'.repeat(10_000)});
 assert.equal(sample.value.encoding,'deflate-raw');
 await assert.rejects(()=>codec.decode('doc-opt10',{...sample.value,size:100},async()=>{throw new Error('unexpected');}),/同步内容/);
 // Oversized compressed chunk ref (> PART + 1024) and dead compressed_digest envelope must be rejected before reading.
 const largeDoc={id:'doc-amp',body:'alpha-beta-gamma-'.repeat(8000)};
 const encodedLarge=codec.encode('doc-amp',largeDoc);
 assert.equal(encodedLarge.value.encoding,'deflate-raw-chunks');
 await assert.rejects(
  ()=>codec.decode('doc-amp',{...encodedLarge.value,parts:[{digest:'a'.repeat(64),size:2*1024*1024}]},async()=>{throw new Error('must not download oversized compressed part');}),
  /同步分块长度无效/,
 );
 await assert.rejects(
  ()=>codec.decode('doc-amp',{sync_content:1,encoding:'deflate-raw',spaceId:f.space('alice'),key:'doc-amp',size:100000,digest:'a'.repeat(64),compressed_size:100,compressed_digest:'b'.repeat(64),parts:[{digest:'c'.repeat(64),size:100}]},async()=>{throw new Error('dead envelope must not read');}),
  /同步内容与空间或资产不匹配/,
 );
});

test('PCSYNC-OPT-10 cross-day independent milestone version keeps full 30-day retention when superseded',async t=>{
 const f=await cloudFixture(t);await f.enable();
 const now=Date.now();
 const seedAt=async(operation,base,value,createdAt)=>{
  const fingerprint=createHash('sha256').update(JSON.stringify(['milestone-doc',base,value,[],'write'])).digest('hex');
  await f.db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,action,created_at) VALUES (?,?,?,?,?,?,?,1,?,'write',?)")
   .bind(f.space('alice'),f.namespace,operation,'milestone-doc',base,JSON.stringify(value),'[]',fingerprint,createdAt).run();
  return (await f.db.prepare("SELECT revision FROM sync_heads WHERE space=? AND namespace=? AND key='milestone-doc'").bind(f.space('alice'),f.namespace).first()).revision;
 };
 // Day 1 baseline (3 days ago)
 const v1=await seedAt('m-v1',0,{text:'day-1-baseline'},now-3*86400000);
 // Day 4 independent milestone (2 hours ago, > 24h after v1)
 const v2Created=now-2*3600000;
 const v2=await seedAt('m-v2',v1,{text:'day-4-milestone'},v2Created);
 // New edit superseding v2 (v2 had NO prior write within 24h before v2, so v2 must keep 30-day retention)
 const v3Res=await f.write('m-v3','milestone-doc',{text:'day-4-edit-2'},{base:v2});
 assert.equal(v3Res.status,200);
 const v3=(await v3Res.json()).revision;
 const v2Retention=await f.db.prepare('SELECT retained_until FROM sync_version_retention WHERE space=? AND namespace=? AND revision=?').bind(f.space('alice'),f.namespace,v2).first();
 assert.ok(v2Retention.retained_until>now+29*86400000,`independent milestone v2 must retain 30-day window, got retained_until=${v2Retention.retained_until}`);
 // A subsequent edit superseding v3 DOES have older v2 within 24h, while v2 still keeps 30-day retention.
 const v4Res=await f.write('m-v4','milestone-doc',{text:'day-4-edit-3'},{base:v3});
 assert.equal(v4Res.status,200);
 const v2After=await f.db.prepare('SELECT retained_until FROM sync_version_retention WHERE space=? AND namespace=? AND revision=?').bind(f.space('alice'),f.namespace,v2).first();
 assert.ok(v2After.retained_until>now+29*86400000,'milestone v2 keeps 30-day retention after later edits');
});
