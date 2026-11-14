import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

for (const [width,height] of [[1024,400],[390,500]]) {
  test(`Relation editor ${width}: directional create, failure recovery and deactivate cancellation`,{timeout:60000},async t=>{
    const b=await openGoalBrowser(t,true);if(!b)return;
    const {command,sessionId,origin,navigate,click,evaluate,waitFor,projectId}=b;
    // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
    const prefix=`/projects/${projectId}`;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await navigate(()=>command('Page.navigate',{url:origin+prefix+'/goals/CORE'},sessionId));
    await click('[data-frame-goal-work]');
    if(await evaluate("document.querySelector('[data-goal-details-toggle]').getAttribute('aria-expanded')==='false'"))await click('[data-goal-details-toggle]');
    if(await evaluate("!document.querySelector('[data-goal-info]').open"))await click('[data-goal-info] > summary');
    await click('[data-event-reader=description]');
    await click('#goal-factor-tab-relations-CORE');
    await click('[data-relation-editor] > summary');
    await evaluate(`{const f=document.querySelector('[data-relation-form]');f.elements.target_goal_id.value='PLATFORM';f.elements.relation_intent.value='enables';f.elements.relation_intent.dispatchEvent(new Event('change',{bubbles:true}));f.elements.reason.value='平台交付需要核心结果，确认方向。';const original=fetch;window.relationWrites=0;window.fetch=(url,o)=>{if(o?.method==='POST'&&String(url).endsWith('/relations')){window.relationWrites++;if(window.relationWrites===1)return Promise.reject(new TypeError('Failed to fetch'));return new Promise(resolve=>window.releaseRelation=async()=>{const r=await original(url,o);window.relationResult=await r.clone().json();resolve(r)});}return original(url,o)};}`);
    await click('[data-relation-form] button[type=submit]');
    await waitFor("!document.querySelector('[data-relation-error]').hidden");
    assert.equal(await evaluate("document.querySelector('[data-relation-form] [name=reason]').value"),'平台交付需要核心结果，确认方向。');
    await click('[data-relation-form] button[type=submit]');
    assert.equal(await evaluate("document.querySelector('[data-relation-form]').getAttribute('aria-busy')"),'true');
    await evaluate("document.querySelector('[data-relation-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    assert.equal(await evaluate('window.relationWrites'),2);
    await evaluate('window.releaseRelation()');
    assert.ok(await evaluate('!window.relationResult.error'), await evaluate<string>('JSON.stringify(window.relationResult)'));
    await waitFor("[...document.querySelectorAll('.relation-record')].some(e=>e.textContent.includes('平台交付需要核心结果'))");
    const rows=boardSnapshot(b.store, DEMO_PROJECT_ID).relations.filter(r=>r.reason==='平台交付需要核心结果，确认方向。');
    assert.equal(rows.length,1);assert.equal(rows[0].from_goal_id,'PLATFORM');assert.equal(rows[0].to_goal_id,'CORE');
    const record=`#relation-${rows[0].relation_id}`;
    await click(record+' [data-relation-deactivate-open]');
    await click(record+' [data-relation-deactivate-cancel]');
    assert.equal(boardSnapshot(b.store, DEMO_PROJECT_ID).relations.find(r=>r.relation_id===rows[0].relation_id)?.state,'active');
    await click(record+' [data-relation-deactivate-open]');
    await click(record+' [name=reason]');await command('Input.insertText',{text:'本次验收关系已不再需要。'},sessionId);
    await click(record+' button[type=submit]');
    await waitFor(`!document.querySelector('${record} [data-relation-deactivate-open]')`);
    assert.equal(boardSnapshot(b.store, DEMO_PROJECT_ID).relations.find(r=>r.relation_id===rows[0].relation_id)?.state,'inactive');
    await b.reloadPage();assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1'),true);
  });
}
