import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { exposeInstalledPlugin, exposedActionId, exposedOperationCosts } from '@molis-ai/molis-work-app-local-host';

const caller = { actor_id: 'owner', project_id: 'p', audience: 'user' as const, permissions: [] };
const release = (name: string, effects: Record<string, SandboxEffects>) => ({ buildId: name, pluginId: 'io.molis.work.generated.' + name, version: 1,
  design: { title: name, contract: { operations: Object.entries(effects).map(([id, effects]) => ({ id, kind: 'command', effects,
    input: { type: 'null' }, output: { type: 'string' } })) } } } as AgentRelease);
const reference = (value: AgentRelease, operation = 'run') => ({ capability_id: exposedActionId(value, operation), version: value.version, provider_id: 'plugin:' + value.pluginId });

test('BL-491 RAC-2633 an operation that spends a person model or image account is metered, whatever else it reaches; reading the settings or the connections is not', () => {
  const value = release('spends', { ask: { model: ['invoke'] }, draw: { imageGeneration: ['generate'], networkDomains: ['images.example.com'] }, choose: { modelSettings: ['read', 'save'] },
    look: { model: ['read'], imageGeneration: ['read'] }, both: { storage: ['read'], model: ['invoke'], networkDomains: ['api.example.com'] } });
  const costs = exposedOperationCosts([value], []).get(value.pluginId)!;
  assert.deepEqual([...costs], [['ask', 'metered'], ['draw', 'metered'], ['choose', 'none'], ['look', 'none'], ['both', 'metered']]);
});

test('BL-491 RAC-2628 the registered action of an installed operation asks its caller for the model and image permissions its effects derive, and refuses a caller without them', async t => {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const value = release('scoped', { ask: { model: ['invoke'] }, draw: { imageGeneration: ['read', 'bind', 'generate'], networkDomains: ['images.example.com'] }, plain: { storage: ['read'] } });
  let reached = 0;
  const exposed = exposeInstalledPlugin(actions, value, async () => { reached += 1; return { status: 200, body: { value: 'ok' } }; }, undefined, { install_id: 'install-scoped', installation_generation: '1' });
  t.after(exposed.dispose);
  const asked = new Map(service.discover({ ...caller, permissions: ['model:invoke', 'image-api:read', 'image-api:write', 'image-api:generate'] }).map(view => [view.action.local_id, view.action.permissions]));
  assert.deepEqual(asked.get('ask'), ['model:invoke']);
  assert.deepEqual(asked.get('draw'), ['image-api:read', 'image-api:write', 'image-api:generate', 'model:invoke']);
  assert.deepEqual(asked.get('plain'), [], 'an operation with no such effect asks for nothing');
  for (const operation of ['ask', 'draw']) {
    await assert.rejects(service.invoke(caller, reference(value, operation), null), (error: { code?: string }) => error.code === 'actions.forbidden', `${operation}: a caller without the permissions is refused`);
  }
  assert.equal(reached, 0, 'the plugin code was never reached');
  const holder = { ...caller, permissions: ['model:invoke', 'image-api:read', 'image-api:write', 'image-api:generate'] };
  for (const operation of ['ask', 'draw', 'plain']) assert.equal(await service.invoke(holder, reference(value, operation), null), 'ok');
  assert.equal(await service.invoke(caller, reference(value, 'plain'), null), 'ok');
  assert.equal(reached, 4);
});
