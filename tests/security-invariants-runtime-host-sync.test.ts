import type {PluginDefinition} from '@molis-ai/molis-work-contracts/platform/plugin';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureStorageSpace, personalStorageSpace } from '@molis-ai/molis-work-storage';
import { MolisWorkLocalHost, discoverRuntimeSyncCollections } from '@molis-ai/molis-work-app-local-host';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { createPersonalNotesSample } from '../examples/personal-sync-plugin/plugin.js';

async function hosts(t: import('node:test').TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'runtime-sync-host-')), space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  const homes = ['a', 'b'].map(name => join(root, name)); homes.forEach(home => ensureStorageSpace(home, space));
  const samples = homes.map(() => createPersonalNotesSample());
  const owners = homes.map((home, i) => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [samples[i]!.definition] } }));
  t.after(async () => { try { for (const host of owners) await host.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  let active = true; const authorize = () => { if (!active) throw new Error('ACCOUNT_REVOKED'); };
  const discover = async (i: number) => (await discoverRuntimeSyncCollections(homes[i]!, space.spaceId, owners[i]!, withMolisWorkProjectCatalog, authorize)).find(row => row.selection.plugin_id === samples[i]!.definition.manifest.plugin_id)!;
  return { space, homes, owners, samples, discover, revoke() { active = false; } };
}

test('S-41 PCSYNC-01/15/25 actual Host discovers independent SDK data and namespaces bytes without inventing business owners', async t => {
  const f = await hosts(t), a = await f.discover(0), b = await f.discover(1);
  assert.ok(a); assert.ok(b); const bytes = Buffer.from([0, 255, 128, 13, 10]);
  f.samples[0]!.edit('same-key', { text: 'portable original', attachment: bytes.toString('base64') });
  const mutation = a.withReplica(replica => replica.next())!;
  assert.deepEqual(JSON.parse(mutation.key), [null, 'same-key']);
  assert.equal(a.withReplica(replica=>replica.hasProjectChanges!('unrelated-project')),false,'independent Home notes do not block another project lifecycle');
  assert.deepEqual(mutation.value, { sync_runtime: 1, spaceId: f.space.spaceId, projectId: null, value: { text: 'portable original', attachment: bytes.toString('base64') } });
  const encoded = a.content!.encode(mutation.key, mutation.value);
  const value = await b.content!.decode(mutation.key, encoded.value, async ref => encoded.blobs.find(blob => blob.digest === ref.digest)!.bytes);
  await b.prepare({ ...mutation, value, revision: 1 });
  b.withReplica(replica => replica.receive({ ...mutation, value, revision: 1 }));
  assert.deepEqual(f.samples[1]!.read().notes['same-key'], f.samples[0]!.read().notes['same-key']);
  assert.equal(b.withReplica(replica => replica.next()), null);
  a.withReplica(replica => replica.acknowledge(mutation.key, mutation.operationId, 1));
  f.samples[0]!.edit('same-key', null); const deletion = a.withReplica(replica => replica.next())!;
  assert.equal(deletion.value, null); b.withReplica(replica => replica.receive({ ...deletion, revision: 2 }));
  assert.equal(f.samples[1]!.read().notes['same-key'], undefined);
});

test('S-41 PCSYNC-01/06/25 actual Host refuses malformed scope, inner tombstones, stopped installations and late account writes', async t => {
  const f = await hosts(t), a = await f.discover(0), b = await f.discover(1);
  f.samples[0]!.edit('note', { text: 'never overwrite me', attachment: null });
  const mutation = a.withReplica(replica => replica.next())!, event = { ...mutation, revision: 1 };
  for (const value of [{ ...(mutation.value as object), spaceId: 'another-space' }, { ...(mutation.value as object), projectId: 'another-project' }, { ...(mutation.value as object), value: null }]) {
    await assert.rejects(() => b.prepare({ ...event, value }), { code: 'actions.input_invalid' });
    assert.throws(() => b.withReplica(replica => replica.receive({ ...event, value })), { code: 'actions.input_invalid' });
  }
  for (const key of ['[ null,"note"]', '[null,"note",0]', '["unknown-project","note"]']) await assert.rejects(() => b.prepare({ ...event, key }));
  assert.deepEqual(f.samples[1]!.read(), { notes: {} });
  const platform = await f.owners[1]!.homePlugins!.ready(), installation = platform.runtime.list().find(row => row.plugin_id === f.samples[1]!.definition.manifest.plugin_id)!;
  await platform.runtime.stop(installation.install_id);
  assert.equal(b.available!(), false); assert.equal(await f.discover(1), undefined, 'discovery never re-enables a stopped installation');
  assert.throws(() => b.withReplica(replica => replica.receive(event)), { code: 'actions.plugin_unavailable' });
  f.revoke(); assert.throws(() => a.withReplica(replica => replica.next()), /ACCOUNT_REVOKED/); await assert.rejects(() => f.discover(0), /ACCOUNT_REVOKED/);
});

test('S-41 S-32 PCSYNC-15 Host conflict and recovery values retain the same scope as normal SDK transport',async t=>{
  const f=await hosts(t),a=await f.discover(0),b=await f.discover(1);
  f.samples[0]!.edit('note',{text:'base',attachment:null});const initial=a.withReplica(r=>r.next())!;
  a.withReplica(r=>r.acknowledge(initial.key,initial.operationId,1));b.withReplica(r=>r.receive({...initial,revision:1}));
  f.samples[0]!.edit('note',{text:'remote',attachment:null});f.samples[1]!.edit('note',{text:'local',attachment:Buffer.from('retained bytes').toString('base64')});
  const next=a.withReplica(r=>r.next())!;b.withReplica(r=>r.receive({...next,revision:2}));
  const inspected=b.withReplica(r=>r.inspectConflict!(next.key));assert.ok(inspected);
  const local={sync_runtime:1,spaceId:f.space.spaceId,projectId:null,value:f.samples[1]!.read().notes.note};
  assert.deepEqual(inspected.local,local);assert.deepEqual(inspected.remote,next.value);
  const encoded=b.content!.encode(next.key,inspected.local),decoded=await b.content!.decode(next.key,encoded.value,async ref=>encoded.blobs.find(blob=>blob.digest===ref.digest)!.bytes);assert.deepEqual(decoded,local);
  b.withReplica(r=>r.resolve(next.key,'remote',inspected.revision,inspected.state));
  const retained=b.withReplica(r=>{const record=r.recoveries!()[0]!;return r.inspectRecovery!(record.id);});assert.ok(retained);
  assert.deepEqual(retained.local,local);assert.deepEqual(retained.remote,next.value);
  assert.deepEqual(f.samples[1]!.read().notes.note,{text:'remote',attachment:null});
});

test('S-41 PCSYNC-01/25 project instances keep identical local keys separate through the real Host composition', async t => {
  const home = mkdtempSync(join(tmpdir(), 'runtime-sync-project-')), space = personalStorageSpace('https://auth.example.test', 'work', 'alice');
  ensureStorageSpace(home, space);
  const template = createPersonalNotesSample(), samples = new Map<string, ReturnType<typeof createPersonalNotesSample>>();
  const definition = { ...template.definition, async start(context: Parameters<typeof template.definition.start>[0]) {
    assert.ok(context.project_id); const sample = createPersonalNotesSample(); samples.set(context.project_id!, sample); return sample.definition.start(context);
  } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [definition] } });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const projects = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => [
    await catalog.createProject({ display_name: 'First', actor_id: 'alice' }), await catalog.createProject({ display_name: 'Second', actor_id: 'alice' }),
  ]);
  const registration = (await discoverRuntimeSyncCollections(home, space.spaceId, host, withMolisWorkProjectCatalog, () => {})).find(row => row.selection.plugin_id === definition.manifest.plugin_id)!;
  assert.ok(registration); assert.equal(samples.size, 2);
  projects.forEach((project, i) => samples.get(project.project_id)!.edit('same-key', { text: `project ${i}`, attachment: null }));
  const first = registration.withReplica(replica => replica.next())!, [firstProject] = JSON.parse(first.key);
  assert.equal((first.value as { projectId: string }).projectId, firstProject);
  const second = registration.withReplica(replica => replica.next({ excludeKeys: [first.key] }))!;
  assert.notEqual(first.key, second.key); assert.notEqual((first.value as { projectId: string }).projectId, (second.value as { projectId: string }).projectId);
  const forged = { ...first, revision: 1, value: { ...(first.value as object), projectId: JSON.parse(second.key)[0] } };
  assert.throws(() => registration.withReplica(replica => replica.receive(forged)), { code: 'actions.input_invalid' });
  registration.withReplica(replica => replica.acknowledge(first.key, first.operationId, 1));
  assert.equal(registration.withReplica(replica => replica.counts()).pending, 1);
  assert.equal(registration.withReplica(replica => replica.next())!.key, second.key);
});

// PCSYNC-25: the same author source runs with only packed public packages, outside the workspace resolver.
test('an independently packed SDK sample installs in clean developer folders and keeps real Home activations separate',{timeout:90000},async t=>{
 const {execFileSync}=await import('node:child_process'),{copyFileSync,mkdirSync,readFileSync}=await import('node:fs'),{pathToFileURL,fileURLToPath}=await import('node:url');
 const root=mkdtempSync(join(tmpdir(),'sync-public-distribution-')),activeHosts:MolisWorkLocalHost[]=[];t.after(async()=>{try{for(const host of activeHosts)await host.close();}finally{rmSync(root,{recursive:true,force:true});}});const source=fileURLToPath(new URL('../',import.meta.url)),project=join(root,'author');mkdirSync(project);
 for(const file of ['plugin.ts','build.mjs','package.json','README.md'])copyFileSync(join(source,'examples/personal-sync-plugin',file),join(project,file));
 for(const name of ['contracts','plugin-sdk'])execFileSync('pnpm',['--dir',join(source,'packages',name),'pack','--pack-destination',root,'--json'],{stdio:'pipe'});
 execFileSync('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',join(root,'cache'),join(root,'molis-ai-molis-work-contracts-0.0.0.tgz'),join(root,'molis-ai-molis-work-plugin-sdk-0.0.0.tgz')],{cwd:project,stdio:'pipe'});
 execFileSync(process.execPath,['build.mjs'],{cwd:project,stdio:'pipe'});const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',root],{cwd:project,encoding:'utf8'}));
 assert.deepEqual(packed[0].files.map((file:{path:string})=>file.path).sort(),['README.md','manifest.json','package.json','plugin.js']);
 const module=await import(pathToFileURL(join(project,'plugin.js')).href),definition=module.default as PluginDefinition;
 assert.deepEqual(JSON.parse(readFileSync(join(project,'manifest.json'),'utf8')),definition.manifest);assert.doesNotMatch(readFileSync(join(project,'plugin.js'),'utf8'),/from ['"](?:@molis-ai\/molis-work-(?:storage|app|service|plugin-runtime)|@prologue)/);
 const space=personalStorageSpace('https://auth.example.test','work','distribution-user'),homes=['a','b'].map(name=>join(root,name));homes.forEach(home=>ensureStorageSpace(home,space));
 const hosts=homes.map(home=>new MolisWorkLocalHost({homeDirectory:home,completeText:null,pluginFixtures:{home:[definition]}}));activeHosts.push(...hosts);
 const caller={actor_id:'web-user',project_id:null,audience:'user' as const,permissions:['storage:private']},read=definition.manifest.actions.find(action=>action.capability_id.endsWith('.read')),change=definition.manifest.actions.find(action=>action.capability_id.endsWith('.change'));
 for(const host of hosts)await discoverRuntimeSyncCollections(homes[hosts.indexOf(host)]!,space.spaceId,host,withMolisWorkProjectCatalog,()=>{});
 const first=hosts[0]!.homeActionClient(),second=hosts[1]!.homeActionClient(),value={text:'Only Home A',attachment:null};
 await first.invoke(caller,change,{id:'note',expected:null,value});assert.deepEqual(await first.invoke(caller,read,{id:'note'}),{value});assert.deepEqual(await second.invoke(caller,read,{id:'note'}),{value:null},'one imported definition must not leak its last started document into another Home');
 await assert.rejects(()=>first.invoke(caller,change,{id:'note',expected:null,value:{text:'stale',attachment:null}}),{code:'sample_notes.conflict'});
 await assert.rejects(()=>first.invoke({...caller,actor_id:'foreign'},read,{id:'note'}),{code:'actions.owner_mismatch'});
 const binding=(await discoverRuntimeSyncCollections(homes[0]!,space.spaceId,hosts[0]!,withMolisWorkProjectCatalog,()=>{})).find(row=>row.selection.plugin_id===definition.manifest.plugin_id)!;
 const platform=await hosts[0]!.homePlugins!.ready(),installed=platform.runtime.list().find(row=>row.plugin_id===definition.manifest.plugin_id)!;await platform.runtime.stop(installed.install_id);
 assert.equal(binding.available!(),false);assert.throws(()=>binding.withReplica(replica=>replica.next()),{code:'actions.plugin_unavailable'});
});
