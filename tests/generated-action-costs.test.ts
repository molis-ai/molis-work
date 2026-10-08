import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { capabilityCatalog } from '../apps/local-host/src/plugin-builder/catalog.js';
import { exposeInstalledPlugin, exposedActionId, exposedOperationCosts } from '../apps/local-host/src/plugin-builder/exposed-actions.js';
import { createMcpActionGrant, resolveMcpActionContext } from '../apps/local-host/src/mcp-action-grants.js';

const caller = { actor_id: 'owner', project_id: 'p', audience: 'user' as const, permissions: [] };
const release = (name: string, effects: Record<string, SandboxEffects>) => ({ buildId: name, pluginId: 'io.molis.work.generated.' + name, version: 1,
  design: { title: name, contract: { operations: Object.entries(effects).map(([id, effects]) => ({ id, kind: 'command', effects,
    input: { type: 'null' }, output: { type: 'string' } })) } } } as AgentRelease);
const reference = (value: AgentRelease, operation = 'run') => ({ capability_id: exposedActionId(value, operation), version: value.version, provider_id: 'plugin:' + value.pluginId });

test('public generated costs follow released effects and current transitive providers, including cycles', async t => {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const source = release('source-a', { run: { capabilities: ['external'] }, local: { storage: ['read'] }, network: { networkDomains: ['example.org'] }, missing: { capabilities: ['missing'] } });
  const middle = release('middle-b', { run: { capabilities: [exposedActionId(source, 'run')] } });
  const outer = release('outer-c', { run: { capabilities: [exposedActionId(middle, 'run')] } });
  const cycleA = release('cycle-a', { run: { capabilities: ['generated.cycle-b.run'] } });
  const cycleB = release('cycle-b', { run: { capabilities: ['generated.cycle-a.run', 'external'] } });
  const releases = [outer, middle, source, cycleA, cycleB]; // Deliberately opposite the dependency order.
  for (const value of releases) t.after(exposeInstalledPlugin(actions, value, async () => ({ status: 200, body: { value: 'ok' } })).dispose);
  const base = await capabilityCatalog(actions, 'owner');
  const external = { id: 'external', provider_id: 'one', version: 1, offered: true, installed: true, execution: { cost: 'metered' as const } };
  const cost = (catalog: Parameters<typeof exposedOperationCosts>[1]) => exposedOperationCosts(releases, catalog);
  let result = cost([...base, external]);
  assert.deepEqual([...result.get(source.pluginId)!], [['run', 'metered'], ['local', 'none'], ['network', 'unknown'], ['missing', 'unknown']]);
  for (const value of [middle, outer, cycleA, cycleB]) assert.equal(result.get(value.pluginId)!.get('run'), 'metered');
  result = cost([...base, { ...external, execution: { cost: 'none' } }]);
  for (const value of [source, middle, outer]) assert.equal(result.get(value.pluginId)!.get('run'), 'none', 'no cached generated unknown or fee');
  for (const value of [cycleA, cycleB]) assert.equal(result.get(value.pluginId)!.get('run'), 'unknown', 'cycles cannot prove a free execution');
  assert.equal(cost([...base, { ...external, installed: false }]).get(outer.pluginId)!.get('run'), 'unknown');
  assert.equal(cost([...base, { ...external, execution: {} }]).get(outer.pluginId)!.get('run'), 'unknown');
  assert.equal(cost([...base, external, { ...external, provider_id: 'new', version: 2, execution: { cost: 'none' } }]).get(outer.pluginId)!.get('run'), 'none');
  assert.equal(cost([...base, external, { ...external, version: 3, offered: false, execution: { cost: 'none' } }]).get(outer.pluginId)!.get('run'), 'metered', 'unoffered versions cannot set execution facts');
});

test('cost refresh revokes only the changed operation; repeated inspection and disposal cannot resurrect registrations', async t => {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' }, value = release('changes', { run: {}, local: {} });
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(); let calls = 0;
  const exposed = exposeInstalledPlugin(actions, value, async () => { if (++calls === 2) entered.resolve(); await finish.promise; return { status: 200, body: { value: 'ok' } }; });
  t.after(() => { finish.resolve(); exposed.dispose(); });
  // The stand-in returns 200 before the registration is replaced, so the command has committed: it is told apart from a
  // plain failure (provider_changed) so that nobody repeats it. Only the operation whose registration changed is affected.
  const changed = assert.rejects(service.invoke(caller, reference(value), null), { code: 'actions.outcome_unknown' });
  const kept = service.invoke(caller, reference(value, 'local'), null);
  await entered.promise;
  assert.equal(exposed.refresh(new Map([['run', 'none'], ['local', 'none']])), false);
  assert.equal(exposed.refresh(new Map([['run', 'metered'], ['local', 'none']])), true);
  finish.resolve(); await changed; assert.equal(await kept, 'ok');
  for (const audience of ['user', 'agent', 'mcp', 'workflow', 'plugin'] as const) {
    assert.equal(service.discover({ ...caller, audience }).find(view => view.capability_id === reference(value).capability_id)!.action.execution?.cost, 'metered');
  }
  exposed.dispose();
  assert.equal(exposed.refresh(new Map([['run', 'none']])), false);
  assert.deepEqual(service.discover(caller), []);
});

test('cost refresh preserves exact MCP grants; a new release still requires its own version grant', async t => {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' }, value = release('grants', { run: {} });
  const call = async () => ({ status: 200, body: { value: 'ok' } });
  const exposed = exposeInstalledPlugin(actions, value, call); t.after(exposed.dispose);
  const client = { ...caller, actor_id: 'external', audience: 'mcp' as const };
  const grant = createMcpActionGrant(client.actor_id, 'p', service.inspect(client)[0]!, true);
  const preference = { version: 1 as const, action_grants: [grant], overrides: {} };
  exposed.refresh(new Map([['run', 'metered']]));
  const allowed = resolveMcpActionContext(client, service.inspect(client), preference);
  assert.deepEqual(allowed.allowed_actions, [reference(value)]);
  assert.equal(await service.invoke(allowed, reference(value), null), 'ok');
  exposed.dispose();
  const next = { ...value, version: 2 }, upgraded = exposeInstalledPlugin(actions, next, call); t.after(upgraded.dispose);
  assert.deepEqual(resolveMcpActionContext(client, service.inspect(client), preference).allowed_actions, []);
  await assert.rejects(service.invoke(resolveMcpActionContext(client, service.inspect(client), preference), reference(next), null));
});
