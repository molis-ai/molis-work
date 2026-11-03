import assert from 'node:assert/strict';
import test from 'node:test';
import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { syncNamespace } from '@molis-ai/molis-work-module-sync-replication';
import { personalSyncFixture, pagesSyncSelection } from './fixtures/personal-sync-coordinator.js';
import { runtimePersonalSync } from './fixtures/runtime-personal-sync.js';

test('retained versions and conflicts cannot expose a hidden project through another active Home instance',async t=>{
 const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
 t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});t.mock.method(globalThis,'fetch',f.transport);
 const projects=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>[await catalog.createProject({display_name:'Hidden later',actor_id:'alice'}),await catalog.createProject({display_name:'Still visible',actor_id:'alice'})]);
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{for(const project of projects)await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});});
 const source=await runtimePersonalSync(f.homes[0],f.space),target=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(()=>source.close());f.closeWith(()=>target.close());
 const namespace=syncNamespace(pagesSyncSelection),pages=projects.map(project=>f.withStore(0,store=>store.create({project_id:project.project_id,title:'Base '+project.display_name})));
 await source.sync.save({...source.sync.policy(),selections:[pagesSyncSelection]});await source.sync.run();await target.sync.run();
 const conflict=async(index:number)=>{
  const page=pages[index]!;f.withStore(0,store=>store.update(page.id,{title:'Remote secret '+index}));f.withStore(1,store=>store.update(page.id,{title:'Local secret '+index}));
  await source.sync.run();await target.sync.run();return target.sync.status().collections.find(row=>syncNamespace(row.selection)===namespace)!.conflicts.find(row=>row.key.includes(page.id))!;
 };
 for(const index of [0,1]){const row=await conflict(index);assert.ok(row);await target.sync.resolve(namespace,row.key,'remote');}
 const retained=target.sync.recoveries(namespace),hidden=retained.find(row=>row.key.includes(pages[0]!.id))!,visible=retained.find(row=>row.key.includes(pages[1]!.id))!;
 assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace,hidden.id)).includes('Local secret 0'));
 const unresolved=await conflict(0);assert.ok(unresolved);
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},catalog=>catalog.removeProjectPlugin({project_id:projects[0]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 assert.throws(()=>target.sync.inspectRecovery(namespace,hidden.id),/未授权/,'hidden retained bodies must not escape through an active instance in another project');
 assert.throws(()=>target.sync.inspectConflict(namespace,unresolved.key),/未授权/);
 assert.ok(target.sync.recoveries(namespace).some(row=>row.id===visible.id));
 assert.equal(target.sync.recoveries(namespace).some(row=>row.id===hidden.id),false,'hidden recovery keys are not listed');
 await assert.rejects(()=>target.sync.restoreRecovery(namespace,hidden.id,'local',hidden.revision),/未授权/);
 assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace,visible.id)).includes('Local secret 1'),'the other project keeps its own history');
 await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},catalog=>catalog.addProjectPlugin({project_id:projects[0]!.project_id,plugin_id:'pages',actor_id:'alice'}));
 assert.ok(JSON.stringify(target.sync.inspectRecovery(namespace,hidden.id)).includes('Local secret 0'),'refusal preserves the original history');
});
