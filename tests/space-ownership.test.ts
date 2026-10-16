import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import Database from 'better-sqlite3';
import {
  ensureStorageSpace, personalStorageSpace, bindDatabaseSpace, spaceAssetRef,
  openHomeSqliteDatabase,
} from '@molis-ai/molis-work-storage';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { createMolisWorkWebServer } from '../apps/desktop/launchers/web/server.js';
import { LocalActionGatewayClient } from '../apps/local-host/src/action-gateway.js';
import { attachMolisWorkPtySocket } from '../apps/local-host/src/pty-socket.js';
import { MolisWorkPtyHost } from '@molis-ai/molis-work-service-runtime-host';

test('terminal jobs receive the Host space, not a caller-selected Home', async t => {
  let received:any;
  t.mock.method(MolisWorkPtyHost.prototype,'spawn',request=>{received=request;return {attached:false,started:true,replay:''};});
  const server=createServer();
  const host=attachMolisWorkPtySocket(server,'synthetic-control-token',{environment:{MOLIS_WORK_HOME:'/trusted/space'}});
  host.spawn({panelId:'test',env:{MOLIS_WORK_HOME:'/wrong/space',CUSTOM:'retained'}});
  assert.deepEqual(received.env,{MOLIS_WORK_HOME:'/trusted/space',CUSTOM:'retained'});
  await close(server);
});

test('space identity is immutable, personal IDs are portable and team spaces are reserved', () => {
  const home = mkdtempSync(join(tmpdir(), 'space-identity-'));
  try {
    const local = ensureStorageSpace(home);
    assert.equal(local.kind, 'local');assert.equal(local.ownerUserId, null);
    assert.deepEqual(ensureStorageSpace(home), local);
    const alice = personalStorageSpace('https://auth.example', 'work', 'alice');
    assert.deepEqual(personalStorageSpace('https://auth.example', 'work', 'alice'), alice);
    assert.notEqual(personalStorageSpace('https://auth.example', 'work', 'bob').spaceId, alice.spaceId);
    assert.notEqual(personalStorageSpace('https://other.example', 'work', 'alice').spaceId, alice.spaceId);
    assert.throws(() => ensureStorageSpace(home, alice), /SPACE_OWNERSHIP_MISMATCH/);
    assert.throws(() => ensureStorageSpace(join(home, 'team'), {...alice, kind:'team', teamId:'team-1'}), /TEAM_SPACE_NOT_AVAILABLE/);
    assert.deepEqual(spaceAssetRef(alice, 'pages', 'page-1', 'project-1'), {
      spaceId:alice.spaceId, owner:'pages', assetId:'page-1', projectId:'project-1',
    });
  } finally { rmSync(home,{recursive:true,force:true}); }
});

test('binding legacy data preserves content and refuses to relabel databases', () => {
  const home = mkdtempSync(join(tmpdir(), 'space-legacy-'));
  const db = new Database(':memory:');
  try {
    db.exec("CREATE TABLE asset(id TEXT PRIMARY KEY, content TEXT); INSERT INTO asset VALUES ('old', 'keep me');");
    const space = ensureStorageSpace(home);
    bindDatabaseSpace(db, space);bindDatabaseSpace(db, space);
    assert.deepEqual(db.prepare('SELECT * FROM asset').all(), [{id:'old',content:'keep me'}]);
    assert.equal(db.prepare('SELECT count(*) AS count FROM molis_storage_space').get().count, 1);
    assert.throws(() => bindDatabaseSpace(db, personalStorageSpace('https://auth.example','work','alice')), /SPACE_OWNERSHIP_MISMATCH/);
    assert.equal(db.prepare('SELECT space_id FROM molis_storage_space').get().space_id, space.spaceId);
  } finally { db.close();rmSync(home,{recursive:true,force:true}); }
});

test('projects, Goal stores and plugin stores inherit the same space; copied plugin databases fail closed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'space-stores-'));
  try {
    const spaces = [ensureStorageSpace(join(root,'local')), personalStorageSpace('https://auth.example','work','alice'), personalStorageSpace('https://auth.example','work','bob')];
    for (const [i,space] of spaces.entries()) {
      const home = join(root,String(i));ensureStorageSpace(home,space);
      const catalog = await openMolisWorkProjectCatalog({homeDirectory:home});
      try {
        const project = await catalog.createProject({display_name:'Same name',actor_id:'user'});
        assert.equal(project.spaceId,space.spaceId);
        assert.equal(catalog.getProject(project.project_id).spaceId,space.spaceId);
        const db = new LocalProjectDatabase(project.database_path);
        try {assert.equal(db.db.prepare('SELECT space_id FROM molis_storage_space').get().space_id,space.spaceId);}
        finally {db.close();}
      } finally {catalog.close();}
      const plugin = openHomeSqliteDatabase(home,'pages');
      try {
        plugin.exec('CREATE TABLE test_asset (id TEXT, content TEXT)');
        plugin.prepare('INSERT INTO test_asset VALUES (?,?)').run('same-id','belongs-to-'+i);
        assert.equal(plugin.prepare('SELECT space_id FROM molis_storage_space').get().space_id,space.spaceId);
      } finally {plugin.close();}
    }
    // Restoring a store into the wrong account must not silently reassign it.
    cpSync(join(root,'1','pages','pages.db'),join(root,'2','pages','pages.db'));
    assert.throws(() => openHomeSqliteDatabase(join(root,'2'),'pages'), /SPACE_OWNERSHIP_MISMATCH/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

async function listen(server:Server):Promise<string> {
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server:Server) {await new Promise<void>(resolve=>server.close(()=>resolve()));}

test('real Web routing isolates local/A/B, keeps login local, rejects stale pages and restores the same account', async () => {
  const home=mkdtempSync(join(tmpdir(),'space-web-'));
  let transaction:any,remote='', user='alice';
  const upstream=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url==='/api/v1/auth/transactions') {transaction=JSON.parse(raw);res.end(JSON.stringify({data:{loginUrl:remote+'/login'}}));}
    else if(req.url==='/oauth2/token')res.end(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600}));
    else if(req.url==='/api/v1/users/me')res.end(JSON.stringify({data:{userId:user,displayName:user,emails:[],applicationId:'work',clientId:'web-test'}}));
    else res.end('{}');
  });
  remote=await listen(upstream);
  const names=['MOLIS_WORK_AUTH_ORIGIN','MOLIS_WORK_AUTH_CLIENT_ID','MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID','MOLIS_WORK_CLOUD_ORIGIN'];
  const previous=names.map(name=>process.env[name]);
  [remote,'web-test','desktop-test',remote].forEach((value,i)=>process.env[names[i]]=value);
  const rootToken='synthetic-space-web-root-control-0123456789';
  const localCatalog=await openMolisWorkProjectCatalog({homeDirectory:home});
  const localProject=await localCatalog.createProject({display_name:'Local retained project',actor_id:'local'});localCatalog.close();
  const server=createMolisWorkWebServer({homeDirectory:home,controlToken:rootToken});
  const origin=await listen(server);let cookie='',token=rootToken,sequence=0;
  const request=async(path:string,init:RequestInit={})=>{
    const response=await fetch(origin+path,{...init,headers:{Cookie:cookie,...init.headers}});
    if(response.headers.get('set-cookie')?.startsWith('molis-work-session='))cookie=response.headers.get('set-cookie')!.split(';')[0];
    return response;
  };
  const post=(path:string)=>request(path,{method:'POST',headers:{Origin:origin,'content-type':'application/json',
    'x-molis-work-control-token':token,'x-molis-work-idempotency-key':'space-test-'+(++sequence)},body:'{}'});
  const scopes=async()=>{const response=await request('/api/spaces');assert.equal(response.status,200);return response.json();};
  const login=async(name:string)=>{
    user=name;assert.equal((await post('/api/personal/login')).status,200);
    assert.equal((await request('/account/callback?code=synthetic&state='+transaction.state,{redirect:'manual'})).status,303);
    const state=await(await request('/api/personal/status')).json();token=state.viewToken;
  };
  try {
    await login('alice');assert.equal((await scopes()).current.kind,'local');
    assert.equal((await request('/projects/'+localProject.project_id)).status,200);
    assert.equal((await post('/api/personal/space?kind=team')).status,400);
    assert.equal((await post('/api/personal/space?kind=personal&userId=bob')).status,200);
    const a=(await scopes()).current;assert.equal(a.ownerUserId,'alice');assert.equal(a.kind,'personal');
    token=(await(await request('/api/personal/status')).json()).viewToken;
    const aToken=token;
    assert.notEqual(token,rootToken);
    assert.notEqual((await request('/projects/'+localProject.project_id)).status,200);
    const aHome=join(home,'spaces',a.spaceId);
    const aCatalog=await openMolisWorkProjectCatalog({homeDirectory:aHome});
    const aProject=await aCatalog.createProject({display_name:'Alice private project',actor_id:'alice'});aCatalog.close();
    assert.equal(aProject.spaceId,a.spaceId);
    assert.equal((await request('/projects/'+aProject.project_id)).status,200);
    const gateway=new LocalActionGatewayClient({url:origin,homeDirectory:aHome,clientId:'runtime:space-test',projectId:aProject.project_id});
    const caller={actor_id:'runtime:space-test',project_id:aProject.project_id,audience:'mcp' as const,permissions:[]};
    assert.ok(Array.isArray(await gateway.discover(caller)),'active personal MCP routes to the same scoped Host');
    assert.doesNotMatch(await(await request('/')).text(),/Local retained project/);
    assert.equal((await request('/api/personal/not-an-api')).status,404);
    await login('bob');const b=(await scopes()).current;assert.equal(b.ownerUserId,'bob');assert.notEqual(b.spaceId,a.spaceId);
    await assert.rejects(gateway.discover(caller),{code:'actions.home_mismatch'},'old account MCP cannot reopen its Home after sign-out');
    assert.equal((await request('/',{headers:{'x-molis-work-control-token':aToken}})).status,409);
    assert.notEqual((await request('/projects/'+aProject.project_id)).status,200);
    assert.doesNotMatch(await(await request('/')).text(),/Alice private project/);
    const bToken=token;
    await login('alice');assert.equal((await scopes()).current.spaceId,a.spaceId);
    assert.equal((await request('/projects/'+aProject.project_id)).status,200);
    assert.equal((await request('/',{headers:{'x-molis-work-control-token':bToken}})).status,409);
    assert.equal((await post('/api/personal/logout')).status,200);token=rootToken;
    assert.equal((await scopes()).current.kind,'local');
    assert.equal((await request('/projects/'+localProject.project_id)).status,200);
    assert.notEqual((await request('/projects/'+aProject.project_id)).status,200);
    assert.equal((await scopes()).syncEnabled,false);
    assert.doesNotMatch(readFileSync(join(aHome,'storage-space.json'),'utf8'),/synthetic-access|synthetic-refresh/);
  } finally {
    await close(server);await close(upstream);
    names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});
    rmSync(home,{recursive:true,force:true});
  }
});
