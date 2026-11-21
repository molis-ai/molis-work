import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {cloudFixture} from './testing.mjs';

test('PCSYNC-OPT-01 signed rounds reuse an Auth proof and mutations still check live Auth',async t=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const jwk={...publicKey.export({format:'jwk'}),kid:'sync-test',alg:'EdDSA',use:'sig'};
 let revoked=false;
 const f=await cloudFixture(t,{signedAuth(request,Response){
   const {pathname,origin}=new URL(request.url);
   if(pathname==='/.well-known/molis-sync-jwks.json'){
     assert.equal(request.headers.get('Authorization'),null);
     return Response.json({keys:[jwk]});
   }
   assert.equal(pathname,'/api/v2/auth/sync-read-proof');
   const user=request.headers.get('Authorization')?.slice(7);
   if(user==='redirect')return new Response(null,{status:302,headers:{Location:'https://elsewhere.example.test/'}});
   if(revoked)return Response.json({}, {status:401});
   const iat=Math.floor(Date.now()/1000);
   const payload={iss:user==='wrong-issuer'?'https://other.example.test':origin,aud:user==='wrong-app'?'other':'work',
     sub:user,iat:user==='stale'?iat-60:iat,exp:user==='stale'?iat-30:iat+30,scope:'molis-sync:read',
     token_sha256:createHash('sha256').update(user==='wrong-key'?'alice':user).digest('hex')};
   const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const message=encoded({alg:'EdDSA',typ:'molis-sync-read+jwt',kid:jwk.kid})+'.'+encoded(payload);
   const signature=sign(null,Buffer.from(user==='forged'?message+'.bad':message),privateKey).toString('base64url');
   return Response.json({data:{proof:message+'.'+signature}});
 }});
 for(let count=0;count<20;count++){
   const round=await f.call('/v1/round');
   assert.equal(round.status,200);
   assert.equal((await round.json()).policy.spaceId,f.space('alice'));
 }
 assert.deepEqual(f.requests.map(url=>new URL(url).pathname),['/api/v2/auth/sync-read-proof','/.well-known/molis-sync-jwks.json']);
 for(const user of ['wrong-app','wrong-issuer','stale','forged','wrong-key','redirect'])
   assert.equal((await f.call('/v1/round',user)).status,401,user);
 await f.enable();
 assert.equal(new URL(f.requests.at(-1)).pathname,'/api/v2/users/me');
 revoked=true;
 assert.equal((await f.call('/v1/round','bob')).status,401);
});

test('PCSYNC-OPT-01 key rotation evicts unverifiable cached read proof and re-fetches instead of returning 401',async t=>{
 const key1=generateKeyPairSync('ed25519'),key2=generateKeyPairSync('ed25519');
 let activeKey=key1,activeKid='sync-key-1';
 let publishedJwks=[{...key1.publicKey.export({format:'jwk'}),kid:'sync-key-1',alg:'EdDSA',use:'sig'}];
 const f=await cloudFixture(t,{signedAuth(request,Response){
  const {pathname,origin}=new URL(request.url);
  if(pathname==='/.well-known/molis-sync-jwks.json'){
   return Response.json({keys:publishedJwks});
  }
  assert.equal(pathname,'/api/v2/auth/sync-read-proof');
  const user=request.headers.get('Authorization')?.slice(7);
  const iat=Math.floor(Date.now()/1000);
  const payload={iss:origin,aud:'work',sub:user,iat,exp:iat+30,scope:'molis-sync:read',token_sha256:createHash('sha256').update(user).digest('hex')};
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const message=encoded({alg:'EdDSA',typ:'molis-sync-read+jwt',kid:activeKid})+'.'+encoded(payload);
  const signature=sign(null,Buffer.from(message),activeKey.privateKey).toString('base64url');
  return Response.json({data:{proof:message+'.'+signature}});
 }});
 assert.equal((await f.call('/v1/round','alice')).status,200);
 // Rotate Auth to key2 and drop key1 from JWKS; bob's unknown kid forces the Worker to refresh JWKS to key2-only.
 activeKey=key2;activeKid='sync-key-2';
 publishedJwks=[{...key2.publicKey.export({format:'jwk'}),kid:'sync-key-2',alg:'EdDSA',use:'sig'}];
 assert.equal((await f.call('/v1/round','bob')).status,200);
 // alice still has a cached unexpired key1 proof; verification fails against key2-only JWKS and must evict & retry once.
 const afterRotation=await f.call('/v1/round','alice');
 assert.equal(afterRotation.status,200,'cached proof signed by retired key must evict and re-fetch a valid proof');
 assert.equal((await afterRotation.json()).policy.spaceId,f.space('alice'));
});

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

test('PCSYNC-26/PCSYNC-OPT-02 edge limits protect Auth and accounts without writing D1 rate windows',async t=>{
 const f=await cloudFixture(t,{rateLimit:12});
 const selections=Array.from({length:26},(_,i)=>({...f.selection,collection_id:'records-'+i}));
 assert.equal((await f.call('/v1/policy','alice',{spaceId:f.space('alice'),revision:0,selections},'PUT')).status,200);
 for(let i=0;i<10;i++){
   const response=await f.call('/v1/round');
   assert.equal(response.status,200);
   assert.equal((await response.json()).heads.length,26);
 }
 assert.equal((await f.db.prepare('SELECT count(*) AS count FROM sync_rate_windows').first()).count,0);
 assert.equal((await f.call('/v1/quota')).status,200);
 const calls=f.requests.length;
 const rejected=await f.call('/v1/quota','bob');
 assert.equal(rejected.status,429);assert.equal(rejected.headers.get('Retry-After'),'60');
 assert.equal(f.requests.length,calls,'over-limit IP requests do not call Auth');
 const anotherIP=user=>f.call('/v1/quota',user,undefined,'GET','https://sync.example.test','192.0.2.2');
 assert.equal((await anotherIP('alice')).status,429,'a different IP does not reset the account limit');
 assert.equal((await anotherIP('bob')).status,200);
});

test('PCSYNC-OPT-05 change pages enforce event and UTF-8 byte limits without skipping a revision',{timeout:60000},async t=>{
 const f=await cloudFixture(t);await f.enable();
 const page=async after=>{
   const response=await f.call('/v1/changes?namespace='+encodeURIComponent(f.namespace)+'&after='+after);
   assert.equal(response.status,200);
   const wire=await response.text();
   assert.ok(Buffer.byteLength(wire)<=2*1024*1024);
   return JSON.parse(wire);
 };
 const write=async (prefix,count,value)=>{
   for(let i=0;i<count;i++)assert.equal((await f.write(prefix+i,prefix+i,value)).status,200);
 };
 await write('small-',50,'a'.repeat(2048));
 const first=await page(0);
 assert.equal(first.events.length,20);assert.equal(first.more,true);
 const second=await page(first.events.at(-1).revision);
 const third=await page(second.events.at(-1).revision);
 assert.equal(third.more,false);
 assert.deepEqual([...first.events,...second.events,...third.events].map(event=>event.key),Array.from({length:50},(_,i)=>'small-'+i));
 await write('large-',10,'云'.repeat(136_533));
 const large=await page(third.events.at(-1).revision);
 assert.equal(large.events.length,5);assert.equal(large.more,true);
 const tail=await page(large.events.at(-1).revision);
 assert.equal(tail.more,false);
 assert.deepEqual([...large.events,...tail.events].map(event=>event.key),Array.from({length:10},(_,i)=>'large-'+i));
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

test('PCSYNC-OPT-03 read schema checks are cached but writes still validate every guard',async t=>{
 const f=await cloudFixture(t);await f.enable();
 assert.equal((await f.call('/v1/round')).status,200);
 await f.db.prepare('DROP TRIGGER sync_events_validate').run();
 for(let i=0;i<19;i++)assert.equal((await f.call('/v1/round')).status,200);
 const refused=await f.write('invalid','record','must not be written');
 assert.equal(refused.status,503);
 assert.equal((await refused.json()).error,'SYNC_SCHEMA_MISMATCH');
 assert.equal((await f.db.prepare('SELECT count(*) AS count FROM sync_events').first()).count,0);
 const before=f.requests.length;
 assert.equal((await f.call('/v1/round')).status,503,'schema failure invalidates the cached read check');
 assert.equal(f.requests.length,before,'schema mismatch is refused before calling Auth');
});
