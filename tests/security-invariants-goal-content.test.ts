import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { GoalProjectApplication } from './fixtures/goal-application.js';
import { runtimeGoalSync, goalWire } from './fixtures/runtime-goal-sync.js';
import { createProjectGoalContent } from '@molis-ai/molis-work-app-local-host';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import type { SyncBlobReference, ProjectReplicaRows, ProjectReplicaRow } from '@molis-ai/molis-work-contracts/platform/sync-transport';

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'molis-goal-content-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(home, space); let active = true;
  const codec = createProjectGoalContent(space.spaceId, key => { const value=JSON.parse(key);if(!Array.isArray(value)||value.length!==3||value[1]!=='project_goals'||value[0]!==value[2])throw new Error('INVALID_KEY');return value[0]; }, () => { if (!active) throw new Error('REVOKED'); });
  const key = JSON.stringify(['project', 'project_goals', 'project']);
  const value = { format: 1, spaceId: space.spaceId, project: { id: 'project', title: '目标' }, facts: { goals: { text: '中文🙂'.repeat(300000) } }, journal: { events: [] } };
  const encoded = codec.encode(key, value);
  const read = async (ref: SyncBlobReference) => { const blob = encoded.blobs.find(b => b.digest === ref.digest && b.size === ref.size); assert.ok(blob); return blob.bytes; };
  return { codec, key, value, encoded, read, revoke: () => { active = false; } };
}

test('S-126 PCSYNC-11 large Goal content preserves Unicode and exact bytes with small D1 metadata', async t => {
  const f = fixture(t);
  assert.ok(f.encoded.blobs.length > 1); assert.ok(Buffer.byteLength(JSON.stringify(f.encoded.value)) < 4096);
  assert.ok(JSON.stringify(f.encoded.value).startsWith('{"format":2,"spaceId":'), 'the chunked encoding says 2, first on the wire');
  assert.deepEqual(await f.codec.decode(f.key, f.encoded.value, f.read), f.value);
  assert.deepEqual(f.codec.encode(f.key, f.value), f.encoded, 'retry uses stable parts');
  const small = { ...f.value, facts: {} }, inline = f.codec.encode(f.key, small);
  assert.equal(inline.value, small); assert.deepEqual(inline.blobs, []);
  assert.equal(await f.codec.decode(f.key, small, async () => { throw new Error('unexpected read'); }), small);
  await assert.rejects(() => f.codec.decode(f.key, f.value, f.read), { code: 'host.replica_limit' }, 'large values cannot bypass the content manifest');
});

test('S-126 PCSYNC-01 malformed or foreign Goal manifests are refused before any byte read', async t => {
  const f = fixture(t);
  type Wire = { format: number; spaceId: string; project: { id: string; title: string }; content: { size: number; digest: string; parts: SyncBlobReference[] } };
  const edits: Array<(wire: Wire) => void> = [
    w => { w.spaceId = 'foreign'; }, w => { w.project.id = 'foreign'; }, w => { w.format = 3; },
    w => { w.content.size = 100000001; }, w => { w.content.parts.pop(); },
    w => { w.content.parts.at(-1)!.digest = '../../file'; }, w => { w.content.parts.at(-1)!.size++; },
  ];
  for (const edit of edits) {
    const wire = structuredClone(f.encoded.value) as Wire; edit(wire); let reads = 0;
    await assert.rejects(() => f.codec.decode(f.key, wire, async ref => { reads++; return f.read(ref); }));
    assert.equal(reads, 0, 'even a bad last part is rejected before reading the first');
  }
  await assert.rejects(() => f.codec.decode(JSON.stringify(['project', 'artifact', 'project']), f.encoded.value, f.read));
});

test('S-126 PCSYNC-06/12 Goal decode rejects damaged, reordered, relabelled and late content', async t => {
  const f = fixture(t);
  await assert.rejects(() => f.codec.decode(f.key, f.encoded.value, async ref => { const bytes = Buffer.from(await f.read(ref)); bytes[0] ^= 1; return bytes; }));
  const wire = structuredClone(f.encoded.value) as { content: { parts: SyncBlobReference[] }; project: { title: string } };
  [wire.content.parts[0], wire.content.parts[1]] = [wire.content.parts[1]!, wire.content.parts[0]!];
  await assert.rejects(() => f.codec.decode(f.key, wire, f.read), 'whole body digest rejects reordered individually valid parts');
  const relabelled = structuredClone(f.encoded.value) as { project: { title: string } }; relabelled.project.title = '另一个标题';
  await assert.rejects(() => f.codec.decode(f.key, relabelled, f.read));
  await assert.rejects(() => f.codec.decode(f.key, f.encoded.value, async ref => { const bytes = await f.read(ref); f.revoke(); return bytes; }), /REVOKED/);
  assert.throws(() => f.codec.encode(f.key, f.value), /REVOKED/);
});

test('S-115 PCSYNC-01/14 a complete Goal owner unit is validated before creating any target project',async t=>{
  const root=mkdtempSync(join(tmpdir(),'goal-prepare-owner-'));
  const homes=[join(root,'source'),join(root,'target')],space=personalStorageSpace('https://auth.example.test','work','alice');
  homes.forEach(home=>ensureStorageSpace(home,space));let active=true;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Actual Goal',actor_id:'alice'}));
  const database=new LocalProjectDatabase(project.database_path);
  try{const app=new GoalProjectApplication(database);app.initializeBoard({project_id:project.project_id,actor_id:'alice',idempotency_key:'fixture-board'});app.goalEvents.createIntent({project_id:project.project_id,goal_id:'goal',title:'Portable Goal',actor_id:'runtime:fixture',actor_kind:'runtime',idempotency_key:'intent'});}finally{database.close();}
  const runtimes=homes.map(home=>runtimeGoalSync(home,space.spaceId,'alice',authorize));t.after(async()=>{try{for(const runtime of runtimes)await runtime.close();}finally{rmSync(root,{recursive:true,force:true});}});
  const [source,target]=runtimes.map(runtime=>runtime.registration);
  await source!.refresh();await target!.refresh();assert.equal(target!.available!(),false);
  const catalogProjects=()=>runtimes[1]!.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects());
  assert.deepEqual(await catalogProjects(),[]);
  const next=source!.withReplica(replica=>replica.next());assert.ok(next);
  const event={...next,revision:1};
  type Unit={facts:Record<string,ProjectReplicaRows>;journal:{events:ProjectReplicaRow[];receipts:ProjectReplicaRow[]}};
  const original=goalWire(next.value) as Unit;assert.ok(original.journal.events.length>0);
  const mutations:((wire:Unit)=>void)[]=[
    wire=>{wire.facts.goals!.goals![0]!.project_id='foreign';},
    wire=>{wire.facts.goals!.goals![0]!.undeclared='not an owner column';},
    wire=>{wire.journal.events.push({...wire.journal.events[0]!});},
    wire=>{wire.journal.events[0]!.payload_json=JSON.stringify({event_cursor:'@event:missing'});},
    wire=>{wire.journal.events[0]!.type='unrelated.owner.event';},
  ];
  for(const mutate of mutations){
    const value=structuredClone(next.value);mutate(goalWire(value) as Unit);await assert.rejects(()=>target!.prepare({...event,value}));
    assert.deepEqual(await runtimes[1]!.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects()),[],'bad content creates neither a project nor an empty business database');
  }
  active=false;await assert.rejects(()=>target!.prepare(event),/REVOKED/);active=true;
  assert.deepEqual(await runtimes[1]!.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects()),[]);
  await assert.rejects(()=>target!.prepare(event),/SYNC_OWNER_NOT_INSTALLED/,'even valid Goal content cannot install a project owner');
  await runtimes[1]!.withCatalog({homeDirectory:homes[1]},catalog=>catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},authorize));
  await target!.refresh();
  for(const [index,mutate] of mutations.entries()){
    const value=structuredClone(next.value);mutate(goalWire(value) as Unit);
    target!.withReplica(replica=>replica.receive({...event,operationId:'invalid-'+index,revision:index+1,value}));
    assert.equal(target!.withReplica(replica=>replica.conflicts().length),1);
    assert.throws(()=>target!.withReplica(replica=>replica.resolve(event.key,'remote')));
    const database=new LocalProjectDatabase((await catalogProjects())[0]!.database_path);try{assert.throws(()=>new GoalProjectApplication(database).goalQueries.getGoal(project.project_id,'goal'));}finally{database.close();}
  }
  active=false;assert.throws(()=>target!.withReplica(replica=>replica.receive({...event,revision:10})),/REVOKED/);active=true;
  await target!.prepare(event);target!.withReplica(replica=>{replica.receive({...event,revision:10});if(replica.conflicts().length)replica.resolve(event.key,'remote');});
  const received=await runtimes[1]!.withCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects());assert.equal(received.length,1);
  const restored=target!.withReplica(replica=>{assert.deepEqual(replica.conflicts(),[]);return replica.counts();});
  assert.deepEqual(restored,{pending:0,conflicts:0});
});
