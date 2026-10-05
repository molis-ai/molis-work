import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMolisWorkHome } from '@molis-ai/molis-work-storage';
import { LocalProjectDatabase,seedDemoBoard,DEMO_BOARD_ID,createLocalFeedApplication,createLocalFeedConnectorSync,createLocalFeedSourceService,withConnectorConnections } from '@molis-ai/molis-work-app-local-host';
import { accountSourceRecord } from './fixtures/feed-account-source.js';

for(const kind of ['github','gmail'] as const) {
  test(`Live ${kind} account performs read-only production sync`,{skip:process.env.MOLIS_WORK_LIVE_ACCOUNTS!=='1',timeout:60000},async t=>{
    const dir=await mkdtemp(join(tmpdir(),'molis-live-account-'));const path=join(dir,'local.db');seedDemoBoard(path);const store=new LocalProjectDatabase(path);
    try {
      const home=resolveMolisWorkHome();
      const connection=withConnectorConnections(home,rows=>rows.list(kind).find(row=>rows.state(row)==='connected'));
      assert.ok(connection,'An existing account connection is required');
      const feed=createLocalFeedApplication(store.db);
      const base=feed.upsertSource(accountSourceRecord(kind));
      // Choosing the account goes through the same Source update a person makes in Feed.
      const source=createLocalFeedSourceService(store.db,DEMO_BOARD_ID,undefined,undefined,home).update(base.source_id,{connection_id:connection.connection_id});
      const result=await createLocalFeedConnectorSync(store.db,DEMO_BOARD_ID,undefined,feed,home).sync(source.source_id,{idempotencyKey:'live-account-check',mode:'normal'});
      t.diagnostic(JSON.stringify({kind,outcome:result.run.outcome,errorCode:result.run.error_code,created:result.created}));
      assert.equal(result.run.outcome,'completed',result.run.error_code || 'Account sync did not complete');
      assert.equal(feed.getSource(DEMO_BOARD_ID,source.source_id).last_outcome,'completed');
    } finally {store.close();await rm(dir,{recursive:true,force:true});}
  });
}
