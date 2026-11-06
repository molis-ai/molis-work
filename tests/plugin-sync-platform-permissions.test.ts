import assert from 'node:assert/strict';
import test from 'node:test';
import {goalsManifest} from '@molis-ai/molis-work-plugin-goals';
import {inboxManifest} from '@molis-ai/molis-work-plugin-inbox';
import {personalStorageSpace} from '@molis-ai/molis-work-storage';
import {projectPluginSyncFixture} from './fixtures/project-plugin-sync.js';

for (const [manifest, collectionId, permissions] of [
  [goalsManifest,'project_goals',['journal:project','context-ledger:read','context-ledger:write']],
  [inboxManifest,'attention',['attention:read','attention:write']],
] as const) {
  test(`${manifest.plugin_id} retained sync adapters recheck every platform grant`, async t=>{
    let denied:string|undefined;
    const definition=manifest.sync!.collections.find(row=>row.id===collectionId)!.sections!;
    const owner=projectPluginSyncFixture({space:personalStorageSpace('https://auth.example','work','user'),projectId:'project',manifest,collectionId,
      authorize(permission){if(permission===denied && denied)throw new Error('grant revoked: '+permission);},
      // The declaration's pure sections are enough for an empty library. No business mutation is admitted in this test.
      bindings:context=>[context.services!.sync!.sections(collectionId,{...definition,business:definition.business.map(section=>({...section,validate:rows=>rows}))})]});
    t.after(()=>owner.close());
    owner.replica.counts();
    const before=owner.db.prepare('SELECT total_changes() AS n').get();
    for (const permission of permissions) {
      denied=permission;
      assert.throws(()=>owner.replica.counts(),/grant revoked/);
      assert.throws(()=>owner.replica.next(),/grant revoked/);
      assert.throws(()=>owner.replica.receive({key:JSON.stringify(['project',definition.kind,'project']),revision:1,operationId:'revoked',value:null}),/grant revoked/);
      assert.throws(()=>owner.content!.encode(JSON.stringify(['project',definition.kind,'project']),null),/grant revoked/);
      await assert.rejects(async()=>owner.content!.decode(JSON.stringify(['project',definition.kind,'project']),null,async()=>new Uint8Array()),/grant revoked/);
      assert.deepEqual(owner.db.prepare('SELECT total_changes() AS n').get(),before,'revocation cannot partially write owner or journal');
    }
    denied=undefined;
    owner.replica.counts();
  });
}
