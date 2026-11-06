import assert from 'node:assert/strict';
import test from 'node:test';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {LocalProjectDatabase, availableProjectPluginIds, molisWorkHostProjectReference} from '@molis-ai/molis-work-app-local-host';
import {FeedOutRuleStore,feedManifest} from '@molis-ai/molis-work-plugin-feed';
import {fromBetterSqlite} from '@molis-ai/molis-work-plugin-feed/store';
import {personalSyncFixture} from './fixtures/personal-sync-coordinator.js';
import {runtimePersonalSync} from './fixtures/runtime-personal-sync.js';

test('PERSAF-05 incoming Feed content cannot re-enable an explicitly removed plugin',async t=>{
  const f=personalSyncFixture(t),previous=process.env.MOLIS_WORK_SYNC_LOCAL;process.env.MOLIS_WORK_SYNC_LOCAL='1';
  t.after(()=>{if(previous===undefined)delete process.env.MOLIS_WORK_SYNC_LOCAL;else process.env.MOLIS_WORK_SYNC_LOCAL=previous;});
  t.mock.method(globalThis,'fetch',f.transport);
  const project=await withMolisWorkProjectCatalog({homeDirectory:f.homes[0]},async catalog=>{
    const value=await catalog.createProject({display_name:'Explicit choice',actor_id:'alice'});
    catalog.addProjectPlugin({project_id:value.project_id,plugin_id:'feed',actor_id:'alice'});return value;
  });
  const target=await withMolisWorkProjectCatalog({homeDirectory:f.homes[1]},async catalog=>{
    const value=await catalog.ensureSyncedProject({project_id:project.project_id,display_name:project.display_name,actor_id:'alice'},()=>{});
    catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});
    catalog.removeProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'});return value;
  });
  const writer=new LocalProjectDatabase(project.database_path);let ruleId:string;
  try{ruleId=new FeedOutRuleStore(fromBetterSqlite(writer.db)).create(project.project_id,{name:'User choice is retained',match:{contains:'fact'},enabled:false}).rule_id;}finally{writer.close();}
  const a=await runtimePersonalSync(f.homes[0],f.space),b=await runtimePersonalSync(f.homes[1],f.space);f.closeWith(a.close);f.closeWith(b.close);
  const collection=feedManifest.sync!.collections.find(row=>row.id==='capture_rules')!;
  await a.sync.save({...a.sync.policy(),selections:[{plugin_id:feedManifest.plugin_id,publisher_id:feedManifest.publisher.publisher_id,publisher_signature:feedManifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version}]});
  await a.sync.run();assert.equal(a.sync.status().error,null);assert.ok(f.events.length>0);
  await b.sync.run();
  await b.withCatalog({homeDirectory:f.homes[1]},catalog=>{
    assert.equal(availableProjectPluginIds(catalog.listProjectPlugins(project.project_id)).has('feed'),false);
  });
  const disabled=new LocalProjectDatabase(target.database_path);
  try{assert.throws(()=>new FeedOutRuleStore(fromBetterSqlite(disabled.db)).get(project.project_id,ruleId));}finally{disabled.close();}
  await b.withCatalog({homeDirectory:f.homes[1]},catalog=>catalog.addProjectPlugin({project_id:project.project_id,plugin_id:'feed',actor_id:'alice'}));
  await b.host.closeProject(molisWorkHostProjectReference({databasePath:target.database_path,projectId:project.project_id}));
  await b.openProjects();await b.sync.run();assert.equal(b.sync.status().error,null);
  const received=new LocalProjectDatabase(target.database_path);
  try{assert.equal(new FeedOutRuleStore(fromBetterSqlite(received.db)).get(project.project_id,ruleId).name,'User choice is retained');}finally{received.close();}
});
