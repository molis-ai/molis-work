import {ActionService} from '@molis-ai/molis-work-kernel';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { bindRuntimeSyncCollection, PluginRuntime, PluginSupervisor, SqlitePluginPrivateStorage, assertContributionMatchesManifest } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginAppContribution, PluginExecutor } from '@molis-ai/molis-work-contracts/platform/plugin';
import { createPersonalNotesSample } from '../examples/personal-sync-plugin/plugin.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { MolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { homeProbe } from './fixtures/home-runtime.js';

async function fixture(t: import('node:test').TestContext,maintain?:()=>void) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close()); const storage = new SqlitePluginPrivateStorage(db);
  let account = true, starts = 0;
  const sample = createPersonalNotesSample(), manifest = sample.definition.manifest;
  const executor: PluginExecutor = {
    async start(definition, context) {
      starts++;
      const hosted = { ...context, sync: { spaceId: 'personal:alice', assertActive() { if (!account) throw new Error('ACCOUNT_REVOKED'); context.requireGrant('storage:private'); } },
        services: { storage: storage.forPlugin(context, definition.manifest), ui: { register() { throw new Error('UI_NOT_DECLARED'); }, unregister() {} } } };
      const contribution=await definition.start(hosted);return { contribution:maintain&&contribution.kind==='app'?{...contribution,sync:contribution.sync?.map(binding=>({...binding,replica:{...binding.replica,maintain}}))}:contribution };
    },
    async stop(definition, context) { await definition.stop?.(context); },
  };
  const runtime = new PluginRuntime(undefined, executor,{actions:{registry:new ActionService()}}), supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: sample.definition, grants: ['storage:private'] }]);
  t.after(async () => { for (const installed of runtime.list()) if (installed.state === 'running') await runtime.stop(installed.install_id); });
  const authority = { authorize() { if (!account) throw new Error('ACCOUNT_REVOKED'); }, record: (id: string) => runtime.get(id) };
  const bind = () => bindRuntimeSyncCollection(supervisor, manifest.plugin_id, 'notes', authority);
  return { sample, manifest, runtime, supervisor, bind, starts: () => starts, revoke: () => { account = false; } };
}

test('S-72 PCSYNC-25 independent SDK owner binds current identity, sends exact attachment bytes and never echoes remote content', async t => {
  const a = await fixture(t), b = await fixture(t), binding = (await a.bind())!, target = (await b.bind())!;
  assert.equal(binding.publisher_signature, a.manifest.publisher.signature); assert.equal(binding.collection.id, 'notes');
  assert.equal(binding.available(), true);
  const bytes = Buffer.from([0, 255, 128, 13, 10]); a.sample.edit('note-1', { text: '完整正文', attachment: bytes.toString('base64') });
  const mutation = binding.replica.next()!, encoded = binding.content!.encode(mutation.key, mutation.value);
  assert.ok(encoded.blobs.some(blob => blob.digest === createHash('sha256').update(bytes).digest('hex')));
  const decoded = await target.content!.decode(mutation.key, encoded.value, async reference => {
    const blob = encoded.blobs.find(row => row.digest === reference.digest); assert.ok(blob); return blob.bytes;
  });
  target.replica.receive({ ...mutation, value: decoded, revision: 1 });
  assert.deepEqual(b.sample.read().notes['note-1'], { text: '完整正文', attachment: bytes.toString('base64') }); assert.equal(target.replica.next(), null);
  binding.replica.acknowledge(mutation.key, mutation.operationId, 1); assert.equal(binding.replica.next(), null);
  const count = a.starts(); a.supervisor.revoke(a.manifest.plugin_id);
  assert.equal(binding.available(), false);
  assert.throws(() => binding.replica.next(), { code: 'actions.forbidden' }); assert.equal(await a.bind(), null); assert.equal(a.starts(), count, 'discovery never enables a disabled installation');
  await a.supervisor.enable(a.manifest.plugin_id); assert.ok(await a.bind()); assert.throws(() => binding.replica.counts(), { code: 'actions.forbidden' }, 'restart does not revive an old handle');
});

test('S-72 PCSYNC-25 the independent owner can delete an own key that also names an Object prototype property',async t=>{
 const f=await fixture(t),binding=(await f.bind())!;
 assert.throws(()=>f.sample.edit('__proto__',{text:'invalid dictionary key',attachment:null}),{code:'sample_notes.invalid'});assert.deepEqual(f.sample.read(),{notes:{}});
 f.sample.edit('constructor',{text:'own note',attachment:null});const first=binding.replica.next()!;assert.equal(first.key,'constructor');
 binding.replica.acknowledge(first.key,first.operationId,1);f.sample.edit('constructor',null);
 const deletion=binding.replica.next()!;assert.equal(deletion.key,'constructor');assert.equal(deletion.value,null);
 binding.replica.acknowledge(deletion.key,deletion.operationId,2);assert.equal(binding.replica.counts().pending,0);
});

test('S-72 PCSYNC-25 upgrade and retained-data reinstall cannot revive a previous activation binding', async t => {
  const f = await fixture(t), old = (await f.bind())!, install = f.runtime.list()[0]!;
  f.sample.edit('keep', { text: 'saved before upgrade', attachment: null });
  const next = createPersonalNotesSample('2.0.0'), definition = { ...next.definition, manifest: { ...next.definition.manifest,
    upgrade_compatibility: { compatible_from_versions: ['1.0.0'], migratable_from_versions: [] } } };
  const upgraded = await f.supervisor.upgrade(f.manifest.plugin_id, definition); assert.equal(upgraded.status, 'running');
  assert.equal(old.available(), false); assert.throws(() => old.replica.next(), { code: 'actions.forbidden' });
  const current = (await f.bind())!; assert.equal(current.available(), true); assert.equal(next.read().notes.keep!.text, 'saved before upgrade');
  const installed = f.runtime.get(install.install_id); await f.runtime.uninstall(install.install_id, { retain_private_data: true });
  assert.equal(current.available(), false); assert.equal(await f.bind(), null, 'discovery does not reinstall an uninstalled plugin');
  f.runtime.install({ definition, deployment: 'local', grants: ['storage:private'] });
  await f.supervisor.restart(f.manifest.plugin_id);
  const replacement = (await f.bind())!; assert.ok(replacement); assert.equal(replacement.available(), true);
  assert.notEqual(f.runtime.get(install.install_id).installation_generation, installed.installation_generation);
  assert.throws(() => current.replica.receive({ key: 'keep', base: 0, revision: 1, operationId: 'late-old-instance', value: null }), { code: 'actions.forbidden' });
  assert.equal(next.read().notes.keep!.text, 'saved before upgrade');
});

test('S-72 PCSYNC-06/25 late attachment reads refuse after account cancellation and cannot create target business facts', async t => {
  const f = await fixture(t), binding = (await f.bind())!;
  f.sample.edit('note', { text: 'only source', attachment: Buffer.from('raw content').toString('base64') });
  const operation = binding.replica.next()!, encoded = binding.content!.encode(operation.key, operation.value);
  let resume!: () => void; const waiting = new Promise<void>(resolve => { resume = resolve; });
  const decode = binding.content!.decode(operation.key, encoded.value, async ref => { await waiting; return encoded.blobs.find(blob => blob.digest === ref.digest)!.bytes; });
  f.revoke(); resume(); await assert.rejects(decode, /ACCOUNT_REVOKED/);
  assert.throws(() => binding.replica.receive({ ...operation, revision: 1 }), /ACCOUNT_REVOKED/);
});

test('S-72 PCSYNC-25 undeclared, duplicate and malformed sync implementations fail activation validation', async t => {
  const f = await fixture(t), binding = (await f.bind())!, actions=f.manifest.actions!.map(definition=>({...definition,handle(){throw new Error('UNUSED_ACTION');}})), delivered = { collection_id: 'notes', replica: binding.replica };
  for (const sync of [[{ ...delivered, collection_id: 'foreign' }], [delivered, delivered], [{ collection_id: 'notes', replica: {} }]]) {
    assert.throws(() => assertContributionMatchesManifest(f.manifest, { kind: 'app', actions, sync } as PluginAppContribution), { code: 'plugin.contribution_unredeemed' });
  }
  assert.doesNotThrow(() => assertContributionMatchesManifest(f.manifest, { kind: 'app',actions }), 'unimplemented declaration remains explicitly unavailable');
  assert.equal(await bindRuntimeSyncCollection(f.supervisor, f.manifest.plugin_id, 'undeclared', { authorize() {}, record: id => f.runtime.get(id) }), null);
});

test('S-72 PCSYNC-01/25 real Host injects only immutable personal Home ownership, and revokes old sync context on stop', async t => {
  for (const kind of ['local', 'personal'] as const) {
    const home = mkdtempSync(join(tmpdir(), 'runtime-sync-scope-')), probe = homeProbe('sync-' + kind);
    const space = kind === 'personal' ? personalStorageSpace('https://auth.example.test', 'work', 'alice') : undefined;
    ensureStorageSpace(home, space);
    const definition = { ...probe.definition, manifest: { ...probe.definition.manifest, sync: { protocol_version: 1 as const,
      collections: [{ id: 'notes', title: '笔记', schema_version: 1, requires: [] }] } } };
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [definition] } });
    try {
      const platform = await host.homePlugins!.ready(), context = probe.contexts.at(-1)!;
      assert.ok(context);
      if (kind === 'local') assert.equal(context.sync, undefined);
      else {
        assert.equal(context.sync!.spaceId, space!.spaceId); assert.ok(Object.isFrozen(context.sync)); context.sync!.assertActive();
        await platform.runtime.stop(context.install_id); assert.throws(() => context.sync!.assertActive(), { code: 'actions.forbidden' });
      }
    } finally { await host.close(); rmSync(home, { recursive: true, force: true }); }
  }
});


test('Runtime maintenance retains the same activation and account fences as replica writes',async t=>{
 let calls=0;const f=await fixture(t,()=>{calls++;}),binding=(await f.bind())!;assert.ok(binding.replica.maintain);binding.replica.maintain();assert.equal(calls,1);f.supervisor.revoke(f.manifest.plugin_id);assert.throws(()=>binding.replica.maintain!(),{code:'actions.forbidden'});assert.equal(calls,1);
});
