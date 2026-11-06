import assert from 'node:assert/strict';
import test from 'node:test';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { discoverRuntimeSyncCollections, molisWorkHostProjectReference, personalRuntimeSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { personalSyncFixture, pagesSyncSelection } from './fixtures/personal-sync-coordinator.js';
import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';

test('one Home journal has stable scope across two project instances, stopping and replacement',async t=>{
 const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
 const projects=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>[
  await catalog.createProject({display_name:'First',actor_id:'alice'}),await catalog.createProject({display_name:'Second',actor_id:'alice'}),
 ]);projects.sort((a,b)=>a.project_id.localeCompare(b.project_id));
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{for(const project of projects)await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});});
 const source=await runtimePersonalSync(f.homes[0],f.space),target=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(()=>source.close());f.closeWith(()=>target.close());
 const pages=projects.map(project=>f.withStore(0,store=>store.create({project_id:project.project_id,title:project.display_name})));
 const discover=async()=>{const rows=await discoverRuntimeSyncCollections(f.homes[0],f.space.spaceId,source.host,source.withCatalog,()=>{});const pageRows=rows.filter(row=>row.selection.plugin_id===pagesSyncSelection.plugin_id);assert.equal(pageRows.length,1,'all active project instances expose one Home collection');return pageRows[0]!;};
 const original=await discover();assert.equal(original.available!(),true);
 await source.sync.save({...source.sync.policy(),selections:[pagesSyncSelection]});await source.sync.run();await target.sync.run();
 assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);assert.equal(f.events.length,2);
 assert.ok(f.events.every(event=>JSON.parse(event.key)[0]===null),'Home keys never acquire a project activation prefix');
 await source.host.closeProject(projects[0]!.database_path);assert.equal(original.available!(),false,'the old instance cannot borrow the other instance authority');
 const survivor=await discover();assert.equal(survivor.available!(),true);
 f.withStore(0,store=>store.update(pages[0]!.id,{title:'Updated while the other project is open'}));
 await source.sync.run();await target.sync.run();assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);
 assert.equal(f.events.length,3);assert.equal(f.withStore(1,store=>store.get(pages[0]!.id).title),'Updated while the other project is open');
 assert.ok(f.events.slice(0,2).some(event=>event.key===f.events[2]!.key),'the replacement instance updates the existing wire key');
 await source.host.closeProject(projects[1]!.database_path);assert.equal(survivor.available!(),false);await source.sync.run();assert.equal(source.sync.status().unavailable.length,1,'discovery never restarts a stopped owner');
 const first=projects[0]!;await source.host.withProject(molisWorkHostProjectReference({databasePath:first.database_path,projectId:first.project_id}),async()=>{}, {activatePlugins:true});
 assert.equal(original.available!(),false,'a new installation generation never revives a stale binding');
 f.withStore(0,store=>store.update(pages[1]!.id,{title:'After Runtime replacement'}));await source.sync.run();await target.sync.run();
 assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);assert.equal(f.events.length,4);
 assert.equal(f.withStore(1,store=>store.get(pages[1]!.id).title),'After Runtime replacement');
 assert.ok(f.events.every(event=>JSON.parse(event.key)[0]===null));
 await source.withCatalog({homeDirectory:f.homes[0]},catalog=>catalog.removeProjectPlugin({project_id:projects[1]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 f.withStore(0,store=>{store.update(pages[0]!.id,{title:'Still reachable'});store.update(pages[1]!.id,{title:'Hidden project change'});});
 await source.sync.run();await target.sync.run();assert.equal(source.sync.status().error,null);assert.equal(f.events.length,5,'the other active instance cannot upload a hidden project');
 assert.equal(f.withStore(1,store=>store.get(pages[1]!.id).title),'After Runtime replacement');
 await source.withCatalog({homeDirectory:f.homes[0]},catalog=>catalog.addProjectPlugin({project_id:projects[1]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 await source.sync.run();await target.sync.run();assert.equal(f.events.length,6,'explicitly restoring reach releases the existing local queue');

 const bind=async(runtime:typeof source,home:string)=>{
  const authority=personalRuntimeSyncAuthority({home,spaceId:f.space.spaceId,authorize(){},withCatalog:runtime.withCatalog,readCatalog:runtime.readCatalog,policy:()=>({revision:1,selections:[pagesSyncSelection]}),hasArtifact:()=>false,hasReference:()=>false});
  const registration=(await discoverRuntimeSyncCollections(home,f.space.spaceId,runtime.host,runtime.withCatalog,()=>{})).find(row=>row.selection.plugin_id===pagesSyncSelection.plugin_id)!;
  return authority.bind(registration);
 };
 const upload=await bind(source,f.homes[0]),download=await bind(target,f.homes[1]);
 const large=f.withStore(0,store=>store.create({project_id:first.project_id,title:'Delayed blob',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'large'.repeat(150000)}]}]}}));
 const mutation=upload.withReplica(replica=>replica.next())!;const encoded=upload.content!.encode(mutation.key,mutation.value);assert.ok(encoded.blobs.length>0);
 let started!:()=>void,release!:()=>void;const reading=new Promise<void>(resolve=>{started=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});
 const pending=download.content!.decode(mutation.key,encoded.value,async ref=>{started();await blocked;const blob=encoded.blobs.find(blob=>blob.digest===ref.digest)!;return blob.bytes;});
 await reading;await target.withCatalog({homeDirectory:f.homes[1]},catalog=>catalog.removeProjectPlugin({project_id:first.project_id,plugin_id:'pages',actor_id:'alice'}));
 release();await assert.rejects(pending,/未授权/,'a retained codec cannot return bytes after live project reach is revoked');
 assert.equal(f.withStore(1,store=>store.list(first.project_id).some(page=>page.id===large.id)),false,'late content cannot create a business record');
 let reads=0;await assert.rejects(()=>download.content!.decode(mutation.key,encoded.value,async()=>{reads++;return new Uint8Array();}),/未授权/);assert.equal(reads,0,'an already hidden project is rejected before any blob read');
});
