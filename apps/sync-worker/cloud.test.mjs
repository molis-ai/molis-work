import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-01/26 round summaries isolate accounts and report ordinary tombstones, never retained archives',async t=>{
 const f=await cloudFixture(t);
 assert.equal((await f.call('/v1/round','invalid')).status,401);assert.equal((await f.call('/v1/round','wrong-app')).status,403);
 assert.deepEqual(await(await f.call('/v1/round')).json(),{format:1,policy:{spaceId:f.space('alice'),revision:0,selections:[]},quota:{limitBytes:100000000,usedBytes:0},heads:[]});
 await f.enable();await f.enable('bob');
 const first=await(await f.write('summary-first','record','saved')).json();assert.equal(first.accepted,true);
 let summary=await(await f.call('/v1/round')).json();assert.deepEqual(summary.heads,[{namespace:f.namespace,revision:first.revision}]);
 assert.deepEqual((await(await f.call('/v1/round','bob')).json()).heads,[{namespace:f.namespace,revision:0}]);
 const archive=await f.call('/v1/history/archive','alice',{namespace:f.namespace,policyRevision:1,mutation:{operationId:'retained-summary-branch',key:'record',base:first.revision,value:'retained only'},attachments:[]});assert.equal(archive.status,200);
 const retained=await archive.json();assert.ok(retained.revision>first.revision);
 summary=await(await f.call('/v1/round')).json();assert.equal(summary.heads[0].revision,first.revision,'archives do not wake the download stream');
 const deleted=await(await f.write('summary-delete','record',null,{base:first.revision})).json();assert.ok(deleted.revision>retained.revision);
 summary=await(await f.call('/v1/round')).json();assert.equal(summary.heads[0].revision,deleted.revision,'null tombstones must still wake an idle client');
 assert.deepEqual(summary.quota,await(await f.call('/v1/quota')).json());
 const disabled=await f.call('/v1/policy','alice',{spaceId:f.space('alice'),revision:1,selections:[]},'PUT');assert.equal(disabled.status,200);
 assert.deepEqual((await(await f.call('/v1/round')).json()).heads,[],'disabled namespaces are not disclosed in summaries');
});

test('PCSYNC-26 rate limits reject before Auth and independently bound authenticated accounts',async t=>{
 const f=await cloudFixture(t);await f.call('/v1/quota');const calls=f.requests.length;
 await f.db.prepare("UPDATE sync_rate_windows SET hits=600 WHERE bucket LIKE 'ip:%'").run();assert.equal((await f.call('/v1/quota')).status,429);assert.equal(f.requests.length,calls,'over-limit requests do not call Auth');
 await f.db.prepare("DELETE FROM sync_rate_windows WHERE bucket LIKE 'ip:%'").run();await f.db.prepare("UPDATE sync_rate_windows SET hits=600 WHERE bucket=?").bind('account:'+f.space('alice')).run();
 assert.equal((await f.call('/v1/quota')).status,429);assert.equal((await f.call('/v1/quota','bob')).status,200);
});

test('PCSYNC-01 cloud Auth is HTTPS-only, redirects and wrong applications are refused',{timeout:60000},async t=>{
  const f=await cloudFixture(t);
  assert.equal((await f.call('/v1/quota','alice',undefined,'GET','http://sync.example.test')).status,400);
  assert.equal((await f.call('/v1/quota','invalid')).status,401);
  assert.equal((await f.call('/v1/quota','wrong-app')).status,403);
  const before=f.requests.length;assert.equal((await f.call('/v1/quota','redirect')).status,401);
  assert.equal(f.requests.length,before+1,'no redirected request receives the Bearer token');
  await f.enable();
  assert.equal((await f.call('/v1/policy','bob',{spaceId:f.space('alice'),revision:0,selections:[f.selection]},'PUT')).status,403);
  assert.equal((await f.call('/v1/changes','alice',{spaceId:f.space('bob'),namespace:f.namespace,policyRevision:1,mutation:{operationId:'forged',key:'x',base:0,value:'x'}})).status,400);
  assert.equal((await f.call('/v1/changes?namespace='+encodeURIComponent(f.namespace)+'&after=0','bob')).status,403);
  const insecure=await cloudFixture(t,{authOrigin:'http://127.0.0.1:8787'});
  assert.equal((await insecure.call('/v1/quota')).status,503);assert.equal(insecure.requests.length,0);
});

test('PCSYNC-09 UTF-8 canonical payloads and retained versions count, tombstones and replays do not',{timeout:60000},async t=>{
  const f=await cloudFixture(t);await f.enable();await f.enable('bob');
  const value={text:'成都 🦈',nested:[1,true]},bytes=Buffer.byteLength(JSON.stringify(value));
  assert.equal((await f.write('first','record',value)).status,200);
  let quota=await(await f.call('/v1/quota')).json();assert.deepEqual(quota,{usedBytes:bytes,limitBytes:100000000});
  assert.equal((await f.write('first','record',value)).status,200);
  assert.deepEqual(await(await f.call('/v1/quota')).json(),quota,'replay has no second charge');
  assert.equal((await f.write('first','record','different')).status,409);
  const first=await f.db.prepare('SELECT revision FROM sync_events WHERE operation=?').bind('first').first();
  assert.equal((await f.write('second','record','smaller',{base:first.revision})).status,200);
  quota=await(await f.call('/v1/quota')).json();assert.equal(quota.usedBytes,bytes+Buffer.byteLength(JSON.stringify('smaller')));
  const second=await f.db.prepare('SELECT revision FROM sync_events WHERE operation=?').bind('second').first();
  assert.equal((await f.write('delete','record',null,{base:second.revision})).status,200);
  assert.deepEqual(await(await f.call('/v1/quota')).json(),quota,'soft delete retains previous content bytes');
  assert.deepEqual(await(await f.call('/v1/quota','bob')).json(),{limitBytes:100000000,usedBytes:0});
  await f.db.prepare('DELETE FROM sync_events WHERE operation=?').bind('first').run();
  assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,Buffer.byteLength(JSON.stringify('smaller')),'controlled retention pruning releases exactly its bytes');
});

test('PCSYNC-09/10 parallel admissions cannot exceed 100 MB; full accounts still delete, pull and replay',{timeout:60000},async t=>{
  const f=await cloudFixture(t);await f.enable();
  assert.equal((await f.write('seed','deleted-later','keep')).status,200);
  const seed=await f.db.prepare('SELECT revision FROM sync_events WHERE operation=?').bind('seed').first();
  // Simulate pre-existing retained data at the boundary without allocating 100 MB per test.
  await f.db.prepare('UPDATE sync_usage SET used_bytes=? WHERE space=?').bind(99999994,f.space('alice')).run();
  const replies=await Promise.all([f.write('parallel-a','a','four'),f.write('parallel-b','b','four')]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,413]);
  assert.deepEqual(await(await f.call('/v1/quota')).json(),{limitBytes:100000000,usedBytes:100000000});
  assert.equal((await f.write('blocked','blocked','x')).status,413);
  assert.equal((await f.write('delete-full','deleted-later',null,{base:seed.revision})).status,200);
  assert.equal((await f.write('seed','deleted-later','keep')).status,200,'idempotent reply stays available at capacity');
  assert.equal((await f.call('/v1/changes?namespace='+encodeURIComponent(f.namespace)+'&after=0')).status,200);
  assert.equal((await(await f.call('/v1/quota')).json()).usedBytes,100000000);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE operation=?').bind('blocked').first()).n,0);
  await f.enable('bob');assert.equal((await f.write('bob','record','x',{user:'bob'})).status,200);
});

test('PCSYNC-09 concurrent identical operations charge once, conflicts and stale policy leave quota unchanged',{timeout:60000},async t=>{
  const f=await cloudFixture(t);await f.enable();
  const pair=await Promise.all([f.write('same','record','payload'),f.write('same','record','payload')]);
  assert.deepEqual(pair.map(r=>r.status),[200,200]);
  const before=await(await f.call('/v1/quota')).json();
  assert.equal((await f.write('stale','record','lost')).status,409);
  assert.equal((await f.write('wrong-policy','new','lost',{policyRevision:0})).status,409);
  assert.deepEqual(await(await f.call('/v1/quota')).json(),before);
});

test('PCSYNC-01 current schema is required; requests never patch an old database',{timeout:60000},async t=>{
  const f=await cloudFixture(t,{schema:false});
  assert.equal((await f.call('/v1/quota')).status,503);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'sync_%'").first()).n,0);
});
