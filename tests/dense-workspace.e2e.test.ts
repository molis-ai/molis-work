import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { createLocalFeedApplication, createLocalFeedSourceService } from './fixtures/feed-library.js';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { GoalProjectApplication } from './fixtures/goal-application.js';
import { pluginFrameBrowser } from './fixtures/plugin-frame-browser.js';

test('Dense workspace keeps many long tabs, nested panes and long Feed content inside the viewport',{timeout:90000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const {command,sessionId,evaluate,click,openGoalFrame,waitFor,navigate,origin,projectId}=b;
  const owners=await Promise.all([0,1,2].map(index=>pluginFrameBrowser(t,b,'feed',`iframe.tab-content-frame[data-dense-owner="${index}"]`)));
  await addProjectPlugin(b.web, projectId!, "feed");
  const app=new GoalProjectApplication(b.store),ids:string[]=[];
  for(let i=0;i<12;i++)ids.push(app.goalEvents.createIntent({project_id:DEMO_PROJECT_ID,title:`工作区验收 ${i}：跨团队长期目标，保留清晰的信息层级和用户注意力`,outcome:'切换与分屏可连续使用',actor_id:'web-user',actor_kind:'user',idempotency_key:'dense-'+i}).goal.goal_id);
  const feed=createLocalFeedApplication(b.store.db),source=createLocalFeedSourceService(b.store.db,DEMO_PROJECT_ID).register({kind:'custom_rss',name:'长期观察来源：设计、工程与产品的连续记录',feed_url:'https://example.com/density.xml'}).source;
  for(let i=0;i<80;i++)feed.ingestItem({source,externalId:'dense-'+i,title:`验收条目 ${i}：长标题在紧凑布局中仍然可以辨识，阅读时保留完整内容`,summary:'信息应留在自己的列表与阅读区。',body:Array.from({length:40},(_,n)=>`记录 ${n}：主操作和内容阅读都应当在当前分屏内完成。`).join('\n'),occurredAt:new Date(Date.now()-i*60000).toISOString(),attention:false});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/`},sessionId));
  await click('[data-plugin-id=goals]');
  for(const id of ids)await openGoalFrame(`[data-goal-stage-list] [data-select-goal="${id}"]`);
  // The work's tabs only: 07-S1 put the right side's glyph tabs (also .tab-item) in the title bar on real pages, an expected change.
  assert.ok(await evaluate("document.querySelectorAll('.tab-item:not([data-side-tabs] .tab-item)').length>=12"));
  await click('[data-plugin-id=feed]');
  for(const direction of ['right','bottom']) {
    await click('[data-layout-open]');await click(`[data-layout-split=${direction}]`);
    await waitFor(`document.querySelectorAll('iframe.tab-content-frame').length>=${direction==='right'?2:3}`);
  }
  const bindings=await evaluate<Array<{pane:string;tab:string;actualPane:string}>>("[...document.querySelectorAll('iframe.tab-content-frame')].filter(frame=>!frame.hidden&&frame.getClientRects().length).map((frame,index)=>{frame.dataset.denseOwner=String(index);return {pane:frame.dataset.paneOwner,tab:frame.dataset.paneTab,actualPane:document.querySelector('[data-tab-pane=\"'+CSS.escape(frame.dataset.paneOwner)+'\"]')?.dataset.tabPane}})");
  assert.equal(bindings.length,3);assert.equal(new Set(bindings.map(binding=>binding.pane)).size,3);
  assert.ok(bindings.every(binding=>binding.pane===binding.actualPane&&binding.tab),'each child belongs to its actual pane and tab');
  for(const owner of owners)await owner.waitFor("document.querySelector('[data-feed-entry-id]')");
  const reader=owners[0]!;
  // Wheel over the visible middle of the list: in a short pane its first entry may start below the fold.
  const wheel=await reader.point('.feed-stage-tree');
  await command('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:550},sessionId);
  await reader.waitFor("document.querySelector('.feed-stage-tree').scrollTop>0");
  const entryId=await reader.evaluate<string>("(()=>{const tree=document.querySelector('.feed-stage-tree').getBoundingClientRect(),entry=[...document.querySelectorAll('[data-feed-entry-id]')].find(entry=>{const box=entry.getBoundingClientRect();return box.top>=tree.top&&box.bottom<=Math.min(tree.bottom,innerHeight)});return entry?.dataset.feedEntryId})()");
  assert.ok(entryId,'one complete Feed row is visible in this pane');
  await reader.click(`[data-feed-entry-id="${entryId}"]`);
  await reader.waitFor(`document.querySelector('[data-feed-detail="${entryId}"]')?.textContent.includes('记录 39')`);

  assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollWidth<=innerWidth+1'),true);
  assert.equal(await evaluate("[...document.querySelectorAll('iframe.tab-content-frame')].every(f=>f.contentDocument.scrollingElement.scrollHeight<=f.clientHeight+1)"),true);
  for(const owner of owners)assert.equal(await owner.evaluate('document.scrollingElement.scrollHeight<=innerHeight+1&&document.scrollingElement.scrollWidth<=innerWidth+1'),true);
  const dir=`${REVIEW_EVIDENCE}/closing-v14`;await mkdir(dir,{recursive:true});
  const capture=async(name:string)=>{const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(`${dir}/${name}.png`,Buffer.from(shot.data,'base64'));};
  await capture('dense-desktop');
  await b.reloadPage();await waitFor("document.querySelectorAll('[data-tab-pane]').length===3");
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:500,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate("localStorage.setItem('molis-work:theme','dark');window.dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'dark'}))");
  await click('[data-layout-open]');await click('[data-focus-pane]');
  await waitFor("[...document.querySelectorAll('[data-tab-pane]')].filter(p=>p.getBoundingClientRect().width>0).length===1");
  assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1 && document.scrollingElement.scrollWidth<=innerWidth+1'),true);
  await capture('dense-mobile-dark');
});
