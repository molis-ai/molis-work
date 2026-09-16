import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexAppServerTransport, CodexRuntimeSessionAdapter } from '@molis-ai/molis-work-service-runtime-host';
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID } from '@molis-ai/molis-work-app-local-host';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { openGoalBrowser } from './fixtures/goal-browser.js';

const live = process.env.MOLIS_WORK_LIVE_ACCEPTANCE === '1';
test('Live public RSS uses production fetch, deduplicates, and opens retained content', {skip:!live,timeout:120000}, async t => {
  const b=await openGoalBrowser(t,true);if(!b)return;
  const catalog=await openMolisWorkProjectCatalog({homeDirectory:b.homeDirectory});
  catalog.addProjectPlugin({project_id:b.projectId!,plugin_id:'feed',actor_id:'live-acceptance'});catalog.close();
  const service=createLocalFeedSourceService(b.store.db,DEMO_BOARD_ID);
  const source=service.register({kind:'custom_rss',name:'公开 RSS 验收',feed_url:'https://simonwillison.net/atom/everything/'}).source;
  const first=await service.sync(source.source_id,{idempotencyKey:'live-first',signal:AbortSignal.timeout(45000)});
  assert.equal(first.run.outcome,'completed',JSON.stringify(first.run));
  assert.ok(first.created>0,'actual remote entries persisted');
  const second=await service.sync(source.source_id,{idempotencyKey:'live-second',signal:AbortSignal.timeout(45000)});
  assert.equal(second.run.outcome,'completed',JSON.stringify(second.run));
  assert.equal(second.created,0,'unchanged remote entries are not duplicated');
  await b.navigate(()=>b.command('Page.navigate',{url:`${b.origin}/projects/${b.projectId}/`},b.sessionId));
  await b.click('[data-plugin-id=feed]');await b.click(`[data-feed-task-toggle="${source.source_id}"]`);
  const itemId=await b.evaluate<string>("document.querySelector('[data-feed-entry-id]').dataset.feedEntryId");
  await b.click(`[data-feed-entry-id="${itemId}"]`);
  await b.waitFor(`document.querySelector('[data-feed-detail="${itemId}"] [data-feed-action=inbox]')`);
  const item=createLocalFeedApplication(b.store.db).getItem(DEMO_BOARD_ID,itemId);
  assert.ok(item.read_at);assert.ok(item.body.length>0);
  await b.navigate(()=>b.click(`[data-feed-detail="${itemId}"] [data-feed-action=inbox]`));
  const inbox=await (await fetch(`${b.origin}/projects/${b.projectId}/api/inbox`)).json();
  assert.ok(JSON.stringify(inbox.entries).includes(item.item_id), 'Inbox retains the actual Feed reference');
  t.diagnostic(JSON.stringify({firstCreated:first.created,secondCreated:second.created,retainedBodyCharacters:item.body.length,inbox:true}));
});

test('Live Codex adapter creates, executes, reads, and links one isolated Session', {skip:!live,timeout:120000}, async t => {
  const b=await openGoalBrowser(t,true);if(!b)return;
  const cwd=await mkdtemp(join(tmpdir(),'molis-live-runtime-'));
  const transport=new CodexAppServerTransport({requestTimeoutMs:15000});
  const adapter=new CodexRuntimeSessionAdapter(transport);
  let threadId='';
  try {
    const created=await adapter.invoke('create',{cwd,approvalPolicy:'never',sandbox:'read-only',baseInstructions:'This is an isolated integration test. Do not access files or use tools. Only return the requested literal text.',developerInstructions:'Do not invoke tools or access any external resource.'});
    assert.equal(created.status,'ok',JSON.stringify(created));
    threadId=(created as any).value.thread.id;
    const completion=new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{off();reject(new Error('Runtime turn did not finish within 60s'));},60000);
      const off=transport.subscribe(event=>{
        const p=event.params as any;
        if(event.method==='turn/completed' && p.threadId===threadId){clearTimeout(timer);off();p.turn.status==='completed'?resolve():reject(new Error('Runtime turn status: '+p.turn.status));}
      });
    });
    // Attach rejection immediately; failed delivery must not cause an unhandled timeout.
    void completion.catch(()=>{});
    const delivered=await adapter.invoke('handoff',{existingThreadId:threadId,prompt:'Reply with exactly MOLIS_LIVE_ACCEPTANCE_OK. Do not use any tools.'});
    assert.equal(delivered.status,'ok',JSON.stringify(delivered));
    await completion;
    const read=await adapter.invoke('read',{threadId});
    assert.equal(read.status,'ok',JSON.stringify(read));
    assert.match(JSON.stringify((read as any).value.thread.turns),/MOLIS_LIVE_ACCEPTANCE_OK/);
    await b.navigate(()=>b.command('Page.navigate',{url:`${b.origin}/projects/${b.projectId}/`},b.sessionId));
    const response=await b.evaluate<{status:number}>(`(async()=>{const r=await fetch('/projects/${b.projectId}/api/sessions',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action:'link',runtime_id:'codex',native_runtime_session_id:${JSON.stringify(threadId)},title:'隔离真实 Runtime 验收',current_goal_id:'CORE',user_confirmed:true})});return {status:r.status}})()`);
    assert.equal(response.status,201);
    await b.reloadPage();
    const sessions=(await (await fetch(`${b.origin}/projects/${b.projectId}/api/sessions`)).json()).sessions;
    assert.equal(sessions.filter((s:any)=>s.native_runtime_session_id===threadId && s.current_goal_id==='CORE').length,1);
    t.diagnostic(JSON.stringify({runtime:'codex',created:true,executed:true,read:true,linked:true}));
  } finally {
    if(threadId)await transport.request('thread/archive',{threadId}).catch(()=>{});
    transport.close();await rm(cwd,{recursive:true,force:true});
  }
});
