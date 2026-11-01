import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// RAC-2615: observe the actual built factory before the Host loads it. No second module URL or production testing API.
const captured = [], key = Symbol.for('t141.home.lifecycle.capture');
globalThis[key] = (context, lifecycle) => captured.push({ context, lifecycle });
const target = new URL('../../apps/local-host/dist/installed-plugin-lifecycle.js', import.meta.url).href;
let loads = 0;
const hook = registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (url !== target) return result;
  loads += 1;
  return { ...result, source: result.source.toString() + `\nconst t141OriginalFactory = installedLifecycle;
installedLifecycle = function(context) { const lifecycle = t141OriginalFactory(context); globalThis[Symbol.for('t141.home.lifecycle.capture')](context, lifecycle); return lifecycle; };\n` };
} });
const { HomePluginHost, HomeConsentLedger, SandboxPackageStore, readSandboxPackage, homeAgentDefinitions } = await import('@molis-ai/molis-work-app-local-host');
const { ActionService } = await import('@molis-ai/molis-work-kernel');
const { createFileSecretStore, runWithMolisWorkHome } = await import('@molis-ai/molis-work-storage');
const { newPublisher, signedPackage } = await import('./sandbox-package.ts');
const home = await mkdtemp(join(tmpdir(), 't141-controlled-home-'));
const actions = new ActionService(), caller = { actor_id: 'user', audience: 'user', project_id: null, permissions: [] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let fault, registration;
const realRegister = actions.registerProvider.bind(actions);
actions.registerProvider = provider => {
  const dispose = realRegister(provider);
  if (registration && provider.provider.plugin_id === registration.id) registration.signal.resolve();
  return dispose;
};
const host = new HomePluginHost({ home, actorId: 'user', registry: actions, client: actions, entries: [], inspect: async actor => {
  const snapshot = actions.inspect(actor);
  if (fault && !fault.used && captured[0]?.context.recordFor(fault.id)?.version === '1.1.0' && snapshot.some(view => view.provider.plugin_id === fault.id)) {
    fault.used = true; fault.entered.resolve(); await fault.release.promise; throw new Error('T141 after-apply exposure fault');
  }
  return snapshot;
} });
const pending = [];
try {
  const platform = await host.ready();
  assert.equal(loads, 1); assert.equal(captured.length, 1, 'exactly one real Home controller');
  const { context: c, lifecycle } = captured[0];
  assert.equal(c.platform.runtime, platform.runtime);
  const owner = runWithMolisWorkHome(home, () => createFileSecretStore());
  const publisher = newPublisher(), ledger = new HomeConsentLedger(home), packages = new SandboxPackageStore(home);
  ledger.pinPublisher({ key_id: publisher.identity, public_key_spki_base64: publisher.signer.public_key_spki_base64, label: 'Fixture', pinned_at: new Date().toISOString(), pinned_by: 'user' });
  const release = (id, version) => {
    const bundle = signedPackage(publisher, (files, manifest) => {
      manifest.runtime = { scope: 'home' };
      if (version !== '1.0.0') manifest.upgrade_compatibility = { compatible_from_versions: ['1.0.0'] };
      const contract = JSON.parse(files['contract.json']);
      const add = contract.operations.find(operation => operation.id === 'notes.add');
      add.effects = { storage: ['read', 'write'], networkDomains: ['api.example.test'], secretRefs: version === '1.0.0' ? ['weather'] : ['weather', 'fresh'] };
      files['contract.json'] = JSON.stringify(contract);
      files['prompts.json'] = JSON.stringify([{ id: version === '1.0.0' ? 'old-summary' : 'new-summary', title: 'Summary', purpose: 'Summarize', body: version + ' instruction' }]);
      if (version !== '1.0.0') files['plugin.mjs'] = files['plugin.mjs'].replace('text: input.text', "text: 'v2:' + input.text");
    }, { pluginId: id, version });
    const parsed = readSandboxPackage(bundle.payload);
    packages.save(bundle, parsed);
    return packages.load(id, publisher.identity, version);
  };
  const inputs = [{ name: 'weather', header: 'X-Weather', value: 'fixture-replacement' }, { name: 'fresh', header: 'X-Fresh', value: 'fixture-fresh' }];
  const readSecret = async (id, name) => {
    const resolved = await c.secrets.resolve(id, name);
    assert.equal(owner.get(`plugin-builder-secret:~home:${id}:${name}`), resolved?.value ?? null, 'the actual Home secret owner agrees');
    return resolved?.value ?? null;
  };
  const approved = id => {
    const value = c.approvedFor(id);
    assert.deepEqual(JSON.parse(c.storage.get('plugin-builder:agent-studio:approved:' + id)), value);
    assert.ok(!JSON.stringify(value).includes('fixture-replacement'));
    return value;
  };
  const prompts = id => homeAgentDefinitions(home).prompts().filter(prompt => prompt.source.kind === 'plugin' && prompt.source.plugin_id === id);
  const call = async (id, operation, input) => {
    const view = actions.inspect(caller).find(view => view.provider.plugin_id === id && view.action.local_id === operation);
    assert.ok(view, operation + ' is exposed');
    return actions.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
  };
  for (const scenario of ['success', 'failure', 'edit', 'disable', 'disabled', 'reenable']) {
    const id = 'io.molis.work.example.controlled.' + scenario;
    const v1 = release(id, '1.0.0'); await host.installPackage(v1);
    const initial = c.recordFor(id), oldApproval = approved(id);
    assert.deepEqual(prompts(id).map(prompt => prompt.prompt_id), ['old-summary']);
    c.secrets.save(id, { name: 'weather', header: 'X-Weather', value: 'fixture-old' });
    await call(id, 'notes.add', { text: 'kept' });
    const v2 = release(id, '1.1.0');
    await assert.rejects(lifecycle('upgrade', v2, { consent: true, secrets: [{ name: 'undeclared', header: 'X-Probe', value: 'fixture-unused' }] }), /密钥/);
    assert.equal(c.recordFor(id).version, '1.0.0'); assert.deepEqual(approved(id), oldApproval);
    assert.equal(await readSecret(id, 'weather'), 'fixture-old'); assert.equal(await readSecret(id, 'fresh'), null);
    await assert.rejects(lifecycle('rollback', v1, {}), { code: 'plugin.state_invalid' });
    if (scenario === 'disabled') await host.packageAction(id, 'disable');
    if (scenario === 'success' || scenario === 'disabled') {
      await lifecycle('upgrade', v2, { consent: true, secrets: inputs });
      assert.equal(await readSecret(id, 'weather'), 'fixture-replacement'); assert.equal(await readSecret(id, 'fresh'), 'fixture-fresh');
      assert.deepEqual(approved(id).secretRefs, ['fresh', 'weather']);
      assert.equal(c.recordFor(id).state, scenario === 'disabled' ? 'disabled' : 'running');
      if (scenario === 'disabled') { assert.equal(actions.inspect(caller).some(view => view.provider.plugin_id === id), false); await host.packageAction(id, 'enable'); }
    } else {
      fault = { id, entered: deferred(), release: deferred(), used: false };
      const result = lifecycle('upgrade', v2, { consent: true, secrets: inputs }).then(() => ({ ok: true }), error => ({ error })); pending.push(result);
      await Promise.race([fault.entered.promise, result.then(outcome => { throw new Error("upgrade settled before the real after-apply barrier", { cause: outcome.error }); })]);
      assert.equal(c.recordFor(id).version, '1.1.0');
      assert.equal(await readSecret(id, 'weather'), 'fixture-replacement'); assert.equal(await readSecret(id, 'fresh'), 'fixture-fresh');
      assert.deepEqual(approved(id).secretRefs, ['fresh', 'weather']);
      let enabled;
      if (scenario === 'edit') c.secrets.save(id, { name: 'weather', header: 'X-Weather', value: 'fixture-later' });
      if (scenario === 'disable' || scenario === 'reenable') {
        await host.packageAction(id, 'disable');
        assert.equal(c.recordFor(id).state, 'disabled');
        if (scenario === 'reenable') {
          registration = { id, signal: deferred() };
          enabled = host.packageAction(id, 'enable').then(() => ({ ok: true }), error => ({ error })); pending.push(enabled);
          await Promise.race([registration.signal.promise, enabled.then(outcome => { throw new Error("enable settled before provider registration", { cause: outcome.error }); })]); registration = undefined;
        }
      }
      fault.release.resolve();
      const outcome = await result; assert.ok(outcome.error, 'the real exposure failure rejects');
      const enableOutcome = enabled ? await enabled : undefined;
      fault = undefined;
      if (scenario === 'failure' || scenario === 'edit') {
        assert.equal(c.recordFor(id).version, '1.0.0'); assert.deepEqual(approved(id), oldApproval);
        assert.deepEqual(prompts(id).map(prompt => prompt.prompt_id), ['old-summary']);
        assert.equal(await readSecret(id, 'weather'), scenario === 'edit' ? 'fixture-later' : 'fixture-old');
        assert.equal(await readSecret(id, 'fresh'), null);
        assert.deepEqual(await call(id, 'notes.list', {}), [{ id: '1', text: 'kept' }]);
        await lifecycle('upgrade', v2, { consent: true, secrets: inputs });
      } else {
        assert.equal(c.recordFor(id).version, '1.1.0', 'the old compensation cannot overwrite the newer state');
        assert.equal(c.recordFor(id).state, scenario === 'disable' ? 'disabled' : 'running', 'newer enable outcome: ' + String(enableOutcome?.error ?? 'ok'));
        assert.equal(await readSecret(id, 'weather'), 'fixture-replacement'); assert.equal(await readSecret(id, 'fresh'), 'fixture-fresh');
        if (scenario === 'disable') await host.packageAction(id, 'enable');
      }
    }
    assert.deepEqual(prompts(id).map(prompt => [prompt.prompt_id, prompt.source.state]), [['new-summary', 'enabled']]);
    assert.equal(c.recordFor(id).install_id, initial.install_id);
    assert.equal(c.recordFor(id).installation_generation, initial.installation_generation);
    assert.equal(await call(id, 'notes.add', { text: 'after' }), true);
    assert.deepEqual(await call(id, 'notes.list', {}), [{ id: '1', text: 'kept' }, { id: '2', text: 'v2:after' }]);
    assert.deepEqual(c.secrets.list(id).map(item => item.name).sort(), ['fresh', 'weather']);
    await host.packageAction(id, 'uninstall', { keepData: false });
    console.log('RAC-2615 controlled Home lifecycle: ' + scenario + ' passed');
  }
} finally {
  fault?.release.resolve(); await Promise.allSettled(pending);
  try { await host.close(); } finally { hook.deregister(); delete globalThis[key]; await rm(home, { recursive: true, force: true }); }
}
