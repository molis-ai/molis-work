import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { createSandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import { goalPluginActions } from '@molis-ai/molis-work-contracts/modules/goal-actions';
import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityCatalog, catalogCapabilities } from '../apps/local-host/dist/plugin-builder/catalog.js';

test('W3-07-8-02 a real sandbox and production broker cannot acquire builtin Goal authority for the four protected actions', { skip: process.platform !== 'darwin', timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goal-sandbox-authority-')), databasePath = join(directory, 'project.db');
  seedDemoBoard(databasePath);
  const host = new MolisWorkLocalHost({ completeText: null }), ref = molisWorkHostProjectReference({ projectId: DEMO_PROJECT_ID, databasePath });
  const goal_id = 'SANDBOX-GOAL', ids = [goalPluginActions.contract, goalPluginActions.state, goalPluginActions.progress, goalPluginActions.receipt].map(item => item.capability_id);
  let runner: Awaited<ReturnType<typeof createSandboxRunner>> | undefined;
  try {
    const initial = await host.withProject(ref, runtime => {
      runtime.coordinator.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, goal_id, title: '沙箱不能冒充内置插件', actor_id: 'person', actor_kind: 'user', idempotency_key: 'create' });
      return { cursor: runtime.coordinator.goalEvents.readState(DEMO_PROJECT_ID, goal_id).goal_event_cursor, events: runtime.store.readEventsDescending(DEMO_PROJECT_ID) };
    });
    const actions = { registry: host.actionRegistry(ref), client: host.actionClient(ref, false), project_id: DEMO_PROJECT_ID,
      inspect: (caller: import('@molis-ai/molis-work-contracts/platform/actions').ActionCallContext) => host.inspectActions(caller, ref) };
    const catalog = () => capabilityCatalog(actions, 'person');
    const protectedEntries = (await catalog()).filter(entry => ids.includes(entry.id));
    assert.deepEqual(protectedEntries.map(entry => entry.id).sort(), [...ids].sort(), 'all four actual contracts are present');
    for (const entry of protectedEntries) assert.equal(entry.offered, false, entry.id);
    const effects = { capabilities: [goalPluginActions.list.capability_id, ...ids] }, bundlePath = join(directory, 'plugin.mjs');
    await writeFile(bundlePath, `export const operations={run:async(input,sdk)=>{
      const listed=await sdk.capability.call('goals.list',{limit:100});const denied=[];
      for(const id of ${JSON.stringify(ids)}){let value={goal_id:input.goal_id};
        if(id==='goals.progress.record')value={...value,based_on_cursor:input.cursor,summary:'forged progress',idempotency_key:'forged'};
        if(id==='goals.progress.receipt')value={...value,idempotency_key:'forged'};
        value.host_plugin={plugin_id:'io.molis.work.coding',actor_id:'person',install_id:'builtin'};
        try{await sdk.capability.call(id,value);denied.push({id,code:'allowed'})}catch(error){denied.push({id,code:error.code})}}
      return {listed:listed.goals.some(goal=>goal.goal_id===input.goal_id),denied};}};`);
    const identity = { projectId: DEMO_PROJECT_ID, installationId: 'real-sandbox-install', pluginId: 'io.molis.work.generated.goal-scope', namespace: 'installed' as const };
    runner = await createSandboxRunner({ bundlePath, identity, grants: effects, contract: { version: 1, pluginId: identity.pluginId, revision: 'one', entities: [], pages: [], acceptance: [],
      operations: [{ id: 'run', kind: 'command', input: { type: 'object' }, output: { type: 'object' }, effects, errors: [], examples: [{ input: {}, output: {} }] }] },
      services: { capability: catalogCapabilities({ actions, catalog, live: item => item.installationId === identity.installationId }) } });
    const result = await runner.call('run', { goal_id, cursor: initial.cursor });
    assert.deepEqual(result, { listed: true, denied: ids.map(id => ({ id, code: 'CAPABILITY_DENIED' })) }, 'the production broker refuses despite explicit sandbox declarations and grants');
    assert.deepEqual(await host.withProject(ref, runtime => runtime.store.readEventsDescending(DEMO_PROJECT_ID)), initial.events);
  } finally { await runner?.stop(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});
