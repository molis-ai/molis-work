import { syncRoundResponse } from './sync-round.js';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { createProjectApprovalSyncRegistration, LocalProjectDatabase, projectApprovalSyncSelection } from '@molis-ai/molis-work-app-local-host';
import { GoalProjectApplication } from './goal-application.js';
import { runtimeGoalSync, goalSyncSelection as selection } from './runtime-goal-sync.js';
import { PersonalSync, syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { ensureStorageSpace, personalStorageSpace, mapReplicaSequences } from '@molis-ai/molis-work-storage';
import type { SyncMutation, SyncEvent } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { SpaceSyncPolicy } from '@molis-ai/molis-work-contracts/modules/sync-replication';

export const approvalSelections = [projectApprovalSyncSelection, selection];
const sequenceFields = ['journal_seq', 'based_on_cursor', 'support_valid_after_seq', 'observed_event_cursor', 'goal_event_cursor', 'event_list_next_cursor', 'event_cursor', 'next_cursor', 'base_event_cursor'];
export const comparable = (value: unknown) => mapReplicaSequences(value, sequenceFields, () => 0);

export async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'goal-sync-'));
  const space = personalStorageSpace('http://127.0.0.1:8787', 'work', 'alice');
  const homes = ['a', 'b'].map(id => join(root, id));
  homes.forEach(home => ensureStorageSpace(home, space));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: homes[0] }, c => c.createProject({ display_name: '跨设备 Goals', actor_id: 'alice' }));
  const initialStore=new LocalProjectDatabase(project.database_path);try{new GoalProjectApplication(initialStore).initializeBoard({project_id:project.project_id,actor_id:'alice',idempotency_key:'fixture-board'});}finally{initialStore.close();}
  let active = true, online = true, drop = false, deferGoalsDelivery = false;
  const check = () => { if (!active) throw new Error('host.test_revoked'); };
  const targetProject=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},c=>c.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},check));
  const runtimes=homes.map(home=>runtimeGoalSync(home,space.spaceId,'alice',check));
  t.after(async()=>{try{await Promise.all(runtimes.map(runtime=>runtime.close()));}finally{rmSync(root,{recursive:true,force:true});}});
  const registrations=runtimes.map(runtime=>runtime.registration);
  await Promise.all(registrations.map(registration=>registration.refresh()));
  assert.deepEqual(registrations[1]!.withReplica(replica=>replica.counts()),{pending:0,conflicts:0},'automatic empty board initialization is not a local user edit');
  let policy: SpaceSyncPolicy = { spaceId: space.spaceId, revision: 0, selections: [] };
  const journal = new Map<string, SyncEvent[]>();
  const stream = (namespace: string) => {
    const existing = journal.get(namespace);
    if (existing) return existing;
    const events: SyncEvent[] = [];
    journal.set(namespace, events);
    return events;
  };
  const events = stream(syncNamespace(selection));
  const approvalEvents = stream(syncNamespace(projectApprovalSyncSelection));
  const transport: typeof fetch = async (input, init) => {
    if (!online) throw new Error('host.test_offline');
    const url = new URL(String(input));
    if(url.pathname==='/v1/round')return syncRoundResponse(policy, selected=>stream(syncNamespace(selected)).at(-1)?.revision??0);
    if(url.pathname==='/v1/quota')return Response.json({limitBytes:100000000,usedBytes:0});
    if (url.pathname === '/v1/policy') {
      if (init?.method === 'PUT') {
        const next = JSON.parse(String(init.body)) as SpaceSyncPolicy;
        if (next.revision !== policy.revision) return Response.json({}, { status: 409 });
        policy = { ...next, revision: next.revision + 1 };
      }
      return Response.json(policy);
    }
    if(url.pathname==='/v1/history/pin'){
      assert.equal(init?.method,'POST');const pin=JSON.parse(String(init.body));
      assert.equal(pin.namespace,syncNamespace(selection));assert.equal(pin.policyRevision,policy.revision);
      assert.equal(events.filter(e=>e.key===pin.key).at(-1)?.revision,pin.revision);
      return Response.json({accepted:true,revision:pin.revision});
    }
    if (init?.method === 'POST') {
      assert.equal(url.pathname,'/v1/changes');
      const { namespace, mutation: m } = JSON.parse(String(init.body)) as { namespace: string; mutation: SyncMutation };
      const events = stream(namespace);
      if (!events.some(e => e.operationId === m.operationId)) {
        if ((events.filter(e => e.key === m.key).at(-1)?.revision ?? 0) !== m.base) return Response.json({}, { status: 409 });
        events.push({ ...m, revision: events.length + 1 });
      }
      if (drop) { drop = false; throw new Error('host.test_receipt_lost'); }
      return Response.json({ accepted: true,revision:events.find(e=>e.operationId===m.operationId)!.revision });
    }
    const namespace = url.searchParams.get('namespace') ?? '';
    const rows = deferGoalsDelivery && namespace === syncNamespace(selection) ? []
      : stream(namespace).filter(e => e.revision > Number(url.searchParams.get('after')));
    return Response.json({ events: rows.slice(0, 2), more: rows.length > 2 });
  };
  const peers = homes.map((home, i) => {
    const runtime = runtimes[i]!;
    const approvals = createProjectApprovalSyncRegistration(home, space.spaceId, check, runtime.withCatalog, runtime.readCatalog, () => client.policy());
    const client: PersonalSync = new PersonalSync({ home, spaceId: space.spaceId, endpoint: 'http://127.0.0.1:8788',
      authority: { signal: new AbortController().signal, assertCurrent: check, accessToken: async () => 'test-only' },
      registrations: [approvals, registrations[i]!], fetch: transport });
    return { client, approvals };
  });
  const clients = peers.map(peer => peer.client);
  runtimes.forEach((runtime,index)=>runtime.setPolicy(()=>clients[index]!.policy()));
  const paths = [project.database_path, targetProject.database_path];
  const edit = <T>(i: number, operation: (app: GoalProjectApplication, store: LocalProjectDatabase) => T): T => {
    const store = new LocalProjectDatabase(paths[i]!);
    try { return operation(new GoalProjectApplication(store), store); } finally { store.close(); }
  };
  const run = async () => {
    await clients[0]!.run(); await clients[1]!.run();
    for (const c of clients) assert.equal(c.status().error, null,JSON.stringify(c.status()));
    await runtimes[1]!.withCatalog({ homeDirectory: homes[1] }, c => { paths[1] = c.listProjects().find(p => p.project_id === project.project_id)!.database_path; });
  };
  const enable = async (uploadOnly = false) => {
    await clients[0]!.save({ ...clients[0]!.policy(), selections: approvalSelections });
    deferGoalsDelivery = uploadOnly;
    try { await run(); } finally { deferGoalsDelivery = false; }
  };
  const replica = <T>(i: number, fn: (r: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncReplicaAdapter) => T) => registrations[i]!.withReplica(fn);
  const approvalReplica = <T>(i: number, fn: (r: import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncReplicaAdapter) => T) => peers[i]!.approvals.withReplica(fn);
  t.after(() => { clients.forEach(c => c.close()); });
  return { homes, space, project, host: runtimes[0]!.host, clients, events, approvalEvents, edit, run, enable, replica, approvalReplica,
    offline: () => { online = false; }, online: () => { online = true; }, drop: () => { drop = true; }, revoke: () => { active = false; } };
}

export function work(app: GoalProjectApplication, project: string, id = 'goal-main') {
  const base = { project_id: project, goal_id: id, actor_id: 'runtime-1', actor_kind: 'runtime' as const };
  app.goalEvents.createIntent({ ...base, title: '可移植的目标', outcome: '设备上可检查', idempotency_key: `${id}:intent` });
  app.goalEvents.configure({ ...base, expected_version: 0, idempotency_key: `${id}:config`, types: [{ type_id: 'delivery', version: 1, name: '交付', purpose: '结果', semantic_family: 'delivery', source: { kind: 'runtime', label: 'Goal' }, fields: [{ field_id: 'piece', name: '结果', purpose: '结果', format: 'text', required: true }] }] });
  // The requirement and the person's acceptance are the platform's (contract-design §10); Goals keeps the work and the decisions.
  app.setRequirements(project, id, [{ requirement_id: `${id}:requirement`, statement: '检查得到结果', human_decision_required: true }]);
  app.goalEvents.report({ ...base, idempotency_key: `${id}:report`, events: [{ type_id: 'delivery', type_version: 1, title: '已交付', fields: { piece: '结果' } }] });
  app.decide(project, id, [`${id}:requirement`]);
  app.goalEvents.recordTrustedDecision({ project_id: project, goal_id: id, idempotency_key: `${id}:decision`, authority: { actor_id: 'alice', actor_kind: 'user', authority_source: 'web', conversation_ref: `web:${project}`, message_ref: `decision:${id}` }, conclusion: '确认交付', effects: [{ kind: 'authorize_action', action: 'complete' }], scope: { action: 'complete' } });
  const ready = app.goalEvents.readState(project, id);
  const close = app.goalEvents.submitClosure({ ...base, idempotency_key: `${id}:close`, kind: 'complete', result: '设备上已验证结果', reason: '验收完成', expected_config_version: ready.config.version, expected_agreement_version: ready.agreement.version });
  assert.equal(close.completion_applied, true, JSON.stringify(close.unmet_reasons));
}
