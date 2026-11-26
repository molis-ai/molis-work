import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { personalRuntimeSyncAuthority, pluginSyncAuthority, withPluginSyncAuthority, type LocalWebCatalogRunner } from '@molis-ai/molis-work-app-local-host';
import { syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { goalsManifest } from '@molis-ai/molis-work-plugin-goals';
import { personalStorageSpace } from '@molis-ai/molis-work-storage';
import { pagesSyncSelection, personalSyncFixture } from './fixtures/personal-sync-coordinator.js';
import { projectPluginSyncFixture } from './fixtures/project-plugin-sync.js';
import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';

const home='/tmp/sync-authority-lifetime';
const identity={plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'verified',collection_id:'items',schema_version:1};
function fixture(){
  const context={spaceId:'personal:test',authorize(){},project(){return {title:'Project'};},canUploadProject:()=>true,hasArtifact:()=>false};
  const authority={home,context,assertCollection(value:typeof identity){assert.deepEqual(value,identity);}};
  return {authority,current:()=>pluginSyncAuthority(home,identity)};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const forbidden=(run:()=>unknown)=>assert.throws(run,{code:'actions.forbidden'});

test('sync authority expires for inherited microtasks and timers after synchronous return or throw',async()=>{
  for(const throws of [false,true]){
    const f=fixture();const delayed:Promise<void>[]=[];
    const invoke=()=>withPluginSyncAuthority(f.authority,()=>{
      const retained=f.current();retained.authorize();
      for(const schedule of [queueMicrotask,(run:()=>void)=>setTimeout(run,0)]){
        delayed.push(new Promise<void>((resolve,reject)=>schedule(()=>{
          try{forbidden(f.current);forbidden(()=>retained.authorize());resolve();}catch(error){reject(error);}
        })));
      }
      if(throws)throw new Error('callback failed');
      return 'result';
    });
    if(throws)assert.throws(invoke,/callback failed/);else assert.equal(invoke(),'result');
    await Promise.all(delayed);
  }
});

test('same authority object gets independent nested and concurrent operation lifetimes',async()=>{
  const f=fixture();
  withPluginSyncAuthority(f.authority,()=>{
    const outer=f.current();let inner!:ReturnType<typeof f.current>;
    withPluginSyncAuthority(f.authority,()=>{inner=f.current();inner.authorize();forbidden(()=>outer.authorize());});
    outer.authorize();forbidden(()=>inner.authorize());
  });
  const releases=[deferred(),deferred()];const checks:Array<()=>void>=[];
  const operations=releases.map((release,index)=>withPluginSyncAuthority(f.authority,async()=>{
    const retained=f.current();checks[index]=()=>retained.authorize();
    await release.promise;retained.authorize();f.current().authorize();
  }));
  releases[0].resolve();await operations[0];
  withPluginSyncAuthority(f.authority,()=>forbidden(checks[0]));
  releases[1].resolve();await operations[1];
});

test('async authority stays valid across await and expires for detached work after resolve or rejection',async()=>{
  for(const rejects of [false,true]){
    const f=fixture(),release=deferred(),detached=deferred();let late!:Promise<void>;
    const result=withPluginSyncAuthority(f.authority,async()=>{
      const retained=f.current();
      late=detached.promise.then(()=>{forbidden(f.current);forbidden(()=>retained.authorize());});
      await release.promise;f.current().authorize();retained.authorize();
      if(rejects)throw new Error('async failed');return 42;
    });
    release.resolve();if(rejects)await assert.rejects(result,/async failed/);else assert.equal(await result,42);
    detached.resolve();await late;
  }
});

test('thenable resolution, rejection and throwing then getters end their operation authority',async()=>{
  for(const mode of ['resolve','reject','getter'] as const){
    const f=fixture(),detached=deferred();let late!:Promise<void>;
    const invoke=()=>withPluginSyncAuthority(f.authority,()=>{
      const retained=f.current();
      late=detached.promise.then(()=>{forbidden(f.current);forbidden(()=>retained.authorize());});
      if(mode==='getter')return Object.defineProperty({},'then',{get(){throw new Error('getter failed');}});
      return {then(resolve:(value:number)=>void,reject:(error:Error)=>void){
        f.current().authorize();retained.authorize();
        queueMicrotask(()=>{retained.authorize();if(mode==='reject')reject(new Error('thenable failed'));else resolve(7);});
      }};
    });
    if(mode==='getter')assert.throws(invoke,/getter failed/);
    else if(mode==='reject')await assert.rejects(Promise.resolve(invoke()),/thenable failed/);
    else assert.equal(await invoke(),7);
    detached.resolve();await late;
  }
});

test('retained context lookup capabilities expire without calling the underlying owner after scope',()=>{
  const f=fixture();let reads=0;
  const authority={...f.authority,context:{...f.authority.context,
    project(){reads++;return {title:'Private'};},canUploadProject(){reads++;return true;},
    hasArtifact(){reads++;return true;},hasReference(){reads++;return true;},
  }};
  let calls:Array<()=>unknown>=[];
  withPluginSyncAuthority(authority,()=>{
    const context=f.current();
    calls=[()=>context.project('p'),()=>context.canUploadProject('p'),()=>context.hasArtifact('p','a',1),()=>context.hasReference!('p',{owner:'goals',assetId:'g'})];
    calls.forEach(call=>call());assert.equal(reads,4);
  });
  for(const call of calls){forbidden(call);assert.equal(reads,4,'an expired capability must not invoke its owner');}
  withPluginSyncAuthority(authority,()=>calls.forEach(forbidden));
});

test('context lookup results are refused if the owner revokes authority during the lookup',()=>{
  for(const method of ['project','canUploadProject','hasArtifact','hasReference'] as const){
    const f=fixture();let active=true;
    const revoke=()=>{active=false;return true;};
    const authority={...f.authority,context:{...f.authority.context,
      authorize(){if(!active)throw new Error('REVOKED');},project(){active=false;return {title:'Private'};},
      canUploadProject:revoke,hasArtifact:revoke,hasReference:revoke,
    }};
    withPluginSyncAuthority(authority,()=>{
      const context=f.current();
      const calls={project:()=>context.project('p'),canUploadProject:()=>context.canUploadProject('p'),hasArtifact:()=>context.hasArtifact('p','a',1),hasReference:()=>context.hasReference!('p',{owner:'goals',assetId:'g'})};
      assert.throws(calls[method],/REVOKED/);
    });
  }
});

test('a Home reached through a symlink is the same Home; another Home is still refused',async t=>{
  const {mkdtempSync,mkdirSync,symlinkSync,realpathSync,rmSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');
  const root=mkdtempSync(join(tmpdir(),'sync-authority-home-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const real=join(root,'home'),other=join(root,'other'),link=join(root,'link');mkdirSync(real);mkdirSync(other);symlinkSync(real,link);
  const f=fixture(),authority={...f.authority,home:link};
  withPluginSyncAuthority(authority,()=>{
    pluginSyncAuthority(realpathSync(real),identity).authorize();
    forbidden(()=>pluginSyncAuthority(other,identity));
  });
});

function runtimeAuthorityFixture() {
  let active = true;
  let revision = 1;
  let selected = true;
  let release: () => void = () => {};
  const authorityHome = '/tmp/authority-only';
  const spaceId = 'personal-test';
  const projects = [{ project_id: 'current', display_name: 'Current', database_path: '/unused' }];
  const catalog = {
    listProjects: () => projects,
    listPartitions: () => projects,
    projectPluginMembership: () => ({ plugins: [], hidden: [] }),
    recycle: { list: () => [] },
  };
  const fakeCatalog: Parameters<Parameters<LocalWebCatalogRunner>[1]>[0] = Object.assign(Object.create(null), catalog);
  const withCatalog: LocalWebCatalogRunner = async (_options, read) => read(fakeCatalog);
  const current = () => pluginSyncAuthority(authorityHome, identity);
  const source: SyncRegistration = {
    selection: identity,
    title: 'Items',
    refresh: async () => {},
    prepare: async () => {},
    withReplica(run) {
      current();
      return run({
        authorizeKey() {
          current().project('current');
        },
        next: () => null,
        acknowledge() {},
        receive() {},
        cursor: () => 0,
        conflicts: () => [],
        resolve() {},
        counts: () => {
          current();
          return { pending: 1, conflicts: 0 };
        },
      });
    },
    content: {
      encode(_key, value) {
        current();
        return { value, blobs: [] };
      },
      async decode(_key, value) {
        current();
        await new Promise<void>(resolve => { release = resolve; });
        return value;
      },
    },
  };
  const authority = personalRuntimeSyncAuthority({
    home: authorityHome,
    spaceId,
    withCatalog,
    readCatalog: read => read(fakeCatalog),
    authorize() {
      if (!active) throw new Error('REVOKED');
    },
    policy: () => ({ revision, selections: selected ? [identity] : [] }),
    hasArtifact: () => false,
    hasReference: () => false,
  });
  return {
    home: authorityHome,
    authority,
    registration: authority.bind(source),
    unselect() {
      selected = false;
      revision++;
    },
    revoke() {
      active = false;
    },
    release() {
      release();
    },
    current,
  };
}

test('Runtime sync authority confines a callback to its current collection and ends on return', async () => {
  const f = runtimeAuthorityFixture();
  await f.authority.refresh();
  f.registration.withReplica(replica => {
    assert.equal(replica.counts().pending, 1);
    assert.equal(f.current().project('current').title, 'Current');
    assert.throws(() => f.current().project('foreign'));
    assert.throws(() => pluginSyncAuthority(f.home, { ...identity, collection_id: 'other' }));
  });
  assert.throws(f.current);
  f.unselect();
  assert.throws(() => f.registration.withReplica(replica => replica.counts()));
});

test('a content read crossing policy or account revocation cannot return its old authority result', async () => {
  for (const revoke of ['policy', 'account']) {
    const f = runtimeAuthorityFixture();
    await f.authority.refresh();
    const pending = f.registration.content!.decode('key', { retained: true }, async () => new Uint8Array());
    if (revoke === 'policy') f.unselect();
    else f.revoke();
    f.release();
    await assert.rejects(pending);
  }
});

for (const [manifest, collectionId, permissions] of [
  [goalsManifest, 'project_goals', ['journal:project', 'context-ledger:read', 'context-ledger:write']],
] as const) {
  test(`${manifest.plugin_id} retained sync adapters recheck every platform grant`, async t => {
    let denied: string | undefined;
    const definition = manifest.sync!.collections.find(row => row.id === collectionId)!.sections!;
    const owner = projectPluginSyncFixture({
      space: personalStorageSpace('https://auth.example', 'work', 'user'),
      projectId: 'project',
      manifest,
      collectionId,
      authorize(permission) {
        if (permission === denied && denied) throw new Error('grant revoked: ' + permission);
      },
      bindings: context => [context.services!.sync!.sections(collectionId, {
        ...definition,
        business: definition.business.map(section => ({ ...section, validate: rows => rows })),
      })],
    });
    t.after(() => owner.close());
    owner.replica.counts();
    const before = owner.db.prepare('SELECT total_changes() AS n').get();
    for (const permission of permissions) {
      denied = permission;
      assert.throws(() => owner.replica.counts(), /grant revoked/);
      assert.throws(() => owner.replica.next(), /grant revoked/);
      assert.throws(() => owner.replica.receive({ key: JSON.stringify(['project', definition.kind, 'project']), base: 0, revision: 1, operationId: 'revoked', value: null }), /grant revoked/);
      assert.throws(() => owner.content!.encode(JSON.stringify(['project', definition.kind, 'project']), null), /grant revoked/);
      await assert.rejects(async () => owner.content!.decode(JSON.stringify(['project', definition.kind, 'project']), null, async () => new Uint8Array()), /grant revoked/);
      assert.deepEqual(owner.db.prepare('SELECT total_changes() AS n').get(), before, 'revocation cannot partially write owner or journal');
    }
    denied = undefined;
    owner.replica.counts();
  });
}

test('retained versions and conflicts cannot expose a hidden project through another active Home instance', async t => {
  const f = personalSyncFixture(t);
  const previous = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_LOCAL = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL;
    else process.env.MOLIS_WORK_SYNC_LOCAL = previous;
  });
  t.mock.method(globalThis, 'fetch', f.transport);
  const projects = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[0] }, async catalog => {
    const created = [
      await catalog.createProject({ display_name: 'Hidden later', actor_id: 'alice' }),
      await catalog.createProject({ display_name: 'Still visible', actor_id: 'alice' }),
    ];
    for (const project of created) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: 'pages', actor_id: 'alice' });
    return created;
  });
  await withMolisWorkProjectCatalog({ homeDirectory: f.homes[1] }, async catalog => {
    for (const project of projects) {
      await catalog.ensureSyncedProject({ project_id: project.project_id, display_name: project.display_name, actor_id: 'alice' }, () => {});
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: 'pages', actor_id: 'alice' });
    }
  });
  const source = await runtimePersonalSync(f.homes[0], f.space);
  const target = await runtimePersonalSync(f.homes[1], f.space);
  f.closeWith(() => source.close());
  f.closeWith(() => target.close());
  const namespace = syncNamespace(pagesSyncSelection);
  const pages = projects.map(project => f.withStore(0, store => store.create({ title: 'Base ' + project.display_name }), project.project_id));
  await source.sync.save({ ...source.sync.policy(), selections: [pagesSyncSelection] });
  await source.sync.run();
  await target.sync.run();
  const conflict = async (index: number) => {
    const page = pages[index]!;
    const partition = projects[index]!.project_id;
    f.withStore(0, store => store.update(page.id, { title: 'Remote secret ' + index }), partition);
    f.withStore(1, store => store.update(page.id, { title: 'Local secret ' + index }), partition);
    await source.sync.run();
    await target.sync.run();
    return target.sync.status().collections.find(row => syncNamespace(row.selection) === namespace)!.conflicts.find(row => row.key.includes(page.id))!;
  };
  for (const index of [0, 1]) {
    const row = await conflict(index);
    assert.ok(row);
    await target.sync.resolve(namespace, row.key, 'remote');
  }
  const retained = target.sync.recoveries(namespace);
  const hidden = retained.find(row => row.key.includes(pages[0]!.id))!;
  const visible = retained.find(row => row.key.includes(pages[1]!.id))!;
  assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace, hidden.id)).includes('Local secret 0'));
  const unresolved = await conflict(0);
  assert.ok(unresolved);
  await target.withCatalog({ homeDirectory: f.homes[1] }, catalog => catalog.removeProjectPlugin({ project_id: projects[0]!.project_id, plugin_id: 'pages', actor_id: 'alice' }));
  assert.throws(() => target.sync.inspectRecovery(namespace, hidden.id), /未授权/, 'hidden retained bodies must not escape through an active instance in another project');
  assert.throws(() => target.sync.inspectConflict(namespace, unresolved.key), /未授权/);
  assert.ok(target.sync.recoveries(namespace).some(row => row.id === visible.id));
  assert.equal(target.sync.recoveries(namespace).some(row => row.id === hidden.id), false, 'hidden recovery keys are not listed');
  await assert.rejects(() => target.sync.restoreRecovery(namespace, hidden.id, 'local', hidden.revision), /未授权/);
  assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace, visible.id)).includes('Local secret 1'), 'the other project keeps its own history');
  await target.withCatalog({ homeDirectory: f.homes[1] }, catalog => catalog.addProjectPlugin({ project_id: projects[0]!.project_id, plugin_id: 'pages', actor_id: 'alice' }));
  assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace, hidden.id)).includes('Local secret 0'), 'refusal preserves the original history');
});
