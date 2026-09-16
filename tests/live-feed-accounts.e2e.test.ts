import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProjectDatabase,seedDemoBoard,DEMO_BOARD_ID,createLocalFeedConnectorService } from '@molis-ai/molis-work-app-local-host';

for(const kind of ['github','gmail'] as const) {
  test(`Live ${kind} account performs read-only production sync`,{skip:process.env.MOLIS_WORK_LIVE_ACCOUNTS!=='1',timeout:60000},async t=>{
    const dir=await mkdtemp(join(tmpdir(),'molis-live-account-'));const path=join(dir,'local.db');seedDemoBoard(path);const store=new LocalProjectDatabase(path);
    try {
      const service=createLocalFeedConnectorService(store.db,DEMO_BOARD_ID);
      assert.equal(service.authStatus()[kind].bound,true,'Existing account authorization is required');
      const source=service.ensureSources().find(s=>s.sync_kind===kind)!;
      const result=await service.sync(source.source_id,{idempotencyKey:'live-account-check',mode:'normal'});
      t.diagnostic(JSON.stringify({kind,outcome:result.run.outcome,errorCode:result.run.error_code,created:result.created}));
      assert.equal(result.run.outcome,'completed',result.run.error_code || 'Account sync did not complete');
      assert.equal(service.feed.getSource(DEMO_BOARD_ID,source.source_id).last_outcome,'completed');
    } finally {store.close();await rm(dir,{recursive:true,force:true});}
  });
}
