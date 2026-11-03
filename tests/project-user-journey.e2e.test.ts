import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { GoalProjectApplication } from './fixtures/goal-application.js';
import { boardSnapshot } from "./fixtures/goal-application.js";
import { pluginFrameBrowser } from './fixtures/plugin-frame-browser.js';

for (const [width,height] of [[1440,900],[390,640]]) {
  test(`Project journey ${width}: create Goal, record note, create Feed task, read and process Inbox`, {timeout:90000}, async t => {
    const b=await openGoalBrowser(t,true);if(!b)return;
    const {command,sessionId,navigate,origin,projectId,evaluate,click,waitFor,showGoalStageList}=b;
    const feedView=await pluginFrameBrowser(t,b,'feed'),inbox=await pluginFrameBrowser(t,b,'inbox');
    await addProjectPlugin(b.web, projectId!, 'feed');
    const prefix=`${origin}/projects/${projectId}`;
    await b.setViewport(width,height);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await navigate(()=>command('Page.navigate',{url:prefix+'/'},sessionId));
    const directory=async()=>{if(width<760&&await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && Boolean(document.querySelector('[data-directory-show]')?.getClientRects().length)"))await click('[data-directory-show]');};
    const plugin=async(id:string)=>{await directory();await click(`[data-plugin-id=${id}]`);if(width<760&&await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');};
    const fill=async(selector:string,text:string,owner?:typeof feedView)=>{await (owner?owner.click:click)(selector);await command('Input.insertText',{text},sessionId);};
    const capture=async(name:string)=>{const dir=`${REVIEW_EVIDENCE}/journeys-v13`;await mkdir(dir,{recursive:true});const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(`${dir}/${name}-${width}.png`,Buffer.from(shot.data,'base64'));};
    await plugin('goals');
    await evaluate("document.querySelector('[data-goal-collapse]')?.click()");
    await showGoalStageList();
    if(width<760 && await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');
    await evaluate("document.querySelector('[data-goal-stage-chrome] [data-open-create]')?.click()");
    await fill('[data-create-form] [name=title]','完成跨页面工作流验收');
    await fill('[data-create-form] [name=outcome]','创建、记录、阅读与处理可以顺畅连续完成');
    await navigate(()=>click('[data-create-form] button[type=submit]'));
    const goalId=boardSnapshot(b.store, DEMO_PROJECT_ID).goals.find(g=>g.title==='完成跨页面工作流验收')!.goal_id;
    if(await evaluate("document.querySelector('[data-goal-frame-surface]')?.hidden!==false")){
      await showGoalStageList();
      await b.openGoalFrame(`[data-select-goal="${goalId}"]`);
    }
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.hidden===false && document.querySelector('[data-goal-frame-surface]').dataset.frameGoal==="+JSON.stringify(goalId));
    assert.equal(boardSnapshot(b.store, DEMO_PROJECT_ID).goals.find(g=>g.goal_id===goalId)?.title,'完成跨页面工作流验收');
    if (width < 760) {
      assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"), false, 'creation opens the new Goal content');
      // craft-finish round 4 retired the narrow directory drawer: plugins are reached from the bottom bar's picker,
      // and a reload returns to the same Goal content.
      assert.equal(await evaluate("Boolean(document.querySelector('[data-plugin-picker-toggle]')?.getClientRects().length)"), true, 'narrow navigation is the bottom-bar plugin picker');
      await b.reloadPage();
      await waitFor("document.querySelector('[data-goal-frame-surface]')?.hidden===false && document.querySelector('[data-goal-frame-surface]').dataset.frameGoal==="+JSON.stringify(goalId));
    }
    await click('[data-frame-goal-work]');
    if(await evaluate("document.querySelector('[data-goal-details-toggle]').getAttribute('aria-expanded')==='false'"))await click('[data-goal-details-toggle]');
    await click('[data-record-menu] > summary');await click('[data-record-menu] [data-event-form-open=note]');
    await fill('[data-event-form=note] [name=note]','已经从项目首页创建目标，接下来核对信息处理路径。');
    await click('[data-event-form=note] button[type=submit]');
    await waitFor("!document.querySelector('[data-event-form=note]') || document.querySelector('[data-event-form=note]').hidden || document.querySelector('[data-event-form=note]').getClientRects().length===0");
    await waitFor("document.querySelector('[data-event-timeline]').textContent.includes('已经从项目首页创建目标')");
    const app=new GoalProjectApplication(b.store);
    assert.match(JSON.stringify(app.goalEvents.listEvents(DEMO_PROJECT_ID,goalId, {limit: 20})),/已经从项目首页创建目标/);
    await capture('goal-recorded');
    await plugin('feed');await feedView.click('[data-feed-source-rail] [data-feed-add-toggle]');
    await feedView.click('[data-feed-choose-kind=custom_rss]');
    await fill('[data-feed-add-name]','团队设计资料',feedView);
    await fill('[data-feed-source-value=custom_rss]','https://example.com/journey.xml',feedView);
    await feedView.click('[data-feed-source-register]');
    await feedView.waitFor("document.querySelector('[data-feed-sources-dialog]').hidden && [...document.querySelectorAll('[data-feed-task]')].some(e=>e.textContent.includes('团队设计资料'))");
    const sourceId=await feedView.evaluate<string>("[...document.querySelectorAll('[data-feed-task]')].find(e=>e.textContent.includes('团队设计资料')).dataset.feedTask");
    const feed=createLocalFeedApplication(b.store.db),source=feed.sources.get(DEMO_PROJECT_ID,sourceId);
    // External fetching is outside this UI journey; the source above is created by the actual form.
    const item=feed.ingestItem({source,externalId:'journey-item',title:'评审工作区的用户动线',summary:'明确需要确认的页面与处理动作。',body:'这是一条隔离验收资料。\n'+Array.from({length:30},(_,i)=>`检查 ${i+1}：内容在所属组件内滚动，操作入口保持可见。`).join('\n'),occurredAt:new Date().toISOString(),attention:false}).item;
    await b.reloadPage();
    if(width<760&&await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');
    await feedView.click(`[data-feed-entry-id="${item.item_id}"]`);
    await feedView.waitFor(`document.querySelector('[data-feed-detail="${item.item_id}"] [data-feed-action=inbox]')`);
    // Opening marks the item read with its own request; give it a bounded moment to land.
    for(let i=0;i<40&&!feed.getItem(DEMO_PROJECT_ID,item.item_id).read_at;i++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(feed.getItem(DEMO_PROJECT_ID,item.item_id).read_at);
    await feedView.click(`[data-feed-detail="${item.item_id}"] [data-feed-action=inbox]`);
    const inboxDeadline=Date.now()+10_000;
    while(!feed.listInboxEntries(DEMO_PROJECT_ID).some(entry=>entry.subject_type==='feed_item'&&entry.subject_id===item.item_id)){
      assert.ok(Date.now()<inboxDeadline,'the real Feed action commits its Inbox reference before leaving the source owner');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    await plugin('inbox');
    if(width<760&&await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');
    await inbox.waitFor("[...document.querySelectorAll('[data-inbox-row]')].some(row=>row.textContent.includes('评审工作区的用户动线'))");
    await inbox.evaluate("[...document.querySelectorAll('[data-inbox-row]')].find(row=>row.textContent.includes('评审工作区的用户动线'))?.click()");
    await inbox.waitFor("document.querySelector('[data-inbox-detail]:not([hidden]) [data-inbox-action=done]')");
    assert.match(await inbox.evaluate<string>("document.querySelector('[data-inbox-detail]:not([hidden])').textContent"),/评审工作区的用户动线/);
    await capture('inbox-from-feed');
    await inbox.click('[data-inbox-open-feed]');
    // T405-UI-04: a visible Feed can replace its rows while refreshing. Read visibility and text in one DOM turn.
    const detailDeadline=Date.now()+10_000;
    let openedDetail: {text:string}|null=null, detailFailure:unknown;
    while(Date.now()<detailDeadline){
      try{
        openedDetail=await feedView.evaluate<{text:string}|null>(`(()=>{
          const detail=document.querySelector('[data-feed-detail="${item.item_id}"]');
          return detail?.getClientRects().length>0?{text:detail.textContent}:null;
        })()`);
        if(openedDetail)break;
      }catch(error){detailFailure=error;}
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    assert.ok(openedDetail,new Error('the same Feed item detail is visible within 10000ms',{cause:detailFailure}));
    assert.match(openedDetail.text, /这是一条隔离验收资料/);
    await plugin('inbox');
    if (width < 760 && await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')")) await click('[data-directory-toggle]');
    await inbox.evaluate("[...document.querySelectorAll('[data-inbox-row]')].find(row=>row.textContent.includes('评审工作区的用户动线'))?.click()");
    const entryId=await inbox.evaluate<string>("document.querySelector('[data-inbox-detail]:not([hidden])').dataset.inboxDetail");
    await inbox.click('[data-inbox-detail]:not([hidden]) [data-inbox-action=done]');
    await inbox.waitFor(`document.querySelector('[data-inbox-stage-group="history"] [data-inbox-entry-id="${entryId}"]') && !document.querySelector('[data-inbox-stage-group="active"] [data-inbox-entry-id="${entryId}"]') && document.querySelector('[data-inbox-stage-shell]').dataset.expanded === 'false'`);
    const history=await (await fetch(prefix+'/api/plugins/io.molis.work.inbox/entries?filter=history')).json();
    assert.equal(history.entries.find((e:{entry_id:string})=>e.entry_id===entryId)?.status,'done');
    assert.equal(feed.getItem(DEMO_PROJECT_ID,item.item_id).body,item.body);
    await b.reloadPage();assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1'),true);
    assert.match(JSON.stringify(app.goalEvents.listEvents(DEMO_PROJECT_ID,goalId, {limit: 20})),/已经从项目首页创建目标/);
  });
}
