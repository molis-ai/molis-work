import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { currentPluginAction } from '@molis-ai/molis-work-plugin-runtime';
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

test('BL-491 RAC-2628 the Runtime scope of an installed operation names the model and image permissions its effects derive, while the registered action asks its caller for none', async t => {
  const service = new ActionService(), actions = { registry: service, client: service, project_id: 'p' };
  const value = release('scoped', { ask: { model: ['invoke'] }, draw: { imageGeneration: ['read', 'bind', 'generate'], networkDomains: ['images.example.com'] }, plain: { storage: ['read'] } });
  const seen = new Map<string, { permissions: readonly string[]; caller: readonly string[]; scheduling?: string; operation: string }>();
  const exposed = exposeInstalledPlugin(actions, value, async (_pluginId, operation) => {
    const scope = currentPluginAction();
    if (scope) seen.set(operation, { permissions: scope.definition.action.permissions, caller: scope.caller.permissions, scheduling: scope.definition.action.scheduling, operation: scope.definition.operation });
    return { status: 200, body: { value: 'ok' } };
  }, undefined, { install_id: 'install-scoped', installation_generation: '1' });
  t.after(exposed.dispose);
  for (const view of service.discover(caller)) assert.deepEqual(view.action.permissions, [], `${view.action.local_id}: no caller has to hold what the plugin own code spends`);
  for (const operation of ['ask', 'draw', 'plain']) assert.equal(await service.invoke(caller, reference(value, operation), null), 'ok');
  assert.deepEqual(seen.get('ask'), { permissions: ['model:invoke'], caller: ['model:invoke'], scheduling: 'concurrent', operation: 'command' });
  assert.deepEqual(seen.get('draw')!.permissions, ['image-api:read', 'image-api:write', 'image-api:generate', 'model:invoke']);
  assert.deepEqual(seen.get('plain'), { permissions: [], caller: [], scheduling: 'concurrent', operation: 'command' }, 'an operation with no such effect is unchanged');
});
