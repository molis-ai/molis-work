import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { DEMO_BOARD_ID } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';

for (const [width, height, scope] of [[1024,400,"global"],[390,500,"global"],[1024,400,"project"],[390,500,"project"]] as const) {
  test(`Planning editor ${scope} ${width}: fixed actions, failed draft, pending protection and saved version`, {timeout:60000}, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    const {command,sessionId,navigate,origin,evaluate,click,waitFor} = b;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    const prefix=scope==='project'?`/projects/${b.projectId}`:'';
    await navigate(()=>command('Page.navigate',{url:origin+prefix+'/settings/planning/new'},sessionId));
    await waitFor("document.querySelector('[data-planning-edit-form]')");
    const bounds = await evaluate<{top:number,bottom:number,rootScroll:boolean}>(`(()=>{const r=document.querySelector('.planning-edit-footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,rootScroll:document.scrollingElement.scrollHeight>innerHeight+1}})()`);
    assert.ok(bounds.top>=0 && bounds.bottom<=height, JSON.stringify(bounds));
    assert.equal(bounds.rootScroll,false);
    await evaluate("{const f=document.querySelector('[data-planning-edit-form]');f.elements.name.value='校验草稿';f.elements.summary.value='字段检查';f.elements.instructions.value='说明'}");
    await click('[data-planning-edit-form] button[type=submit]');
    assert.match(await evaluate<string>("document.querySelector('[data-planning-method-error]').textContent"),/规划步骤/);
    assert.equal(await evaluate('document.activeElement.name'),'steps');
    await evaluate(`{const f=document.querySelector('[data-planning-edit-form]');f.elements.name.value='持续交付验收';f.elements.summary.value='验证保存与恢复';f.elements.instructions.value='先确认结果，再记录完成证据。';for(const name of ['steps','coverage_label','coverage_question','dependency_statement','dependency_direction'])f.querySelector('[name='+name+']').value='明确输入与产出';const original=fetch;window.saves=0;window.fetch=(url,options)=>{if(options?.method==='POST'&&String(url).endsWith('/api/settings/planning-methods')){window.saves++;if(window.saves===1)return Promise.reject(new TypeError('Failed to fetch'));return new Promise(resolve=>window.releaseSave=()=>resolve(original(url,options)));}return original(url,options)};}`);
    await click('[data-planning-edit-form] button[type=submit]');
    await waitFor("!document.querySelector('[data-planning-method-error]').hidden");
    assert.equal(await evaluate("document.querySelector('[name=name]').value"),'持续交付验收');
    assert.match(await evaluate<string>("document.querySelector('[data-planning-method-error]').textContent"),/输入已保留/);
    const dir='.impeccable/review/closing-v14';await mkdir(dir,{recursive:true});
    const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(`${dir}/planning-error-${scope}-${width}.png`,Buffer.from(shot.data,'base64'));
    await click('[data-planning-edit-form] button[type=submit]');
    assert.equal(await evaluate("document.querySelector('[data-planning-edit-form]').getAttribute('aria-busy')"),'true');
    assert.equal(await evaluate("document.querySelector('.planning-edit-fields').inert"),true);
    assert.equal(await evaluate("document.querySelector('.planning-edit-footer a').getAttribute('aria-disabled')"),'true');
    await click('.planning-edit-footer a');await click('.planning-back');
    assert.equal(await evaluate("!!document.querySelector('[data-planning-edit-form]')"),true);
    await evaluate("document.querySelector('[data-planning-edit-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    assert.equal(await evaluate('window.saves'),2);
    await navigate(()=>evaluate('window.releaseSave()'));
    const methods=(await (await fetch(origin+prefix+'/api/settings/planning-methods')).json()).methods;
    const saved=methods.filter((m:{name:string})=>m.name==='持续交付验收');
    assert.equal(saved.length,1);assert.equal(saved[0].version,1);
    await b.reloadPage();assert.match(await evaluate<string>("document.querySelector('.settings-content').textContent"),/持续交付验收/);
    await navigate(()=>command('Page.navigate',{url:origin+prefix+'/settings/planning/'+saved[0].method_id+'/edit'},sessionId));
    await evaluate("document.querySelector('[name=name]').value='取消后不应写入的草稿'");
    await navigate(()=>click('.planning-edit-footer a'));
    assert.match(await evaluate<string>("document.querySelector('.planning-detail h1').textContent"),/持续交付验收/);
    const unchanged=(await (await fetch(origin+prefix+'/api/settings/planning-methods')).json()).methods.find((m:{method_id:string})=>m.method_id===saved[0].method_id);
    assert.equal(unchanged.version,1);assert.equal(unchanged.name,'持续交付验收');
  });
}

for (const [width,height] of [[1024,400],[390,500]]) {
  test(`Relation editor ${width}: directional create, failure recovery and deactivate cancellation`,{timeout:60000},async t=>{
    const b=await openGoalBrowser(t);if(!b)return;
    const {command,sessionId,origin,navigate,click,evaluate,waitFor}=b;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    await navigate(()=>command('Page.navigate',{url:origin+'/goals/CORE'},sessionId));
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
    const rows=b.store.snapshot(DEMO_BOARD_ID).relations.filter(r=>r.reason==='平台交付需要核心结果，确认方向。');
    assert.equal(rows.length,1);assert.equal(rows[0].from_goal_id,'PLATFORM');assert.equal(rows[0].to_goal_id,'CORE');
    const record=`#relation-${rows[0].relation_id}`;
    await click(record+' [data-relation-deactivate-open]');
    await click(record+' [data-relation-deactivate-cancel]');
    assert.equal(b.store.snapshot(DEMO_BOARD_ID).relations.find(r=>r.relation_id===rows[0].relation_id)?.state,'active');
    await click(record+' [data-relation-deactivate-open]');
    await click(record+' [name=reason]');await command('Input.insertText',{text:'本次验收关系已不再需要。'},sessionId);
    await click(record+' button[type=submit]');
    await waitFor(`!document.querySelector('${record} [data-relation-deactivate-open]')`);
    assert.equal(b.store.snapshot(DEMO_BOARD_ID).relations.find(r=>r.relation_id===rows[0].relation_id)?.state,'inactive');
    await b.reloadPage();assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1'),true);
  });
}
