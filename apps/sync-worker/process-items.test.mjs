import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { personalStorageSpace, ensureStorageSpace } from '@molis-ai/molis-work-storage';
import { createPersonalSync, LocalProjectDatabase, GoalProjectApplication } from '@molis-ai/molis-work-app-local-host';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { CODING_PLAN_TYPE, codingManifest } from '@molis-ai/molis-work-plugin-coding';
import { cloudFixture } from './testing.mjs';

test('PCSYNC-11/13/22/23 complete process versions use the actual Host collection and Rust/D1/R2 without activating Coding', async t => {
  const cloud = await cloudFixture(t), root = mkdtempSync(join(tmpdir(), 'molis-process-cloud-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  const homes = ['a', 'b'].map(name => join(root, name)); homes.forEach(home => ensureStorageSpace(home, space));
  const previous = { origin: process.env.MOLIS_WORK_SYNC_ORIGIN, local: process.env.MOLIS_WORK_SYNC_LOCAL };
  process.env.MOLIS_WORK_SYNC_ORIGIN = 'https://sync.example.test'; delete process.env.MOLIS_WORK_SYNC_LOCAL;
  t.after(() => { for (const [key, value] of [['MOLIS_WORK_SYNC_ORIGIN', previous.origin], ['MOLIS_WORK_SYNC_LOCAL', previous.local]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  t.mock.method(globalThis, 'fetch', cloud.transport);
  const project = await withMolisWorkProjectCatalog({ homeDirectory: homes[0] }, catalog => catalog.createProject({ display_name: 'Saved process versions', actor_id: 'alice' }));
  const source = new LocalProjectDatabase(project.database_path); t.after(() => source.close());
  const app = new GoalProjectApplication(source), text = '完整固定计划🙂\n'.repeat(75000), id = 'portable-coding-plan';
  const planSchema = codingManifest.process_items.produces.find(type => type.artifact_type_id === CODING_PLAN_TYPE).schema_version;
  const publish = version => app.processItems.commands.registerVersion({ project_id: project.project_id,
    artifact_id: id, version, artifact_type_id: CODING_PLAN_TYPE, schema_version: planSchema, actor_id: 'plugin:coding',
    producer: { plugin_id: codingManifest.plugin_id, plugin_version: codingManifest.version, binding_signature: codingManifest.publisher.signature },
    content: { kind: 'inline', payload: { text: version === 1 ? text : 'A later complete plan' } },
    ...(version > 1 ? { supersedes_version: version - 1 } : {}) });
  publish(1);
  const check = () => {}, lease = { userId: 'alice', applicationId: 'work', authOrigin: 'https://auth.example.test',
    signal: new AbortController().signal, assertCurrent: check, accessToken: async () => 'alice' };
  const clients = await Promise.all(homes.map(home => createPersonalSync(home, space, lease, withMolisWorkProjectCatalog, check)));
  t.after(() => clients.forEach(client => client.close()));
  const selected = clients[0].status().collections.find(row => row.selection.collection_id === 'process_items');
  assert.ok(selected); assert.equal(clients[0].policy().selections.length, 0);
  await clients[0].save({ ...clients[0].policy(), selections: [selected.selection] });
  await clients[0].run(); await clients[1].run(); clients.forEach(client => assert.equal(client.status().error, null));
  const received = await withMolisWorkProjectCatalog({ homeDirectory: homes[1] }, catalog => ({
    project: catalog.listProjects().find(row => row.project_id === project.project_id),
    plugins: catalog.listProjectPlugins(project.project_id),
  }));
  assert.ok(received.project); assert.equal(received.plugins.some(row => row.plugin_id === 'coding' || row.plugin_id === 'artifacts'), false);
  const target = new LocalProjectDatabase(received.project.database_path); t.after(() => target.close());
  const restored = new GoalProjectApplication(target);
  assert.deepEqual(restored.processItems.query.getArtifactVersion(project.project_id, { artifact_id: id, version: 1 }).payload, { text });
  assert.deepEqual(restored.artifacts.query.listArtifacts(project.project_id), []);
  assert.equal(target.db.prepare('SELECT COUNT(*) AS n FROM coding_sessions').get().n, 0);
  assert.ok((await cloud.bucket.list()).objects.length > 0, 'the full process body, not a preview, traversed R2');
  publish(2);
  app.processItems.commands.archiveVersion({ project_id: project.project_id, artifact_id: id, version: 1, actor_id: 'plugin:coding' });
  await clients[0].run(); await clients[1].run();
  assert.deepEqual(restored.processItems.query.listArtifactVersions(project.project_id, id), app.processItems.query.listArtifactVersions(project.project_id, id));
  const count = (await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n;
  await clients[0].run(); await clients[1].run();
  assert.equal((await cloud.db.prepare('SELECT COUNT(*) AS n FROM sync_events').first()).n, count, 'receiving fixed versions has no upload echo');
  clients.forEach(client => assert.equal(client.status().error, null));
});
