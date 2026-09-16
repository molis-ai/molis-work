import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID, GoalProjectApplication } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';

test('Dense workspace keeps many long tabs, nested panes and long Feed content inside the viewport',{timeout:90000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const {command,sessionId,evaluate,click,waitFor,navigate,origin,projectId}=b;
  const catalog=await openMolisWorkProjectCatalog({homeDirectory:b.homeDirectory});catalog.addProjectPlugin({project_id:projectId!,plugin_id:'feed',actor_id:'density-test'});catalog.close();
  const app=new GoalProjectApplication(b.store),ids:string[]=[];
  for(let i=0;i<12;i++)ids.push(app.goalEvents.createIntent({board_id:DEMO_BOARD_ID,title:`工作区验收 ${i}：跨团队长期目标，保留清晰的信息层级和用户注意力`,outcome:'切换与分屏可连续使用',actor_id:'web-user',actor_kind:'user',idempotency_key:'dense-'+i}).goal.goal_id);
  const feed=createLocalFeedApplication(b.store.db),source=createLocalFeedSourceService(b.store.db,DEMO_BOARD_ID).register({kind:'custom_rss',name:'长期观察来源：设计、工程与产品的连续记录',feed_url:'https://example.com/density.xml'}).source;
  for(let i=0;i<80;i++)feed.ingestItem({source,externalId:'dense-'+i,title:`验收条目 ${i}：长标题在紧凑布局中仍然可以辨识，阅读时保留完整内容`,summary:'信息应留在自己的列表与阅读区。',body:Array.from({length:40},(_,n)=>`记录 ${n}：主操作和内容阅读都应当在当前分屏内完成。`).join('\n'),occurredAt:new Date(Date.now()-i*60000).toISOString(),attention:false});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/`},sessionId));
  await click('[data-plugin-id=goals]');
  for(const id of ids)await click(`[data-directory-panel=goals] [data-select-goal="${id}"]`);
  assert.ok(await evaluate("document.querySelectorAll('.tab-item').length>=12"));
  await click('[data-plugin-id=feed]');await click(`[data-feed-task-toggle="${source.source_id}"]`);
  for(const direction of ['right','bottom']) {
    await click('[data-titlebar-tabs] [data-tab-split]');await click(`[data-layout-split=${direction}]`);
    await waitFor(`document.querySelectorAll('iframe.tab-content-frame').length>=${direction==='right'?2:3}`);
  }
  await waitFor("[...document.querySelectorAll('iframe.tab-content-frame')].every(f=>f.contentDocument?.querySelector('[data-feed-entry-id]'))");
  const frame="document.querySelector('iframe.tab-content-frame')";
  const wheel=await evaluate<{x:number,y:number}>(`(()=>{const f=${frame},r=f.getBoundingClientRect(),e=f.contentDocument.querySelector('[data-feed-entry-id]').getBoundingClientRect();return {x:r.x+e.x+e.width/2,y:r.y+e.y+e.height/2}})()`);
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:550},sessionId);
  await waitFor(`${frame}.contentDocument.querySelector('.feed-stage-tree').scrollTop>0`);
  const entry=await evaluate<{x:number,y:number,id:string}>(`(()=>{const f=${frame},r=f.getBoundingClientRect(),tree=f.contentDocument.querySelector('.feed-stage-tree').getBoundingClientRect(),e=[...f.contentDocument.querySelectorAll('[data-feed-entry-id]')].find(e=>{const q=e.getBoundingClientRect();return q.top>=tree.top && q.bottom<=tree.bottom});const q=e.getBoundingClientRect();return {x:r.x+q.x+q.width/2,y:r.y+q.y+q.height/2,id:e.dataset.feedEntryId}})()`);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',x:entry.x,y:entry.y,button:'left',clickCount:1},sessionId);
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:entry.x,y:entry.y,button:'left',clickCount:1},sessionId);
  await waitFor(`${frame}.contentDocument.querySelector('[data-feed-detail="${entry.id}"]')?.textContent.includes('记录 39')`);

  assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollWidth<=innerWidth+1'),true);
  assert.equal(await evaluate("[...document.querySelectorAll('iframe.tab-content-frame')].every(f=>f.contentDocument.scrollingElement.scrollHeight<=f.clientHeight+1)"),true);
  const dir='.impeccable/review/closing-v14';await mkdir(dir,{recursive:true});
  const capture=async(name:string)=>{const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(`${dir}/${name}.png`,Buffer.from(shot.data,'base64'));};
  await capture('dense-desktop');
  await b.reloadPage();await waitFor("document.querySelectorAll('[data-tab-pane]').length===3");
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:500,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate("localStorage.setItem('molis-work:theme','dark');window.dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'dark'}))");
  await click('[data-titlebar-tabs] [data-tab-split]');await click('[data-focus-pane]');
  await waitFor("[...document.querySelectorAll('[data-tab-pane]')].filter(p=>p.getBoundingClientRect().width>0).length===1");
  assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollWidth<=innerWidth+1'),true);
  await capture('dense-mobile-dark');
});
