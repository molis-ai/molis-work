import assert from 'node:assert/strict';
import test from 'node:test';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { discoverRuntimeSyncCollections, molisWorkHostProjectReference, personalRuntimeSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { partitionDatabasePath } from '@molis-ai/molis-work-module-projects';
import { personalSyncFixture, pagesSyncSelection } from './fixtures/personal-sync-coordinator.js';
import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';

test('the Pages collection has stable scope across two project instances, stopping and replacement',async t=>{
 const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
 const projects=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>[
  await catalog.createProject({display_name:'First',actor_id:'alice'}),await catalog.createProject({display_name:'Second',actor_id:'alice'}),
 ]);projects.sort((a,b)=>a.project_id.localeCompare(b.project_id));
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},catalog=>{for(const project of projects)catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'pages',actor_id:'alice'});});
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{for(const project of projects){await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'pages',actor_id:'alice'});}});
 const source=await runtimePersonalSync(f.homes[0],f.space),target=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(()=>source.close());f.closeWith(()=>target.close());
 const pages=projects.map(project=>f.withStore(0,store=>store.create({title:project.display_name}),project.project_id));
 const discover=async()=>{const rows=await discoverRuntimeSyncCollections(f.homes[0],f.space.spaceId,source.host,source.withCatalog,()=>{});const pageRows=rows.filter(row=>row.selection.plugin_id===pagesSyncSelection.plugin_id);assert.equal(pageRows.length,1,'all active project instances expose one Home collection');return pageRows[0]!;};
 // The personal space is opened with every partition (UPP-01); stopped here so the two project instances are the only ones holding this collection.
 await source.host.closeProject(partitionDatabasePath(f.homes[0],'personal'));
 const original=await discover();assert.equal(original.available!(),true);
 await source.sync.save({...source.sync.policy(),selections:[pagesSyncSelection]});await source.sync.run();await target.sync.run();
 assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);assert.equal(f.events.length,2);
 // Pages keeps a library in each partition (batch 107): a key names the partition its page is in, never null and never the instance that uploaded it.
 const partitionOf=new Map(pages.map((page,index)=>[page.id,projects[index]!.project_id]));
 const keyed=()=>f.events.every(event=>{const [scope,inner]=JSON.parse(event.key) as [string,string],[partition,,id]=JSON.parse(inner) as string[];return scope===partition&&partition===partitionOf.get(id!);});
 assert.ok(keyed(),'each key names its page\'s own partition, outside and inside');
 // Each project's instance holds its own partition's library only: stopping one leaves the other's reach, and its own changes wait for it.
 await source.host.closeProject(projects[0]!.database_path);assert.equal(original.available!(),true,'the other project\'s instance still holds its own partition');
 f.withStore(0,store=>store.update(pages[0]!.id,{title:'Updated while its project is closed'}),projects[0]!.project_id);
 await source.sync.run();await target.sync.run();assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);
 assert.equal(f.events.length,2,'no other instance uploads a stopped project\'s partition');
 await source.host.closeProject(projects[1]!.database_path);assert.equal(original.available!(),false);await source.sync.run();assert.equal(source.sync.status().unavailable.length,1,'discovery never restarts a stopped owner');
 const reopen=async(project:typeof projects[number])=>source.host.withProject(molisWorkHostProjectReference({databasePath:project.database_path,projectId:project.project_id}),async()=>{}, {activatePlugins:true});
 const first=projects[0]!;await reopen(first);
 assert.equal(original.available!(),false,'a new installation generation never revives a stale binding');
 const survivor=await discover();assert.equal(survivor.available!(),true);
 await source.sync.run();await target.sync.run();assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);
 assert.equal(f.events.length,3,'the change waited for its own instance');assert.equal(f.withStore(1,store=>store.get(pages[0]!.id).title,projects[0]!.project_id),'Updated while its project is closed');
 assert.ok(f.events.slice(0,2).some(event=>event.key===f.events[2]!.key),'the replacement instance updates the existing wire key');
 await reopen(projects[1]!);
 f.withStore(0,store=>store.update(pages[1]!.id,{title:'After Runtime replacement'}),projects[1]!.project_id);await source.sync.run();await target.sync.run();
 assert.equal(source.sync.status().error,null);assert.equal(target.sync.status().error,null);assert.equal(f.events.length,4);
 assert.equal(f.withStore(1,store=>store.get(pages[1]!.id).title,projects[1]!.project_id),'After Runtime replacement');
 assert.ok(keyed());
 await source.withCatalog({homeDirectory:f.homes[0]},catalog=>catalog.removeProjectPlugin({project_id:projects[1]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 f.withStore(0,store=>store.update(pages[0]!.id,{title:'Still reachable'}),projects[0]!.project_id);f.withStore(0,store=>store.update(pages[1]!.id,{title:'Hidden project change'}),projects[1]!.project_id);
 await source.sync.run();await target.sync.run();assert.equal(source.sync.status().error,null);assert.equal(f.events.length,5,'the other active instance cannot upload a hidden project');
 assert.equal(f.withStore(1,store=>store.get(pages[1]!.id).title,projects[1]!.project_id),'After Runtime replacement');
 await source.withCatalog({homeDirectory:f.homes[0]},catalog=>catalog.addProjectPlugin({project_id:projects[1]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 await source.sync.run();await target.sync.run();assert.equal(f.events.length,6,'explicitly restoring reach releases the existing local queue');

 const bind=async(runtime:typeof source,home:string)=>{
  const authority=personalRuntimeSyncAuthority({home,spaceId:f.space.spaceId,authorize(){},withCatalog:runtime.withCatalog,readCatalog:runtime.readCatalog,policy:()=>({revision:1,selections:[pagesSyncSelection]}),hasArtifact:()=>false,hasReference:()=>false});
  const registration=(await discoverRuntimeSyncCollections(home,f.space.spaceId,runtime.host,runtime.withCatalog,()=>{})).find(row=>row.selection.plugin_id===pagesSyncSelection.plugin_id)!;
  return authority.bind(registration);
 };
 const upload=await bind(source,f.homes[0]),download=await bind(target,f.homes[1]);
 const large=f.withStore(0,store=>store.create({title:'Delayed blob',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'large'.repeat(150000)}]}]}}),first.project_id);
 const mutation=upload.withReplica(replica=>replica.next())!;const encoded=upload.content!.encode(mutation.key,mutation.value);assert.ok(encoded.blobs.length>0);
 let started!:()=>void,release!:()=>void;const reading=new Promise<void>(resolve=>{started=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});
 const pending=download.content!.decode(mutation.key,encoded.value,async ref=>{started();await blocked;const blob=encoded.blobs.find(blob=>blob.digest===ref.digest)!;return blob.bytes;});
 await reading;await target.withCatalog({homeDirectory:f.homes[1]},catalog=>catalog.removeProjectPlugin({project_id:first.project_id,plugin_id:'pages',actor_id:'alice'}));
 release();await assert.rejects(pending,/未授权/,'a retained codec cannot return bytes after live project reach is revoked');
 assert.equal(f.withStore(1,store=>store.list().some(page=>page.id===large.id),first.project_id),false,'late content cannot create a business record');
 let reads=0;await assert.rejects(()=>download.content!.decode(mutation.key,encoded.value,async()=>{reads++;return new Uint8Array();}),/未授权/);assert.equal(reads,0,'an already hidden project is rejected before any blob read');
});
