import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureStorageSpace, LocalSqliteJournal, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { BUILTIN_PLUGIN_CATALOG } from '@molis-ai/molis-work-app-workbench';
import { LocalProjectDatabase, MolisWorkLocalHost, artifactSyncSelection, createPersonalSync, discoverRuntimeSyncCollections, homeAgentDefinitions, molisWorkHostProjectReference, openPluginProjectLibrary, openProjectVersionStores } from '@molis-ai/molis-work-app-local-host';
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { openCogniaStore, openDatasetStore, openFormStore, openIssuesSyncStore, openJellyStore, openLingguangStore, openPagesStore, openPptStore, openTodoStore, openWorkflowsStore } from '../../tests/fixtures/plugin-sync-stores.ts';
import { prepareSyncTestHome, runtimePersonalSync } from '../../tests/fixtures/runtime-personal-sync.ts';
import { GoalProjectApplication, boardSnapshot, fixtureProjectRule } from '../../tests/fixtures/goal-application.ts';
import { createDemoFeedApplication } from '../../tests/fixtures/feed-assembly.ts';
import { FeedOutRuleStore } from '@molis-ai/molis-work-plugin-feed';
import { SignalsModule, SourcesModule, fromProjectConnection } from '@molis-ai/molis-work-plugin-feed/store';
import { manualLink, newStation } from '@molis-ai/molis-work-plugin-workflows';
import { riskActions, RISK_WRITE } from '@molis-ai/molis-work-plugin-risk';
import { workBriefActions, WORK_BRIEF_WRITE } from '@molis-ai/molis-work-plugin-work-brief';
import { AttentionModule } from '@molis-ai/molis-work-module-attention-resumption';
import { openCharacters } from '@molis-ai/molis-work-module-characters';
import { CodingSessionStore, CODING_PLAN_TYPE, codingManifest } from '@molis-ai/molis-work-plugin-coding';
import { createAlchemistStudioRuntime, alchemistActions } from '@molis-ai/molis-work-plugin-alchemist';
import { AgentBuilderStore, builderManifest } from '@molis-ai/molis-work-plugin-builder';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { shelfActions, SHELF_ACTION_PERMISSIONS } from '@molis-ai/molis-work-plugin-shelf';
import { imagesActions, IMAGES_ACTION_PERMISSIONS } from '@molis-ai/molis-work-plugin-images';
import { APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION, appearanceSelectionActions } from '@molis-ai/molis-work-contracts/platform/ui';
import { ASSISTANT_PLUGIN_ID } from '@molis-ai/molis-work-contracts/services/assistant';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { createAppearanceOwner } from '@molis-ai/molis-work-service-appearance';
import { AdoptionStore } from '@molis-ai/molis-work-service-blueprints';
import { createSurfaceCorrections } from '@molis-ai/molis-work-service-surfaces';
import { createFunctionsService } from '@molis-ai/molis-work-module-judgment-rules';
import { createProjectGuidance } from '@molis-ai/molis-work-module-projects';
import { projectApprovalRules } from '@molis-ai/molis-work-service-project-approvals';
import { openAcceptance } from '@molis-ai/molis-work-module-acceptance';
import { ARTIFACT_PRODUCER } from '@molis-ai/molis-work-module-artifacts';
import { IMPORTED_DOCUMENT_TYPE, IMPORTED_DOCUMENT_SCHEMA_VERSION } from '@molis-ai/molis-work-contracts/modules/artifacts';
import { canonicalJsonText } from '@molis-ai/molis-work-plugin-sdk';
import { syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { createPersonalNotesSample } from '../../examples/personal-sync-plugin/plugin.ts';
import { cloudFixture } from './testing.mjs';

test('AC-M1-09 PCSYNC-01/11/15/25 public-SDK owner transfers through Host/D1/R2 and loses access on uninstall', async t => {
  const cloud = await cloudFixture(t), root = mkdtempSync(join(tmpdir(), 'molis-runtime-cloud-'));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice'), homes = ['a', 'b', 'c'].map(name => join(root, name));
  homes.forEach(home => ensureStorageSpace(home, space));
  const samples = homes.map(() => createPersonalNotesSample()), hosts = homes.map((home, i) => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [samples[i].definition] } }));
  const catalogs=hosts.map((host,i)=>host.ensureWebCatalog(homes[i],openMolisWorkProjectCatalog));
  const readers=hosts.map((host,i)=>host.configurePersonalPlanning(homes[i],catalogs[i].withCatalog));
  await Promise.all(catalogs.map(catalog=>catalog.warm()));
  const previous = { origin: process.env.MOLIS_WORK_SYNC_ORIGIN, local: process.env.MOLIS_WORK_SYNC_LOCAL };
  process.env.MOLIS_WORK_SYNC_ORIGIN = 'https://sync.example.test'; delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(async () => {
    try { for (const host of hosts) await host.close(); }
    finally {
      rmSync(root, { recursive: true, force: true });
      for (const [key, value] of [['MOLIS_WORK_SYNC_ORIGIN', previous.origin], ['MOLIS_WORK_SYNC_LOCAL', previous.local]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  t.mock.method(globalThis, 'fetch', cloud.transport);
  const check = () => {}, lease = { userId: 'alice', applicationId: 'work', authOrigin: 'https://auth.example.test', signal: new AbortController().signal, assertCurrent: check, accessToken: async () => 'alice' };
  const clients = await Promise.all(homes.map((home, i) => createPersonalSync(home, space, lease, readers[i], check,
    authorize => discoverRuntimeSyncCollections(home, space.spaceId, hosts[i], readers[i], authorize),undefined,catalogs[i].read)));
  t.after(() => clients.forEach(client => client.close()));
  assert.equal(clients[0].status().collections.some(row => row.selection.plugin_id === samples[0].definition.manifest.plugin_id), false, 'construction does not activate or approve an independent collection');
  await clients[0].run(); await clients[1].run();
  const selection = clients[0].status().collections.find(row => row.selection.plugin_id === samples[0].definition.manifest.plugin_id).selection;
  assert.deepEqual(clients[0].policy().selections, []);
  const bytes = Buffer.alloc(700_001, 173); bytes[0] = 0; bytes[1] = 255;
  samples[0].edit('portable', { text: '完整笔记'.repeat(24_000), attachment: bytes.toString('base64') });
  await clients[0].save({ ...clients[0].policy(), selections: [selection] });
  await clients[0].run(); await clients[1].run();
  clients.forEach(client => assert.equal(client.status().error, null));
  assert.deepEqual(samples[1].read(), samples[0].read()); assert.ok((await cloud.bucket.list()).objects.length > 0);
  const readNote = samples[1].definition.manifest.actions.find(action => action.operation === 'query');
  assert.ok(readNote);
  const homeAction = permissions => bindActionClient(hosts[1].homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: 'user', permissions }));
  await assert.rejects(homeAction([]).invoke(readNote, { id: 'portable' }), { code: 'actions.forbidden' });
  assert.deepEqual((await homeAction(['storage:private']).invoke(readNote, { id: 'portable' })).value, samples[0].read().notes.portable);
  const namespace = syncNamespace(selection), key = JSON.stringify([null, 'portable']);
  const before = (await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;
  await clients[0].run(); await clients[1].run();
  assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n, before, 'restoration and ACK do not echo');
  samples[0].edit('portable', { text: 'source edit', attachment: null }); samples[1].edit('portable', { text: 'target unique edit', attachment: null });
  await clients[0].run(); await clients[1].run();
  const comparison = clients[1].inspectConflict(namespace, key);
  assert.deepEqual(comparison.local,{sync_runtime:1,spaceId:space.spaceId,projectId:null,value:{text:'target unique edit',attachment:null}});
  assert.deepEqual(comparison.remote,{sync_runtime:1,spaceId:space.spaceId,projectId:null,value:{text:'source edit',attachment:null}});
  samples[1].edit('portable', { text: 'newer unique target edit', attachment: bytes.toString('base64') });
  await assert.rejects(() => clients[1].resolve(namespace, key, 'remote', comparison.revision, comparison.state), /比较内容已变化/);
  const current = clients[1].inspectConflict(namespace, key); await clients[1].resolve(namespace, key, 'remote', current.revision, current.state);
  assert.equal(samples[1].read().notes.portable.text, 'source edit');
  const retained = clients[1].recoveries(namespace)[0]; assert.deepEqual(clients[1].inspectRecovery(namespace, retained.id).local,current.local);
  const archived=await cloud.db.prepare("SELECT revision,value FROM sync_events WHERE namespace=? AND key=? AND action='archive'").bind(namespace,key).all();assert.equal(archived.results.length,1);
  const wire=JSON.parse(archived.results[0].value);assert.equal(wire.sync_runtime,1);assert.equal(wire.spaceId,space.spaceId);assert.equal(wire.projectId,null);
  assert.ok(!archived.results[0].value.includes(bytes.toString('base64')),'R2 projection does not expand raw attachment bytes in D1');
  const downloaded=await(await cloud.call('/v1/changes?namespace='+encodeURIComponent(namespace)+'&after='+current.revision,'alice')).json();assert.ok(!downloaded.events.some(event=>event.revision===archived.results[0].revision),'cloud backup is not a new normal head');
  const platform = await hosts[1].homePlugins.ready();
  platform.supervisor.revoke(selection.plugin_id); await clients[1].run();
  assert.deepEqual(clients[1].status().unavailable, [selection]);
  samples[0].edit('portable', null); await clients[0].run(); assert.equal(clients[0].status().error, null); assert.equal(clients[0].status().collections.find(row => syncNamespace(row.selection) === namespace).pending, 0);
  await platform.supervisor.enable(selection.plugin_id); await clients[1].run();
  assert.equal(clients[1].status().error, null); assert.deepEqual(clients[1].status().collections.find(row => syncNamespace(row.selection) === namespace).conflicts, []);
  assert.equal(samples[1].read().notes.portable, undefined, 'explicitly re-enabled installation receives a tombstone without auto-running work');
  assert.equal((await cloud.call('/v1/changes?namespace=' + encodeURIComponent(namespace) + '&after=0', 'bob')).status, 403);
  await clients[2].run();assert.equal(clients[2].status().error,null);assert.deepEqual(clients[2].recoveries(namespace),[],'a new device has no local resolution journal');
  assert.deepEqual(samples[2].read(),{notes:{}});
  const keys=await clients[2].history.keys(namespace);assert.deepEqual(keys.items.map(row=>row.key),[key]);
  const versions=await clients[2].history.versions(namespace,key);assert.ok(versions.items.some(row=>row.revision===archived.results[0].revision&&row.retained));
  const inspected=await clients[2].history.inspect(namespace,key,archived.results[0].revision);assert.deepEqual(inspected.value,current.local);
  assert.deepEqual(samples[2].read(),{notes:{}},'read-only inspection must not prepare or write owner data');
  assert.deepEqual(Buffer.from(inspected.value.value.attachment,'base64'),bytes);
  const restored=await clients[2].history.restore(namespace,key,inspected.revision,inspected.currentRevision,'third-device-history');assert.ok(restored.revision>inspected.currentRevision);
  assert.deepEqual(samples[2].read().notes.portable,current.local.value);assert.equal(clients[2].status().error,null,'normal dynamic discovery can refresh while a manual recovery runs');
  await clients[0].run();await clients[1].run();assert.deepEqual(samples[0].read(),samples[2].read());assert.deepEqual(samples[1].read(),samples[2].read());
  await assert.rejects(()=>clients[2].history.purge(namespace,key,inspected.revision,restored.revision,false),/确认/);
  await assert.rejects(()=>clients[2].history.restore(namespace,key,inspected.revision,inspected.currentRevision,'stale-third-device'),/版本已变化/);
  await clients[2].history.purge(namespace,key,inspected.revision,restored.revision,true);
  await assert.rejects(()=>clients[2].history.inspect(namespace,key,inspected.revision));assert.deepEqual(samples[2].read().notes.portable,current.local.value,'purging a backup never deletes the restored head');

  const instance = platform.runtime.list().find(row => row.plugin_id === selection.plugin_id && row.state === 'running');
  assert.ok(instance);
  samples[1].edit('unpublished', { text: 'local before uninstall', attachment: null });
  const count = async () => (await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events WHERE namespace=?').bind(namespace).first()).n;
  const beforeUninstall = await count();
  await platform.runtime.uninstall(instance.install_id, { retain_private_data: true });
  assert.throws(() => samples[1].edit('after-uninstall', { text: 'stale activation', attachment: null }), { code: 'actions.forbidden' });
  await clients[1].run();
  assert.deepEqual(clients[1].status().unavailable, [selection]);
  assert.ok(!clients[1].status().collections.some(row => syncNamespace(row.selection) === namespace));
  assert.equal(await count(), beforeUninstall, 'uninstall leaves neither a queued upload nor an uninstall-generated cloud mutation');
});

test('AC-M1-07 one pair of Homes selects all persistent built-ins and platform collections and replays a fixed-version dependency', { timeout: 120_000 }, async t => {
  const cloud = await cloudFixture(t, { rateLimit: 1200 });
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'molis-all-owners-')));
  const homes = ['source', 'destination'].map(name => join(root, name));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  const runtimes = [];
  const previousOrigin = process.env.MOLIS_WORK_SYNC_ORIGIN, previousLocal = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_ORIGIN = 'https://sync.example.test';
  delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(async () => {
    try { for (const runtime of runtimes) await runtime.close(); }
    finally {
      rmSync(root, { recursive: true, force: true });
      for (const [key, value] of [['MOLIS_WORK_SYNC_ORIGIN', previousOrigin], ['MOLIS_WORK_SYNC_LOCAL', previousLocal]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  for (const home of homes) { ensureStorageSpace(home, space); prepareSyncTestHome(home); }
  const builtins = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.sync?.collections.length);
  assert.deepEqual(builtins.map(entry => entry.project_plugin_id).sort(), [
    'alchemist', 'coding', 'cognia', 'dataset', 'feed', 'form', 'goals', 'images', 'inbox', 'issues',
    'jelly', 'lingguang', 'pages', 'plugin-builder', 'ppt', 'risk', 'schedule', 'shelf', 'todo', 'work-brief', 'workflows',
  ]);
  const first = await withMolisWorkProjectCatalog({ homeDirectory: homes[0] }, catalog => catalog.createProject({ display_name: 'All owners', actor_id: 'alice' }));
  const projectId = first.project_id;
  const projects = [first];
  const activate = async catalog => {
    for (const entry of builtins) {
      if ((entry.project_runtime || entry.sync?.studio || entry.sync?.authoring) && !catalog.listProjectPlugins(projectId).includes(entry.project_plugin_id)) {
        await catalog.addProjectPlugin({ project_id: projectId, plugin_id: entry.project_plugin_id, actor_id: 'alice' });
      }
    }
  };
  await withMolisWorkProjectCatalog({ homeDirectory: homes[0] }, activate);

  const versionsNamespace = syncNamespace(artifactSyncSelection);
  let holdVersions = false, heldReads = 0;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  let imageRuns = 0;
  const imageProvider = createServer(async (request, response) => {
    for await (const _ of request) { /* drain the synthetic request */ }
    imageRuns++;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  });
  await new Promise(resolve => imageProvider.listen(0, '127.0.0.1', resolve));
  t.after(() => { imageProvider.closeAllConnections(); return new Promise(resolve => imageProvider.close(resolve)); });
  const nativeFetch = globalThis.fetch, imageOrigin = `http://127.0.0.1:${imageProvider.address().port}`;
  t.mock.method(globalThis, 'fetch', (input, init) => {
    const url = new URL(String(input));
    if (url.origin === imageOrigin) return nativeFetch(input, init);
    if (holdVersions && (!init?.method || init.method === 'GET') && url.pathname === '/v1/changes' && url.searchParams.get('namespace') === versionsNamespace) {
      heldReads++;
      return Promise.resolve(Response.json({ events: [], more: false }));
    }
    assert.equal(url.origin, 'https://sync.example.test');
    return cloud.transport(input, init);
  });
  for (const home of homes) runtimes.push(await runtimePersonalSync(home, space, () => {}, { authOrigin: 'https://auth.example.test', accessToken: async () => 'alice' }));
  const [sender, receiver] = runtimes.map(runtime => runtime.sync);
  // Let Projects create the target library before its owner explicitly activates the required plugins.
  const projectSelection = sender.status().collections.find(row => row.selection.collection_id === 'projects').selection;
  assert.deepEqual(sender.policy().selections, []);
  await sender.save({ ...sender.policy(), selections: [projectSelection] });
  await sender.run(); await receiver.run();
  assert.equal(sender.status().error, null); assert.equal(receiver.status().error, null);
  await runtimes[1].withCatalog({ homeDirectory: homes[1] }, async catalog => {
    projects.push(catalog.getProject(projectId));
    await activate(catalog);
  });
  await runtimes[1].openProjects();
  await receiver.run(); await sender.run();
  await sender.refreshCatalog(); await receiver.refreshCatalog();
  const all = sender.status().collections;
  const identity = selection => `${selection.plugin_id}/${selection.collection_id}`;
  const expectedBuiltins = builtins.flatMap(({manifest}) => manifest.sync.collections.map(collection => `${manifest.plugin_id}/${collection.id}`));
  const expectedPlatform = ['acceptance', 'appearance', 'approvals', 'attention', 'blueprints', 'drafts', 'guidance', 'judgment_rules', 'process_items', 'projects', 'prompt_overrides', 'surfaces', 'versions'];
  assert.deepEqual(all.filter(row => row.group === 'platform').map(row => row.selection.collection_id).sort(), expectedPlatform);
  assert.ok(expectedBuiltins.every(key => all.some(row => identity(row.selection) === key)));
  assert.equal(new Set(all.map(row => syncNamespace(row.selection))).size, all.length, 'Inbox attention is selected only once');
  assert.deepEqual(receiver.status().collections.map(row => identity(row.selection)).sort(), all.map(row => identity(row.selection)).sort());

  const store = index => new LocalProjectDatabase(projects[index].database_path);
  const checks = [];
  const withOwner = (index, open, run) => {
    const owner = open(homes[index]);
    try { return run(owner); } finally { owner.close(); }
  };
  const actionClient = (index, permissions, home = false, actor = 'alice') => bindActionClient(
    home ? runtimes[index].host.homeActionClient() : runtimes[index].host.actionClient(molisWorkHostProjectReference({ projectId, databasePath: projects[index].database_path })),
    () => ({ actor_id: actor, project_id: home ? null : projectId, audience: 'user', permissions }),
  );
  const compare = (name, read) => checks.push(async () => assert.deepEqual(await read(1), await read(0), name));
  const at = '2026-11-20T00:00:00.000Z';
  const who = { actor_id: 'alice', audience: 'user' };
  const noop = () => {};
  const guidance = database => createProjectGuidance({ db: database.db, journal: new LocalSqliteJournal(database.db), now: () => new Date(at),
    requestHash: value => createHash('sha256').update(canonicalJsonText(value)).digest('hex') });
  const corrections = database => createSurfaceCorrections(database.db, who), slot = { kind: 'home' };
  const acceptanceCaller = { project_id: projectId, actor_id: 'alice', person: true, session: null };
  const acceptanceSubject = { provider_id: 'io.molis.work.assistant.rules', subject: { kind: 'assistant.work', id: 'review-work' } };
  const projectStore = store(0);
  try {
    const versionStores = openProjectVersionStores(projectStore);
    const producer = { plugin_id: codingManifest.plugin_id, plugin_version: codingManifest.version, binding_signature: codingManifest.publisher.signature };
    for (const version of [1, 2]) {
      const input = { project_id: projectId, artifact_id: 'combined-artifact', version, actor_id: 'alice', schema_version: 1, producer,
        content: { kind: 'inline', payload: { title: `Full version ${version}`, ordered: [3, 1, 2] } }, ...(version === 2 ? { supersedes_version: 1 } : {}) };
      versionStores.artifacts.commands.registerVersion({ ...input, producer: ARTIFACT_PRODUCER, title: 'Evidence', media_type: 'text/markdown',
        origin: { kind: 'imported', file_name: 'evidence.md' }, artifact_type_id: IMPORTED_DOCUMENT_TYPE, schema_version: IMPORTED_DOCUMENT_SCHEMA_VERSION,
        content: { kind: 'inline', payload: { source: 'file', source_id: 'evidence.md', source_url: null, title: 'Evidence', content: `# Version ${version}\n`, format: 'markdown', warnings: [] } } });
      versionStores.processItems.commands.registerVersion({ ...input, artifact_id: 'combined-plan', artifact_type_id: CODING_PLAN_TYPE });
    }
    const goal = new GoalProjectApplication(projectStore);
    goal.goalEvents.createIntent({ project_id: projectId, goal_id: 'combined-goal', title: 'Persistent goal', outcome: 'Verify the original evidence', actor_id: 'alice', actor_kind: 'runtime', idempotency_key: 'combined-goal' });
    const db = fromProjectConnection(projectStore.db);
    const source = new SourcesModule(db).commands.save({ project_id: projectId, source_id: 'combined-source', kind: 'github', definition_id: 'github.notifications', sync_kind: 'github', name: 'Source', description: 'Description', status: 'active', enabled: true, origin: 'molis_work', config: {}, schedule: { mode: 'manual' }, connection_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: at, updated_at: at });
    new FeedOutRuleStore(db).create(projectId, { name: 'Rule', match: { contains: 'Saved' }, enabled: true });
    const signals = new SignalsModule(db);
    const draft = { project_id: projectId, source_id: 'combined-source', provider_dedupe_id: 'saved', kind: 'update', occurred_at: at, observed_at: at, payload: { title: 'First' }, content_refs: [], raw_event_id: 'raw', adapter: { plugin_id: 'fixture', version: '1.0.0' }, provenance: {} };
    signals.commands.submitDraft(draft);
    const signal = signals.commands.submitDraft({ ...draft, payload: { title: 'Second' } }).signal;
    createDemoFeedApplication(projectStore.db).ingestItem({ source, externalId: 'saved', signal: { signal_id: signal.signal_id, revision: 2 }, title: 'Saved Feed message', summary: 'Complete summary', occurredAt: at, attention: false });
    projectStore.db.prepare(`INSERT INTO schedule_conversation_tasks
      (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,created_at,updated_at)
      VALUES ('combined-task','Scheduled review','Inspect saved results',9,0,1,1,0,0,NULL,?,?)`).run(at, at);
    new AttentionModule(projectStore.db, { exists: () => true }).commands.create({ project_id: projectId, entry_id: 'combined-attention', subject_type: 'goal', subject_id: 'combined-goal', reason: 'manual' });
    guidance(projectStore).add(projectId, 'alice', { reason: 'User decision', confirmation_summary: 'Confirmed', user_confirmed: true,
      kind: 'constraint', content: 'Keep the original evidence', source_refs: [], idempotency_key: 'combined-guidance' });
    fixtureProjectRule(projectStore, projectId, 'alice', true, 'Review before execution');
    openAcceptance(projectStore.db, projectId).set(acceptanceCaller, { subject: acceptanceSubject, requirements: [
      { id: 'fixed-1', statement: 'Read version one', requires_person: true }, { id: 'asset', statement: 'Check complete bytes' },
    ] });
    await corrections(projectStore).correct({ slot, subject: { kind: 'goal', id: 'combined-goal' }, correction: 'pin', position: 2, expected_revision: '0' },
      { beforeEffect: async () => {}, current: noop }, () => at);
  } finally { projectStore.close(); }

  const page = withOwner(0, openPagesStore, pages => {
    const doc = pages.create({ project_id: projectId, title: 'Page pins the historical version' });
    return pages.update(doc.id, { artifact_id: 'combined-artifact', artifact_version: 1 }, projectId);
  });
  for (const [name, open] of [['Form', openFormStore], ['Dataset', openDatasetStore], ['PPT', openPptStore], ['Lingguang', openLingguangStore]]) {
    const id = withOwner(0, open, owner => owner.create({ project_id: projectId, title: name + ' content' }).id);
    compare(name, index => withOwner(index, open, owner => {
      const item = owner.get(id, projectId);
      return [item.id, item.title];
    }));
  }
  withOwner(0, openCogniaStore, owner => {
    const domain = owner.createDomain('Combined domain');
    const material = owner.createMaterial({ title: 'Saved evidence', body: 'Complete body', domain_id: domain.id });
    compare('Cognia material', index => withOwner(index, openCogniaStore, restored => restored.download(material.id)));
  });
  const jelly = withOwner(0, openJellyStore, owner => owner.execute({ type: 'note.create', title: 'Saved note', markdown: 'Full note' }).notes[0]);
  compare('Jelly note', index => withOwner(index, openJellyStore, owner => {
    const note = owner.read().notes.find(item => item.id === jelly.id);
    assert.ok(note);
    const { revision, ...facts } = note;
    assert.ok(revision >= jelly.revision, 'the target keeps its own editing revision');
    return facts;
  }));
  const todoContext = { projectId: null, projectIds: [], actor: 'user', actorId: 'alice' };
  const todo = withOwner(0, openTodoStore, owner => owner.create({ title: 'Saved task' }, todoContext).item);
  compare('Todo', index => withOwner(index, openTodoStore, owner => {
    const record = owner.get(todo.id, todoContext);
    return [record.id, record.title];
  }));
  const issue = openIssuesSyncStore(homes[0], 'alice');
  try {
    const record = await issue.store.create({ title: 'Saved issue', type: 'bug', description: 'Reproduce with the document', images: [] },
      { actor_id: 'alice', audience: 'user', project_id: null, permissions: ['issues:read', 'issues:write'], beforeEffect: async () => {} });
    compare('Issue', index => withOwner(index, home => openIssuesSyncStore(home, 'alice'), owner => {
      const result = owner.store.read(record.id);
      return [result.id, result.title, result.description, result.images];
    }));
  } finally { issue.close(); }

  withOwner(0, openWorkflowsStore, owner => {
    const flow = owner.create({ project_id: projectId, title: 'Ordered work', chain: { stations: [newStation('pages'), newStation('inbox')], links: [manualLink()] } });
    const instance = owner.startInstance(flow, { plugin: 'pages', item_id: page.id, title: page.title });
    const read = index => withOwner(index, openWorkflowsStore, value => [value.get(flow.workflow_id, projectId).stations, value.instance(instance.instance_id, projectId).steps]);
    compare('Workflow station order and history references', read);
    checks.push(() => withOwner(1, openWorkflowsStore, value => assert.throws(() => value.assertExecutableInstance(instance.instance_id), /仅可查看/)));
  });
  const characterStore = home => openCharacters(home, LOCAL_PERSON_ACTOR_ID);
  const character = withOwner(0, characterStore, owner => owner.service.create({ title: 'Review character', instructions: 'Verify evidence', host_tools: null }));
  compare('Character', index => withOwner(index, characterStore, owner => {
    const draft = owner.service.get(character.character_id);
    return [draft.character_id, draft.title, draft.instructions];
  }));

  const riskCall = index => actionClient(index, [...RISK_WRITE, ...WORK_BRIEF_WRITE]);
  const { risk } = await riskCall(0).invoke(riskActions.create, { title: 'Saved risk', statement: 'Check the interface', impact: 'high', likelihood: 'low' });
  compare('Risk and chronological history', async index => {
    const result = await riskCall(index).invoke(riskActions.get, { risk_id: risk.risk_id });
    return [result.risk.risk_id, result.risk.statement, result.events.map(event => [event.kind, event.at])];
  });
  const brief = await riskCall(0).invoke(workBriefActions.save, { request_id: 'combined-brief', draft: { claims: [{ text: 'Saved project claim', supplied_by: 'owner' }], next: [] } });
  checks.push(async () => {
    const restored = await riskCall(1).invoke(workBriefActions.get, {});
    assert.equal(restored.brief.brief_id, brief.brief.brief_id);
    assert.deepEqual(restored.version.claims, brief.version.claims);
  });
  const original = Buffer.from('Shelf transfer through the same account');
  const shelf = index => actionClient(index, SHELF_ACTION_PERMISSIONS, true);
  const {item} = await shelf(0).invoke(shelfActions.admit, { filename: 'combined.txt', bytes_base64: original.toString('base64') });
  checks.push(async () => assert.deepEqual(Buffer.from((await shelf(1).invoke(shelfActions.file, { item_id: item.item_id })).bytes_base64, 'base64'), original));

  const imageActions = index => actionClient(index, IMAGES_ACTION_PERMISSIONS, false, LOCAL_PERSON_ACTOR_ID);
  const {connection} = await imageActions(0).invoke(imagesActions.saveConnection, { name: 'Fixture provider', api_format: 'openai-images', base_url: imageOrigin, model: 'synthetic' });
  const started = (await imageActions(0).invoke(imagesActions.start, { request_id: 'combined-image', connection_id: connection.id, prompt: 'Saved drawing' })).job;
  let image;
  const deadline = Date.now() + 5000;
  do {
    image = (await imageActions(0).invoke(imagesActions.get, { id: started.id })).job;
    if (image.status !== 'succeeded') await setTimeout(10);
  } while (image.status === 'running' && Date.now() < deadline);
  assert.equal(image.status, 'succeeded');
  checks.push(async () => {
    const restored = (await imageActions(1).invoke(imagesActions.get, { id: image.id })).job;
    assert.deepEqual([restored.id, restored.prompt, restored.status], [image.id, image.prompt, 'succeeded']);
    assert.deepEqual(restored.images.map(value => value.id), image.images.map(value => value.id));
    const result = await imageActions(1).invoke(imagesActions.image, { id: image.id, image_id: image.images[0].id });
    assert.deepEqual(Buffer.from(result.base64, 'base64'), png);
    assert.equal(imageRuns, 1, 'restoring the generated image does not execute the provider');
  });

  const withProject = async (index, use) => {
    const database = store(index);
    try { return await use(database); } finally { database.close(); }
  };
  const appearance = async (index, invoke) => {
    const owner = createAppearanceOwner(homes[index], { locale: { defaultLocale: 'en', isSupported: value => value === 'en', readFailed: noop, writeFailed: noop, writeSucceeded: noop }, listenerFailed: noop });
    const dispatcher = new ActionService();
    const close = dispatcher.registerProvider(owner.provider());
    try { return await invoke(bindActionClient(dispatcher, () => ({ ...who, project_id: null, permissions: [APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION] }))); }
    finally { close(); owner.close(); }
  };
  const skin = { skin: { id: 'soft-workbench', revision: 1 }, font: { policy: 'pinned', scheme: { id: 'system-sans', revision: 1 } }, mono: null };
  await appearance(0, actions => actions.invoke(appearanceSelectionActions.apply, { request_id: 'choose-skin', expected_revision: 0, choice: { kind: 'selection', selection: skin } }));
  compare('Appearance selection', index => appearance(index, async actions => (await actions.invoke(appearanceSelectionActions.get, {})).selection));
  const promptKey = ASSISTANT_PLUGIN_ID + '/assistant-base';
  homeAgentDefinitions(homes[0]).save(promptKey, 'Check the facts in order.', null, 'alice');
  compare('Prompt override', index => homeAgentDefinitions(homes[index]).prompt(promptKey).body);
  const text = { literal: 'Combined blueprint' }, scope = { actor_id: 'alice', project_id: null };
  const blueprint = { title: text, purpose: { audience: text, work: text, inputs: text, outputs: text, first_result: text },
    parts: [{ part_id: 'note', layer: 'personal', required: false, proposal: { kind: 'content', type: 'notes.outline.v1', body: {} } }],
    steps: [{ step_id: 'verify', title: text, part_ids: ['note'] }],
    example_task: { title: text, input: text, step_ids: ['verify'], result: { part_id: 'note', location: text } } };
  const draftId = new AdoptionStore(homes[0]).saveDraft(scope, { blueprint, expected_revision: null }, 'en').draft.source.draft_id;
  compare('Blueprint identity and ordered steps', index => new AdoptionStore(homes[index]).draft(scope, draftId).blueprint);
  const functions = async (index, use) => {
    const service = createFunctionsService({ home: homes[index], credential: () => null });
    try { return await use(service); } finally { service.close(); }
  };
  await functions(0, service => service.createChoice({ name: 'Combined decision', function_key: 'combined_decision' }));
  compare('Judgment rule', index => functions(index, service => {
    const rule = service.getByKey('combined_decision');
    assert.ok(rule);
    return [rule.id, rule.name, rule.function_key];
  }));
  compare('Surface corrections and position', index => withProject(index, database => corrections(database).read(slot).corrections));
  compare('Project guidance', index => withProject(index, database => guidance(database).read(projectId).entries));
  compare('Project approval rule order', index => withProject(index, database => projectApprovalRules(database.db, projectId).read().rules));
  compare('Acceptance requirement order and IDs', index => withProject(index, database => openAcceptance(database.db, projectId)
    .read(acceptanceCaller, { subjects: [acceptanceSubject] }).views[0].requirements));
  compare('Attention entries', index => withProject(index, database => new AttentionModule(database.db, { exists: () => true }).query.list(projectId).map(entry => [entry.entry_id, entry.subject_type, entry.subject_id, entry.status])));
  compare('Feed item and ordered signal history', index => withProject(index, database => {
    const db = fromProjectConnection(database.db);
    const messages = createDemoFeedApplication(database.db).snapshot(projectId).feed_items.map(entry => [entry.item_id, entry.title]);
    return [messages, new SignalsModule(db).events.list(projectId).map(entry => [entry.event_id, entry.signal_id, entry.revision])];
  }));
  checks.push(() => withProject(1, database => {
    const db = fromProjectConnection(database.db);
    assert.equal(new SourcesModule(db).query.get(projectId, 'combined-source').enabled, false);
    assert.deepEqual(database.db.prepare('SELECT name,enabled FROM feed_out_rules WHERE project_id=? ORDER BY name').all(projectId).map(row => [row.name, row.enabled]), [['Rule', 0]]);
    const task = database.db.prepare('SELECT task_id, enabled, job_id FROM schedule_conversation_tasks').get();
    assert.deepEqual([task.task_id, task.enabled, task.job_id], ['combined-task', 0, null]);
  }));
  const withCoding = (index, use) => withProject(index, async database => {
    const library = openPluginProjectLibrary({ db: database.db, path: database.path }, codingManifest, () => {}, { install_id: 'combined-coding', installation_generation: 'one' });
    try { return await use(new CodingSessionStore(library.client)); } finally { library.close(); }
  });
  await withCoding(0, async coding => {
    const commit = async () => {};
    await coding.create(commit, { project_id: projectId, session_id: 'combined-session', title: 'Saved coding session', runtime_id: 'prologue', at });
    await coding.inputs.write(commit, projectId, 'combined-session', 0, { draft: 'Draft body', question_drafts: { first: 'Saved answer' } });
  });
  compare('Coding session and drafts', index => withCoding(index, coding => [coding.list(projectId).map(row => [row.session_id, row.title]), coding.inputs.read(projectId, 'combined-session')]));

  const authoring = database => new AgentBuilderStore(new SqlitePluginPrivateStorage(database.db).forPlugin({
    install_id: 'agent-studio:' + projectId, plugin_id: builderManifest.plugin_id, version: builderManifest.version,
    deployment: 'local', grants: ['storage:private'], project_id: projectId, requireGrant() {},
  }, builderManifest));
  const authored = await withProject(0, database => {
    const builder = authoring(database), created = builder.create('Combined design');
    const directory = join(homes[0], 'plugin-builder', projectId, 'builds', created.id, 'saved');
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(join(directory, 'src', 'main.ts'), 'export const combined = true;\n');
    builder.update(created.id, created.revision, row => { row.directory = directory; row.messages.push({ role: 'assistant', text: 'Saved design record' }); });
    return created.id;
  });
  compare('Plugin Builder saved draft and files', index => withProject(index, database => {
    const record = authoring(database).require(authored);
    return [record.id, record.title, record.messages, readFileSync(join(record.directory, 'src', 'main.ts'))];
  }));

  const studio = async (index, use) => {
    const runtime = createAlchemistStudioRuntime({ databasePath: join(homes[index], 'alchemist', 'projects', projectId, 'studio.sqlite'), storage: { space, projectId },
      ai: { listModels: async () => [], search: async () => assert.fail('restore must not search'), generate: async () => assert.fail('restore must not generate') } });
    try { return await use(runtime.actionsFor('alice')); } finally { await runtime.close(); }
  };
  await studio(0, actions => actions.invoke(alchemistActions.directionCreate, { title: 'Saved research', description: 'Recorded direction' }));
  compare('Alchemist saved directions', index => studio(index, async actions => (await actions.invoke(alchemistActions.bootstrap, {})).directions));

  const drain = async client => {
    for (let cycle = 0; cycle < 8; cycle++) {
      await client.run();
      const summary = client.status();
      if (summary.error === null) return;
      for (const problem of summary.error.split('\n')) assert.match(problem, /附件传输尚未完成/);
    }
    assert.fail(`Combined transfer remained incomplete: ${client.status().error}`);
  };
  const combinedTitle = 'All owners transferred';
  await runtimes[0].withCatalog({ homeDirectory: homes[0] }, catalog => catalog.renameProject(projectId, combinedTitle, 'alice', first.display_name));
  await sender.save({ ...sender.policy(), selections: all.map(row => row.selection) });
  await drain(sender);
  holdVersions = true;
  await drain(receiver);
  assert.ok(heldReads > 0);
  const waiting = receiver.status().collections.find(row => row.selection.plugin_id === 'io.molis.work.pages');
  const dependency = waiting?.conflicts.find(conflict => conflict.key.includes(page.id));
  assert.equal(dependency?.waiting, true, JSON.stringify(waiting));
  assert.match(dependency.reason, /关联成果版本尚未到达/);
  assert.throws(() => withOwner(1, openPagesStore, owner => owner.get(page.id, projectId)), /找不到/);
  holdVersions = false;
  await drain(receiver);
  await drain(sender);
  for (const [index, client] of [sender, receiver].entries()) {
    const status = client.status();
    assert.equal(status.error, null);
    assert.deepEqual(status.unavailable, []);
    assert.deepEqual(status.policy.selections.map(syncNamespace).sort(), all.map(row => syncNamespace(row.selection)).sort());
    for (const row of status.collections) {
      assert.equal(row.pending, 0, `${index === 0 ? 'source' : 'destination'}: ${identity(row.selection)}: ${JSON.stringify(row.conflicts)}`);
      assert.deepEqual(row.conflicts, [], identity(row.selection));
      assert.deepEqual(row.failures, [], identity(row.selection));
    }
  }
  const receivedPage = withOwner(1, openPagesStore, owner => owner.get(page.id, projectId));
  assert.deepEqual([receivedPage.id, receivedPage.body, receivedPage.goal_id, receivedPage.artifact_id, receivedPage.artifact_version], [page.id, page.body, page.goal_id, 'combined-artifact', 1]);
  await runtimes[1].withCatalog({ homeDirectory: homes[1] }, catalog => {
    const receivedProject = catalog.getProject(projectId);
    assert.equal(receivedProject.display_name, combinedTitle);
    assert.notEqual(receivedProject.database_path, first.database_path);
    assert.deepEqual(catalog.listProjects().map(project => project.project_id), [projectId]);
  });
  const snapshot = index => {
    const database = store(index);
    try {
      const owners = openProjectVersionStores(database);
      return [owners.artifacts.query.listArtifactVersions(projectId, 'combined-artifact'), owners.processItems.query.listArtifactVersions(projectId, 'combined-plan'), boardSnapshot(database, projectId).goals.map(goal => goal.goal_id)];
    } finally { database.close(); }
  };
  assert.deepEqual(snapshot(1), snapshot(0));
  const uploaded = await cloud.db.prepare('SELECT DISTINCT namespace FROM sync_events WHERE value IS NOT NULL').all();
  assert.deepEqual(uploaded.results.map(row => row.namespace).sort(), all.map(row => syncNamespace(row.selection)).sort(), 'each selected namespace publishes a nonempty owner record');
  for (const check of checks) await check();
  const count = async () => (await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;
  const before = await count();
  await sender.run(); await receiver.run();
  assert.equal(await count(), before, 'restoring the combined set never echoes owner writes');
});
