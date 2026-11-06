import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalSync, type SyncRegistration} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';

test('sync status lists unselected collections without reading their business adapter', t => {
  const home=mkdtempSync(join(tmpdir(),'sync-status-'));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example','test','alice');
  ensureStorageSpace(home,space);
  let reads=0;
  const registration:SyncRegistration={selection:{plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'sig',collection_id:'items',schema_version:1},title:'Items',async refresh(){},async prepare(){},withReplica(){reads++;throw new Error('unselected');}};
  const sync=new PersonalSync({home,spaceId:space.spaceId,endpoint:'https://sync.example',registrations:[registration],authority:{signal:new AbortController().signal,assertCurrent(){},async accessToken(){throw new Error('no network');}}});
  t.after(()=>sync.close());
  const status=sync.status();
  assert.equal(status.collections.length,1);
  assert.equal(status.collections[0]!.pending,0);
  assert.equal(reads,0);
});
