import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HomeConsentLedger, readStudioDistribution, pluginInstallActions, pluginControlActions, MolisWorkUninstallService, RuntimeIntegrationService, MolisWorkWebServiceManager } from '@molis-ai/molis-work-app-local-host';
import { createLazyFileSecretStore } from '@molis-ai/molis-work-storage';
import { verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { readyPublication, publicationAuthority } from './fixtures/studio-publishing.js';
import { fixture, mac, operate, operationsOf, person, ref, refused } from './fixtures/home-sandbox.js';

const identityPath = (home: string) => join(home, 'config', 'plugin-publisher.json');
const metadata = (home: string): { secret_ref: string; key_id: string; public_key_spki_base64: string } => JSON.parse(readFileSync(identityPath(home), 'utf8'));
const releasePath = (h: ReturnType<typeof readyPublication>, version = 1) => join(h.root, 'releases', h.build.id, 'v' + version);
const laterRevision = (h: ReturnType<typeof readyPublication>) => h.workflow.store.update(h.build.id, h.workflow.store.require(h.build.id).revision,
  build => { build.design!.contract.revision += '-next'; });

test('SDK-1 PUB-1 the real workflow publishes complete signed bytes, preserves BuildManifest, and has one parallel winner', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-publish-')), h = readyPublication(home, 'author');
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  const results = await Promise.allSettled([h.publish(), h.publish()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const release = h.workflow.store.versions(h.build.id)[0]!;
  assert.equal(h.workflow.store.versions(h.build.id).length, 1);
  assert.deepEqual(release.manifest.effects, { storage: ['read', 'write'] }, 'fixed independent effects oracle');
  assert.deepEqual(JSON.parse(readFileSync(join(release.directory, 'manifest.json'), 'utf8')), release.manifest, 'the original BuildManifest stays in the release directory');
  assert.equal(release.packagePath, release.directory);
  const bundle = await readStudioDistribution(h.root, release), verified = verifyPluginPackageSignature(bundle);
  assert.equal(bundle.payload.manifest.runtime?.scope, 'home');
  assert.equal(bundle.payload.manifest.plugin_id, h.build.design!.contract.pluginId);
  assert.equal(bundle.payload.manifest.version, '1.0.0');
  assert.equal(bundle.payload.manifest.publisher.signature, release.distribution!.publisher_key_id);
  assert.deepEqual(bundle.payload.files.map(file => file.path).sort(), ['contract.json', 'interface.json', 'manifest.json', 'plugin.mjs', 'prompts.json']);
  assert.deepEqual(new HomeConsentLedger(home).publishers(), [], 'publishing never pins the key');
  assert.equal(verified.key_id, metadata(home).key_id);
  assert.doesNotMatch(JSON.stringify(bundle), /PRIVATE KEY|secret_ref|signing-key/);
  assert.ok(!JSON.stringify(bundle).includes(home));
  assert.equal(readdirSync(release.directory).length, 6);
});

/** A real authority await, selected by observable publication progress rather than an implementation-specific call count. */
function heldAuthority(when: () => boolean) {
  let open!: () => void, arrived!: () => void, held = false, current = true;
  const reached = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { open = resolve; });
  const base = publicationAuthority();
  return { reached, open, expire: () => { current = false; }, authority: { ...base,
    async beforeEffect() { if (!held && when()) { held = true; arrived(); await gate; } },
    assert_authority_current() { if (!current) throw new Error('authority expired'); } } };
}

for (const change of ['revise', 'remove', 'scope', 'authority', 'close'] as const) {
  test('PUB-2 ' + change + ' while publication awaits prevents stale release and first key creation', async t => {
    const home = await mkdtemp(join(tmpdir(), 't149-stale-')), h = readyPublication(home, 'author'), gate = heldAuthority(() => true);
    t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
    const result = h.publish(gate.authority).then(() => null, error => error as Error);
    await gate.reached;
    if (change === 'revise') laterRevision(h);
    if (change === 'remove') await h.workflow.action(h.build.id, { action: 'remove', revision: h.build.revision });
    if (change === 'scope') await h.workflow.action(h.build.id, { action: 'scope', scope: 'project', revision: h.build.revision });
    if (change === 'authority') gate.expire();
    if (change === 'close') await h.workflow.close();
    gate.open(); assert.ok(await result);
    assert.equal(h.workflow.store.versions(h.build.id).length, 0);
    assert.equal(existsSync(identityPath(home)), false);
    assert.equal(existsSync(releasePath(h)), false);
  });
}

test('PUB-2 authority expiry at the final file boundary preserves the Home identity and cleans only this unpublished staging directory', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-final-')), h = readyPublication(home, 'author'), parent = join(h.root, 'releases', h.build.id);
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  const gate = heldAuthority(() => existsSync(parent) && readdirSync(parent).some(name => name.startsWith('.publishing-') && readdirSync(join(parent, name)).length === 6));
  const result = h.publish(gate.authority).then(() => null, error => error as Error);
  await gate.reached; const before = metadata(home); gate.expire(); gate.open(); assert.ok(await result);
  assert.deepEqual(metadata(home), before);
  assert.ok(createLazyFileSecretStore(home).get(before.secret_ref));
  assert.deepEqual(readdirSync(parent), []);
  assert.equal(h.workflow.store.versions(h.build.id).length, 0);
  const retry = await h.publish(); assert.equal(retry.version, 1); assert.equal(retry.distribution!.publisher_key_id, before.key_id);
});

test('PUB-3 a process crash after the real rename and before store CAS is recovered on the next explicit publication', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-crash-')), h = readyPublication(home, 'author');
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  const crashed = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/studio-publishing-crash.mts', import.meta.url)), home, h.root, h.statePath, h.build.id], { encoding: 'utf8' });
  assert.equal(crashed.status, 91, crashed.stderr);
  assert.equal(h.workflow.store.versions(h.build.id).length, 0);
  assert.ok(existsSync(join(releasePath(h), 'signed-package.json')));
  const key = metadata(home).key_id, release = await h.publish();
  assert.equal(release.version, 1); assert.equal(release.distribution!.publisher_key_id, key);
  const first = readFileSync(join(release.directory, 'signed-package.json'));
  laterRevision(h); const next = await h.publish(); assert.equal(next.version, 2);
  assert.ok(first.equals(readFileSync(join(release.directory, 'signed-package.json'))), 'a referenced winner and other version stay untouched');
  assert.deepEqual((await readStudioDistribution(h.root, next)).payload.manifest.upgrade_compatibility, { compatible_from_versions: ['1.0.0'] });
});

test('PUB-3 unknown files in an occupied final directory are retained and refused', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-foreign-')), h = readyPublication(home, 'author'), directory = releasePath(h);
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, 'someone-elses.txt'), 'keep');
  await assert.rejects(h.publish(), /归属|未知/);
  assert.equal(readFileSync(join(directory, 'someone-elses.txt'), 'utf8'), 'keep');
  assert.equal(h.workflow.store.versions(h.build.id).length, 0);
});

test('PUB-2 a competing qualification update inside the real store CAS rejects the release and preserves the previous winner', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-cas-')), h = readyPublication(home, 'author');
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  const first = await h.publish(), saved = readFileSync(join(first.directory, 'signed-package.json')); laterRevision(h);
  const replace = h.storage.compareAndSet!.bind(h.storage); let interleaved = false;
  h.storage.compareAndSet = (key, expected, next) => {
    if (!interleaved && JSON.parse(next).releases?.some((release: { version: number }) => release.version === 2)) {
      interleaved = true;
      h.workflow.store.update(h.build.id, h.workflow.store.require(h.build.id).revision, build => { build.checks.global!.passed = false; });
    }
    return replace(key, expected, next);
  };
  await assert.rejects(h.publish(), /草稿已更新/); assert.equal(interleaved, true);
  assert.equal(h.workflow.store.versions(h.build.id).length, 1);
  assert.equal(h.workflow.store.require(h.build.id).checks.global!.passed, false);
  assert.equal(existsSync(releasePath(h, 2)), false);
  assert.ok(saved.equals(readFileSync(join(first.directory, 'signed-package.json'))));
  assert.equal(metadata(home).key_id, first.distribution!.publisher_key_id);
});

test('KEY-1 concurrent projects and a restarted publisher share one Home key; another Home gets another key', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-keys-')), other = await mkdtemp(join(tmpdir(), 't149-other-'));
  const a = readyPublication(home, 'a'), b = readyPublication(home, 'b'), c = readyPublication(other, 'c');
  t.after(async () => { await Promise.all([a.workflow.close(), b.workflow.close(), c.workflow.close()]); await Promise.all([rm(home, { recursive: true, force: true }), rm(other, { recursive: true, force: true })]); });
  const [ra, rb, rc] = await Promise.all([a.publish(), b.publish(), c.publish()]);
  assert.equal(ra.distribution!.publisher_key_id, rb.distribution!.publisher_key_id);
  assert.notEqual(ra.distribution!.publisher_key_id, rc.distribution!.publisher_key_id);
  const d = readyPublication(home, 'after-restart');
  try { assert.equal((await d.publish()).distribution!.publisher_key_id, ra.distribution!.publisher_key_id); } finally { await d.workflow.close(); }
  assert.deepEqual(new HomeConsentLedger(home).publishers(), []);
});

for (const damage of ['missing', 'corrupt', 'mismatch'] as const) {
  test('KEY-2 ' + damage + ' identity state refuses publication without rotation', async t => {
    const home = await mkdtemp(join(tmpdir(), 't149-damaged-')), h = readyPublication(home, 'author');
    t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
    await h.publish(); laterRevision(h); const original = metadata(home), secrets = createLazyFileSecretStore(home);
    if (damage === 'missing') secrets.delete(original.secret_ref);
    if (damage === 'corrupt') secrets.put(original.secret_ref, 'invalid-private-key');
    if (damage === 'mismatch') writeFileSync(identityPath(home), JSON.stringify({ ...original, key_id: original.key_id + 'wrong' }));
    const before = readFileSync(identityPath(home));
    await assert.rejects(h.publish(), /恢复.*原来/);
    assert.ok(before.equals(readFileSync(identityPath(home))));
    assert.equal(h.workflow.store.versions(h.build.id).length, 1);
    if (damage === 'missing') assert.equal(secrets.get(original.secret_ref), null);
  });
}

test('KEY-2 only explicit publishing repairs interrupted public metadata using the existing sealed key', async t => {
  const home = await mkdtemp(join(tmpdir(), 't149-key-recovery-')), h = readyPublication(home, 'author');
  t.after(async () => { await h.workflow.close(); await rm(home, { recursive: true, force: true }); });
  const release = await h.publish(), original = metadata(home); rmSync(identityPath(home));
  await readStudioDistribution(h.root, release); assert.equal(existsSync(identityPath(home)), false, 'downloads never initialize or repair identities');
  laterRevision(h); const next = await h.publish();
  assert.equal(next.distribution!.publisher_key_id, original.key_id); assert.deepEqual(metadata(home), original);
});

test('CLEAN-1 explicit production Home purge removes its publisher metadata and sealed key while another Home still signs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 't149-clean-')), user = join(directory, 'user'), home = join(user, '.molis-work'), other = join(directory, 'other-user', '.molis-work');
  const a = readyPublication(home, 'a'), b = readyPublication(other, 'b');
  let aClosed = false;
  t.after(async () => { if (!aClosed) await a.workflow.close(); await b.workflow.close(); await rm(directory, { recursive: true, force: true }); });
  await Promise.all([a.publish(), b.publish()]); const keyB = metadata(other).key_id;
  await a.workflow.close(); aClosed = true;
  const service = new MolisWorkUninstallService({ homeDirectory: home,
    projects: { inspect: async () => ({ projects: [], conflict: null }), removeDemos: async () => {} },
    runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: user,
      runtimeExecutables: { codex: null, 'claude-code': null, opencode: null, 'pi-agent': null, 'grok-build': null } }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: user, platform: 'linux' }) });
  const plan = await service.prepare({ purge_user_data: true }); assert.equal(plan.status, 'ready', plan.conflicts.join('\n'));
  assert.ok(plan.changes.some(change => change.target === identityPath(home)));
  assert.ok(plan.changes.some(change => change.target === join(home, 'feed')));
  const result = await service.confirm({ plan_id: plan.plan_id, decision: 'confirmed', purge_confirmation: { home_directory: home, user_project_count: 0 } });
  assert.equal(result.status, 'purged'); assert.equal(existsSync(identityPath(home)), false); assert.equal(existsSync(join(home, 'feed')), false);
  assert.equal(metadata(other).key_id, keyB); laterRevision(b);
  assert.equal((await b.publish()).distribution!.publisher_key_id, keyB);
});

test('RAC-2656 RAC-2657 RAC-2658 KEY-2 local signatures still require personal pin confirmation, run in Home, survive restart, and do not transfer trust', mac, async t => {
  const a = await fixture(t), b = await fixture(t), source = readyPublication(a.home, 'author'), ownB = readyPublication(b.home, 'author');
  t.after(async () => { await source.workflow.close(); await ownB.workflow.close(); });
  const release = await source.publish(), bundle = await readStudioDistribution(source.root, release), pluginId = release.pluginId;
  const preview = await a.projectClient().invoke(person(), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; preview: { publisher_pinned: boolean }; runtime_scope: string };
  assert.equal(preview.preview.publisher_pinned, false); assert.equal(preview.runtime_scope, 'home');
  await assert.rejects(a.projectClient().invoke(person(), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true }), refused('plugin.publisher_untrusted'));
  assert.deepEqual(a.ledger.publishers(), []); assert.equal(a.host.homePlugins!.installation(pluginId), null);
  assert.equal(existsSync(join(a.home, 'plugin-packages', pluginId)), false);
  const again = await a.projectClient().invoke(person(), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
  await a.projectClient().invoke(person(), ref(pluginInstallActions.confirm), { preview_id: again.preview_id, consent: true, pin_label: 'My publishing key' });
  assert.equal(a.ledger.publishers()[0]!.key_id, release.distribution!.publisher_key_id);
  assert.equal(a.ledger.publishers()[0]!.pinned_by, person().actor_id);
  assert.equal(a.ledger.publishers()[0]!.public_key_spki_base64, bundle.publisher_key!.spki_base64);
  assert.equal(a.host.homePlugins!.installation(pluginId)!.execution, 'sandbox');
  const installationId = a.host.homePlugins!.installation(pluginId)!.install_id;
  await operate(a.homeClient(), a.homeCaller(), await operationsOf(a.homeClient(), a.homeCaller(), pluginId), 'notes.add', { text: 'signed and kept' });
  await a.reopen();
  assert.equal(a.host.homePlugins!.installation(pluginId)!.install_id, installationId);
  assert.deepEqual(await operate(a.homeClient(), a.homeCaller(), await operationsOf(a.homeClient(), a.homeCaller(), pluginId), 'notes.list', {}), [{ id: '1', text: 'signed and kept' }]);
  laterRevision(source); const second = await source.publish();
  const secondPreview = await a.projectClient().invoke(person(), ref(pluginInstallActions.preview), { bundle: await readStudioDistribution(source.root, second) }) as { preview_id: string; preview: { publisher_pinned: boolean } };
  assert.equal(secondPreview.preview.publisher_pinned, true);
  await a.projectClient().invoke(person(), ref(pluginInstallActions.confirm), { preview_id: secondPreview.preview_id, consent: true });
  assert.equal(a.ledger.publishers().length, 1); assert.equal(a.host.homePlugins!.installation(pluginId)!.version, '2.0.0');
  const bRelease = await ownB.publish(); await b.install(await readStudioDistribution(ownB.root, bRelease));
  const foreign = await b.projectClient().invoke(person(), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; preview: { publisher_pinned: boolean } };
  assert.equal(foreign.preview.publisher_pinned, false);
  await assert.rejects(b.projectClient().invoke(person(), ref(pluginInstallActions.confirm), { preview_id: foreign.preview_id, consent: true }), refused('plugin.publisher_untrusted'));
  assert.equal(b.ledger.publishers().length, 1); assert.equal(b.host.homePlugins!.installation(pluginId), null);
  await a.homeClient().invoke(person(null), ref(pluginControlActions.homeUninstall), { plugin_id: pluginId, keep_data: true });
  assert.equal(metadata(a.home).key_id, release.distribution!.publisher_key_id, 'CLEAN-1 uninstalling the published plugin preserves the Home publisher');
  a.ledger.revokePublisher(release.distribution!.publisher_key_id, new Date().toISOString()); laterRevision(source);
  await assert.rejects(source.publish(), /发布者已撤销/); assert.equal(metadata(a.home).key_id, release.distribution!.publisher_key_id);
});
