import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bindActionClient, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesActions as actions, IMAGES_ACTION_PERMISSIONS, ImagesService, type ImageJob } from "@molis-ai/molis-work-plugin-images";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.js";
import { createFileSecretStore, peekSealedEntry, runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
async function fixture(t:test.TestContext) {
  const home=await mkdtemp(join(tmpdir(),'images-actions-'));
  const hosts:MolisWorkLocalHost[]=[];
  const open=()=>{const host=new MolisWorkLocalHost({homeDirectory:home});hosts.push(host);return host;};
  const host=open(), ref=molisWorkHostProjectReference({databasePath:join(home,'project.sqlite'),boardId:'board',projectId:'a'});
  const bind=(host:MolisWorkLocalHost,projectId:string|null='a',permissions:readonly string[]=IMAGES_ACTION_PERMISSIONS)=>bindActionClient(projectId?host.actionClient(projectId === 'a' ? ref : molisWorkHostProjectReference({databasePath:join(home,`${projectId}.sqlite`),boardId:projectId,projectId})):host.homeActionClient(),()=>({actor_id:'owner',project_id:projectId,audience:'user',permissions}));
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
  assert.throws(() => f.open(), { code: 'inference.home_in_use' }, 'one Home cannot silently acquire a second Runtime owner');
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
  const failed=await terminal(f.client,job.id);assert.equal(failed.status,'failed');assert.deepEqual(failed.images,[]);assert.match(failed.error,/改变或撤销/);
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

test('Images adopts existing credential references without decrypting or copying them during discovery', async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = 'file'; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const f = await fixture(t);
  const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
  const legacy = new ImagesService({ homeDirectory: f.home, secrets });
  const connection = legacy.saveConnection({ name: '旧版服务', api_format: 'openai-images', base_url: 'https://images.example/v1', model: 'existing-model', api_key: 'existing-fixture-image-key' });
  await legacy.close();
  const sealed = () => runWithMolisWorkHome(f.home, () => peekSealedEntry(`images:${connection.id}`));
  const original = sealed(); assert.ok(original);
  const get = t.mock.method(secrets, 'get', () => { throw new Error('Discovery must not decrypt'); });
  const list = await f.global.invoke(actions.connections, {});
  assert.equal(get.mock.callCount(), 0);
  assert.equal(list.connections[0]!.id, connection.id); assert.equal(list.connections[0]!.available, true);
  assert.equal(list.auth_connections.length, 1);
  assert.equal(list.connections[0]!.auth_connection_id, list.auth_connections[0]!.connection_id);
  assert.equal(sealed(), original);
  assert.doesNotMatch(JSON.stringify(list), /existing-fixture-image-key|credential_ref|api_key/);
  get.mock.restore();
  const provider = t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer existing-fixture-image-key');
    return new Response(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  const { job } = await f.client.invoke(actions.start, { connection_id: connection.id, request_id: 'legacy-key', prompt: 'legacy image' });
  assert.equal((await terminal(f.client, job.id)).status, 'succeeded'); assert.equal(provider.mock.callCount(), 1);
  assert.equal(sealed(), original);
  provider.mock.restore();
  withConnectorConnections(f.home, store => store.disconnect(list.auth_connections[0]!.connection_id));
  const revoked = await f.global.invoke(actions.connections, {});
  assert.equal(revoked.connections[0]!.available, false);
  assert.equal(revoked.connections[0]!.auth_connection_id, list.auth_connections[0]!.connection_id);
  assert.equal(revoked.auth_connections.length, 1, 'Discovery must not recreate disconnected legacy accounts');
});
