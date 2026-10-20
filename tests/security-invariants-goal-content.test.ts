import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalGoalRegistration, LocalProjectDatabase, GoalProjectApplication } from '@molis-ai/molis-work-app-local-host';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import type { SyncBlobReference, ProjectReplicaRows, ProjectReplicaRow } from '@molis-ai/molis-work-contracts/platform/sync-transport';

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'molis-goal-content-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(home, space); let active = true;
  const selection = { plugin_id: 'io.molis.work.goals', publisher_id: 'molis', publisher_signature: 'official-goals-binding', collection_id: 'project_goals', schema_version: 1 };
  const codec = createPersonalGoalRegistration(home, space.spaceId, 'alice', () => { if (!active) throw new Error('REVOKED'); }, withMolisWorkProjectCatalog, selection).content!;
  const key = JSON.stringify(['project', 'project_goals', 'project']);
  const value = { format: 1, spaceId: space.spaceId, project: { id: 'project', title: '目标' }, facts: { goals: { text: '中文🙂'.repeat(300000) } }, journal: { events: [] } };
  const encoded = codec.encode(key, value);
  const read = async (ref: SyncBlobReference) => { const blob = encoded.blobs.find(b => b.digest === ref.digest && b.size === ref.size); assert.ok(blob); return blob.bytes; };
  return { codec, key, value, encoded, read, revoke: () => { active = false; } };
}

test('S-31 PCSYNC-11 large Goal content preserves Unicode and exact bytes with small D1 metadata', async t => {
  const f = fixture(t);
  assert.ok(f.encoded.blobs.length > 1); assert.ok(Buffer.byteLength(JSON.stringify(f.encoded.value)) < 4096);
  assert.deepEqual(await f.codec.decode(f.key, f.encoded.value, f.read), f.value);
  assert.deepEqual(f.codec.encode(f.key, f.value), f.encoded, 'retry uses stable parts');
  const small = { ...f.value, facts: {} }, inline = f.codec.encode(f.key, small);
  assert.equal(inline.value, small); assert.deepEqual(inline.blobs, []);
  assert.equal(await f.codec.decode(f.key, small, async () => { throw new Error('unexpected read'); }), small);
  await assert.rejects(() => f.codec.decode(f.key, f.value, f.read), { code: 'host.replica_limit' }, 'large values cannot bypass the content manifest');
});

test('S-31 PCSYNC-01 malformed or foreign Goal manifests are refused before any byte read', async t => {
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

test('S-31 PCSYNC-06/12 Goal decode rejects damaged, reordered, relabelled and late content', async t => {
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

test('S-51 PCSYNC-01/14 a complete Goal owner unit is validated before creating any target project',async t=>{
  const root=mkdtempSync(join(tmpdir(),'goal-prepare-owner-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const homes=[join(root,'source'),join(root,'target')],space=personalStorageSpace('https://auth.example.test','work','alice');
  homes.forEach(home=>ensureStorageSpace(home,space));let active=true;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const selection={plugin_id:'io.molis.work.goals',publisher_id:'molis',publisher_signature:'official-goals-binding',collection_id:'project_goals',schema_version:1};
  const project=await withMolisWorkProjectCatalog({homeDirectory:homes[0]},catalog=>catalog.createProject({display_name:'Actual Goal',actor_id:'alice'}));
  const database=new LocalProjectDatabase(project.database_path);
  try{new GoalProjectApplication(database).goalEvents.createIntent({project_id:project.project_id,goal_id:'goal',title:'Portable Goal',actor_id:'runtime:fixture',actor_kind:'runtime',idempotency_key:'intent'});}finally{database.close();}
  const [source,target]=homes.map(home=>createPersonalGoalRegistration(home,space.spaceId,'alice',authorize,withMolisWorkProjectCatalog,selection));
  await source!.refresh();const next=source!.withReplica(replica=>replica.next());assert.ok(next);
  const event={...next,revision:1};
  type Unit={facts:Record<string,ProjectReplicaRows>;journal:{events:ProjectReplicaRow[];receipts:ProjectReplicaRow[]}};
  const original=next.value as Unit;assert.ok(original.journal.events.length>0);
  const mutations:((wire:Unit)=>void)[]=[
    wire=>{wire.facts.goals!.goals![0]!.project_id='foreign';},
    wire=>{wire.facts.goals!.goals![0]!.undeclared='not an owner column';},
    wire=>{wire.journal.events.push({...wire.journal.events[0]!});},
    wire=>{wire.journal.events[0]!.payload_json=JSON.stringify({event_cursor:'@event:missing'});},
    wire=>{wire.journal.events[0]!.type='unrelated.owner.event';},
  ];
  for(const mutate of mutations){
    const value=structuredClone(original);mutate(value);await assert.rejects(()=>target!.prepare({...event,value}));
    assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects()),[],'bad content creates neither a project nor an empty business database');
  }
  active=false;await assert.rejects(()=>target!.prepare(event),/REVOKED/);active=true;
  assert.deepEqual(await withMolisWorkProjectCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects()),[]);
  await target!.prepare(event);await target!.refresh();target!.withReplica(replica=>replica.receive(event));
  const received=await withMolisWorkProjectCatalog({homeDirectory:homes[1]},catalog=>catalog.listProjects());assert.equal(received.length,1);
  const restored=target!.withReplica(replica=>{assert.deepEqual(replica.conflicts(),[]);return replica.counts();});
  assert.deepEqual(restored,{pending:0,conflicts:0});
});
