import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesActions as actions, IMAGES_ACTION_PERMISSIONS, type ImageJob } from "@molis-ai/molis-work-plugin-images";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, createFileSecretStore, peekSealedEntry, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { readdirSync } from "node:fs";
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
async function fixture(t:test.TestContext,directory?:string) {
  const home=directory??await mkdtemp(join(tmpdir(),'images-actions-'));
  const hosts:MolisWorkLocalHost[]=[];
  const open=()=>{const host=new MolisWorkLocalHost({homeDirectory:home});hosts.push(host);return host;};
  const host=open(), ref=molisWorkHostProjectReference({databasePath:join(home,'project.sqlite'),projectId:'a'});
  const bind=(host:MolisWorkLocalHost,projectId:string|null='a',permissions:readonly string[]=IMAGES_ACTION_PERMISSIONS)=>bindActionClient(projectId?host.actionClient(projectId === 'a' ? ref : molisWorkHostProjectReference({databasePath:join(home,`${projectId}.sqlite`),projectId:projectId})):host.homeActionClient(),()=>({actor_id:'owner',project_id:projectId,audience:'user',permissions}));
  t.after(async()=>{await Promise.all(hosts.map(host=>host.close()));await rm(home,{recursive:true,force:true});});
  return {home,host,open,bind,client:bind(host),global:bind(host,null)};
}
async function terminal(client:BoundActionClient,id:string):Promise<ImageJob>{
  const deadline=Date.now()+5000;
  while(true){const {job}=await client.invoke(actions.get,{id});if(job.status!=='running')return job;
    if(Date.now()>deadline)throw new Error('Image job did not finish');await new Promise(resolve=>setTimeout(resolve,10));}
}

test('Images actions use real provider bytes, original jobs, retry identity and shared Host lifetime',async t=>{
  const f=await fixture(t);let calls=0;const observed:unknown[]=[];
  const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;calls++;observed.push(JSON.parse(raw));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:PNG}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const catalog=await f.client.discover();for(const action of Object.values(actions))assert.ok(catalog.some(item=>item.capability_id===action.capability_id));assert.equal(calls,0);
  const {connection}=await f.global.invoke(actions.saveConnection,{name:'Local images',api_format:'openai-images',base_url:`http://127.0.0.1:${address.port}/v1`,model:'fixture-images'});
  assert.equal(connection.available,true);assert.equal(connection.has_key,false);
  await assert.rejects(f.bind(f.host,'a',['images:read']).invoke(actions.start,{request_id:'denied',connection_id:connection.id,prompt:'denied'}),{code:'actions.forbidden'});
  await assert.rejects(f.global.invoke(actions.saveConnection,{name:'bad',api_format:'openai-images',base_url:'https://example.com',model:'test',api_key:'not-accepted'} as never),{code:'actions.input_invalid'});
  const input={request_id:'one-click',connection_id:connection.id,prompt:'验证原始图片'};
  await assert.rejects(f.global.invoke(actions.start,input),{code:'actions.project_required'});
  const {job}=await f.client.invoke(actions.start,input);
  assert.equal((await f.client.invoke(actions.start,input)).job.id,job.id);
  await assert.rejects(f.client.invoke(actions.start,{...input,prompt:'changed'}),{code:'images.request_conflict'});
  const finished=await terminal(f.client,job.id);assert.equal(finished.status,'succeeded');assert.equal(calls,1);
  assert.deepEqual(observed,[{model:'fixture-images',prompt:'验证原始图片'}]);
  const image=await f.client.invoke(actions.image,{id:job.id,image_id:finished.images[0]!.id});assert.equal(image.mime_type,'image/png');assert.deepEqual(Buffer.from(image.base64,'base64'),Buffer.from(PNG,'base64'));
  assert.deepEqual((await f.bind(f.host,'b').invoke(actions.list,{})).jobs,[]);
  await assert.rejects(f.bind(f.host,'b').invoke(actions.image,{id:job.id,image_id:finished.images[0]!.id}),{code:'images.not_found'});
  // RAC-105-A-18: the second Host is refused at Home acquisition, before an inference service can be constructed.
  const kept=(await f.client.invoke(actions.list,{})).jobs;
  assert.throws(() => f.open(), { code: 'storage.owner.busy' }, 'one Home cannot silently acquire a second Host owner');
  assert.deepEqual((await f.client.invoke(actions.list,{})).jobs,kept);assert.equal(calls,1);
  await f.host.close();
  const other=f.open(),otherClient=f.bind(other);assert.equal((await otherClient.invoke(actions.get,{id:job.id})).job.id,job.id);
  assert.equal((await otherClient.invoke(actions.start,input)).job.id,job.id);assert.equal(calls,1);
  await otherClient.invoke(actions.deleteConnection,{id:connection.id});assert.equal((await otherClient.invoke(actions.get,{id:job.id})).job.status,'succeeded');
  assert.deepEqual((await otherClient.invoke(actions.connections,{})).connections,[]);
  await other.close();const restarted=f.open(),restartedClient=f.bind(restarted);assert.deepEqual((await restartedClient.invoke(actions.image,{id:job.id,image_id:finished.images[0]!.id})),image);
  await restartedClient.invoke(actions.delete,{id:job.id});assert.deepEqual((await restartedClient.invoke(actions.list,{})).jobs,[]);
});

test('Images connection revocation rejects late results and cannot fall back to anonymous local requests',async t=>{
  const priorBackend=process.env.MOLIS_WORK_SECRET_BACKEND;process.env.MOLIS_WORK_SECRET_BACKEND='file';resetSecretStoreCache();
  t.after(()=>{if(priorBackend===undefined)delete process.env.MOLIS_WORK_SECRET_BACKEND;else process.env.MOLIS_WORK_SECRET_BACKEND=priorBackend;resetSecretStoreCache();});
  const f=await fixture(t),entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();let calls=0;
  const server=createServer(async(req,res)=>{for await(const _ of req){};calls++;assert.equal(req.headers.authorization,'Bearer fixture-image-token');entered.resolve();await release.promise;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:PNG}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{release.resolve();return new Promise<void>(resolve=>server.close(()=>resolve()));});
  const address=server.address();assert.ok(address&&typeof address==='object');
  const auth=withConnectorConnections(f.home,store=>store.createToken({serviceId:'image-api',displayName:'fixture',token:'fixture-image-token'}));
  const {connection}=await f.global.invoke(actions.saveConnection,{name:'Bound local',api_format:'openai-images',base_url:`http://127.0.0.1:${address.port}/v1`,model:'fixture',auth_connection_id:auth.connection_id});
  const {job}=await f.client.invoke(actions.start,{request_id:'revoke',connection_id:connection.id,prompt:'first'});await entered.promise;
  withConnectorConnections(f.home,store=>store.disconnect(auth.connection_id));release.resolve();
  // W5-01-IMGPORT-02: connection revocation cannot append even a failure business record.
  await new Promise(resolve=>setTimeout(resolve,300));
  const {job:unchanged}=await f.client.invoke(actions.get,{id:job.id});assert.equal(unchanged.status,'running');assert.deepEqual(unchanged.images,[]);assert.equal(unchanged.error,'');
  const listed=await f.global.invoke(actions.connections,{});assert.equal(listed.connections[0]!.available,false);assert.equal(listed.auth_connections[0]!.state,'disconnected');
  await assert.rejects(f.client.invoke(actions.start,{request_id:'new',connection_id:connection.id,prompt:'second'}),{code:'images.key_required'});assert.equal(calls,1);
});

test('Images action cancellation and Host shutdown preserve terminal jobs without regenerating',async t=>{
  const f=await fixture(t);let calls=0;
  const server=createServer(async(req,_res)=>{for await(const _ of req){};calls++;});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise<void>(resolve=>server.close(()=>resolve()));});
  const address=server.address();assert.ok(address&&typeof address==='object');
  const {connection}=await f.global.invoke(actions.saveConnection,{name:'Waiting',api_format:'openai-images',base_url:`http://127.0.0.1:${address.port}/v1`,model:'fixture'});
  const first={request_id:'cancel',connection_id:connection.id,prompt:'first'},second={...first,request_id:'close'};
  const a=(await f.client.invoke(actions.start,first)).job,b=(await f.client.invoke(actions.start,second)).job;
  await assert.rejects(f.client.invoke(actions.delete,{id:a.id}),{code:'images.running'});
  assert.equal((await f.client.invoke(actions.cancel,{id:a.id})).job.status,'cancelled');
  await f.host.close();const before=calls,restarted=f.open(),client=f.bind(restarted);
  assert.equal((await client.invoke(actions.start,first)).job.status,'cancelled');assert.equal((await client.invoke(actions.start,second)).job.status,'interrupted');
  assert.equal((await client.invoke(actions.get,{id:b.id})).job.status,'interrupted');assert.equal(calls,before);
});

test('Images discovery never decrypts the chosen connection key, and generation sends it once unchanged', async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const f = await fixture(t);
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  // The provider is a real local server: image requests go through the runtime's own network path (including its DNS checks), not a fetch stub.
  const authorizations: string[] = [];
  const server = createServer(async (req, res) => { for await (const _ of req) { /* drain */ } authorizations.push(String(req.headers.authorization ?? ''));
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: PNG }] })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const account = withConnectorConnections(f.home, store => store.createToken({ serviceId: 'image-api', displayName: '图片账号', token: 'existing-fixture-image-key' }));
  const { connection } = await f.global.invoke(actions.saveConnection, { name: '已有服务', api_format: 'openai-images',
    base_url: `http://127.0.0.1:${address.port}/v1`, model: 'existing-model', auth_connection_id: account.connection_id });
  const sealed = () => runWithMolisWorkHome(f.home, () => peekSealedEntry(account.credential_ref!));
  const original = sealed(); assert.ok(original);
  let decryptStack = '';
  const get = t.mock.method(secrets, 'get', () => { const error = new Error('Discovery must not decrypt'); decryptStack = error.stack ?? ''; throw error; });
  const list = await f.global.invoke(actions.connections, {});
  assert.equal(get.mock.callCount(), 0, decryptStack);
  assert.equal(list.connections[0]!.id, connection.id); assert.equal(list.connections[0]!.available, true);
  assert.equal(list.auth_connections.length, 1);
  assert.equal(list.connections[0]!.auth_connection_id, account.connection_id);
  assert.equal(sealed(), original);
  assert.doesNotMatch(JSON.stringify(list), /existing-fixture-image-key|credential_ref|api_key/);
  get.mock.restore();
  // ASC-16 ASC-20: disabling preserves the selected account and key, but refuses dispatch.
  withConnectorConnections(f.home, store => store.setEnabled(account.connection_id, false));
  const disabled = await f.global.invoke(actions.connections, {});
  assert.equal(disabled.auth_connections[0]!.enabled, false);
  assert.equal(disabled.connections[0]!.auth_connection_id, account.connection_id);
  assert.equal(disabled.connections[0]!.available, false);
  await assert.rejects(f.client.invoke(actions.start, { connection_id: connection.id, request_id: 'disabled-key', prompt: 'must not send' }), { code: 'images.key_required' });
  assert.deepEqual(authorizations, []);
  withConnectorConnections(f.home, store => store.setEnabled(account.connection_id, true));
  assert.equal(sealed(), original);
  const { job } = await f.client.invoke(actions.start, { connection_id: connection.id, request_id: 'chosen-key', prompt: 'chosen image' });
  const ended = await terminal(f.client, job.id);
  assert.equal(ended.status, 'succeeded', ended.error);
  assert.deepEqual(authorizations, ['Bearer existing-fixture-image-key'], 'the chosen credential reaches the provider once, unchanged');
  assert.equal(sealed(), original);
  withConnectorConnections(f.home, store => store.disconnect(account.connection_id));
  const revoked = await f.global.invoke(actions.connections, {});
  assert.equal(revoked.connections[0]!.available, false);
  assert.equal(revoked.connections[0]!.auth_connection_id, account.connection_id);
  assert.equal(revoked.auth_connections.length, 1, 'a disconnected account stays listed as disconnected, not recreated');
  withConnectorConnections(f.home, store => store.remove(account.connection_id));
  const removed = await f.global.invoke(actions.connections, {});
  assert.equal(removed.auth_connections.length, 0);
  assert.equal(removed.connections[0]!.auth_connection_id, account.connection_id, 'a removed account does not erase the consumer selection');
  assert.equal(removed.connections[0]!.available, false);
  await assert.rejects(f.client.invoke(actions.start, { connection_id: connection.id, request_id: 'removed-key', prompt: 'must not become anonymous' }), { code: 'images.key_required' });
  assert.equal(authorizations.length, 1, 'remove cannot turn a bound local provider into an anonymous request');

});

test('RAC-105-A-18 Images refuses an occupied Home before business initialization and works after its owner releases',async t=>{
  const home=await mkdtemp(join(tmpdir(),'images-busy-home-')),owner=acquireStorageOwner(join(home,'agent-runtime'));
  let opened=false;
  t.after(async()=>{owner.release();if(!opened)await rm(home,{recursive:true,force:true});});
  let calls=0;
  const server=createServer(async(req,res)=>{for await(const _ of req);calls++;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:PNG}]}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert.ok(address&&typeof address==='object');
  // This is the same genuine owner an offline operation or another Host holds, before the Images Host can start.
  const before=readdirSync(home).sort();
  assert.throws(()=>new MolisWorkLocalHost({homeDirectory:home}),{code:'storage.owner.busy'});
  assert.deepEqual(readdirSync(home).sort(),before,'the refused Host creates no business store');assert.equal(calls,0);
  owner.release();
  const f=await fixture(t,home);opened=true;
  const {connection}=await f.global.invoke(actions.saveConnection,{name:'Busy images',api_format:'openai-images',base_url:`http://127.0.0.1:${address.port}/v1`,model:'fixture-images'});
  const {job}=await f.client.invoke(actions.start,{request_id:'busy',connection_id:connection.id,prompt:'被占用时'});
  const finished=await terminal(f.client,job.id);
  assert.equal(finished.status,'succeeded');assert.equal(calls,1);
  assert.doesNotMatch(finished.error??'',/无法连接厂商|网络/);
});
