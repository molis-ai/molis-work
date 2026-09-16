import assert from 'node:assert/strict';
import test from 'node:test';
import { GoalProjectApplication, DEMO_BOARD_ID } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';

for(const [width,height] of [[1024,400],[390,500]]) {
  test(`Type and requirement ${width}: second write failure preserves one type and retries requirement`,{timeout:60000},async t=>{
    const b=await openGoalBrowser(t);if(!b)return;
    const {command,sessionId,origin,navigate,click,evaluate,waitFor}=b;
    const app=new GoalProjectApplication(b.store);
    const id=app.goalEvents.createIntent({board_id:DEMO_BOARD_ID,title:'类型与要求的组合保存',outcome:'失败可继续完成',actor_id:'web-user',actor_kind:'user',idempotency_key:'partial-type'}).goal.goal_id;
    const state=()=>app.goalEvents.readState(DEMO_BOARD_ID,id);
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await navigate(()=>command('Page.navigate',{url:origin+'/goals/'+id},sessionId));
    await click('[data-frame-goal-work]');
    if(await evaluate("document.querySelector('[data-goal-details-toggle]').getAttribute('aria-expanded')==='false'"))await click('[data-goal-details-toggle]');
    if(await evaluate("!document.querySelector('[data-goal-info]').open"))await click('[data-goal-info] > summary');
    await click('.goal-more > summary');await click('.goal-more [data-event-reader=planning]');
    await click('[data-event-panel=planning] [data-event-reader=type]');
    await evaluate(`{const f=document.querySelector('[data-event-form=type]');f.elements.name.value='交付证据';f.elements.purpose.value='保存可复查结果';f.elements.field_name.value='内容';f.elements.add_requirement.checked=true;f.elements.add_requirement.dispatchEvent(new Event('change',{bubbles:true}));f.elements.requirement_statement.value='结果经过实际验证';const original=fetch;window.requirementAttempts=0;window.fetch=(url,o)=>{if(o?.method==='POST'&&String(url).endsWith('/event-agree')){window.requirementAttempts++;if(window.requirementAttempts===1)return ${width===390 ? "Promise.resolve(new Response(JSON.stringify({error:'完成要求写入失败'}),{status:400,headers:{'content-type':'application/json'}}))" : "Promise.reject(new TypeError('Failed to fetch'))"};}return original(url,o)};}`);
    await click('[data-event-form=type] button[type=submit]');
    await waitFor("!document.querySelector('[data-event-form=type] [data-form-status]').hidden && document.querySelector('[data-event-form=type]').getAttribute('aria-busy')!=='true'");
    assert.equal(state().config.types.filter(x=>x.name==='交付证据').length,1);
    assert.equal(state().requirements.length,0);
    assert.match(await evaluate<string>("document.querySelector('[data-event-form=type] [data-form-status]').textContent"),/类型已登记/);
    assert.equal(await evaluate("document.querySelector('[name=requirement_statement]').value"),'结果经过实际验证');
    await click('[data-event-form=type] button[type=submit]');
    await waitFor("!document.querySelector('[data-event-form=type]') || document.querySelector('[data-event-form=type]').hidden");
    const saved=state();assert.equal(saved.config.types.length,1);assert.equal(saved.requirements.length,1);
    assert.equal(saved.requirements[0].statement,'结果经过实际验证');assert.deepEqual(saved.requirements[0].bound_type_ids,[saved.config.types[0].type_id]);
    await b.reloadPage();assert.equal(state().config.types.length,1);assert.equal(state().requirements.length,1);
  });
}
