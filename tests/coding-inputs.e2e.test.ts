import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openGoalBrowser} from './fixtures/goal-browser.js';

// PCS-S6, S-65: the real Coding client retains dirty text through HTTP conflicts and a window reload.
test('Coding compares another writer against the original editor premise before saving or adopting', {timeout:90000}, async t=>{
 const browser=await openGoalBrowser(t,'seeded');if(!browser)return;
 const {command,sessionId,evaluate,waitFor,click,navigate,reloadPage,origin,projectId,controlToken}=browser;
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.inputErrors=[];addEventListener('error',e=>inputErrors.push(e.message));addEventListener('unhandledrejection',e=>inputErrors.push(String(e.reason)));`},sessionId);
 await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/`},sessionId));
 await click('[data-plugin-strip] [data-plugin-id="coding"]');await waitFor("document.querySelector('[data-coding-model] option')");
 await click('[data-coding-new]');await waitFor("document.querySelector('[data-coding-session]') && !document.querySelector('[data-coding-task]').disabled");
 const id=await evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
 const path=`/projects/${projectId}/api/plugins/io.molis.work.coding/sessions/${id}`;
 const request=async(body?:object)=>{
  const response=await fetch(origin+path,{method:body?'PATCH':'GET',headers:{origin,'content-type':'application/json','x-molis-work-control-token':controlToken,'x-molis-work-idempotency-key':randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data as {draft:string;input_revision:number;question_drafts:object};
 };
 const type=async(text:string)=>evaluate(`(()=>{const input=document.querySelector('[data-coding-task]');input.focus();input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const refresh=()=>evaluate(`dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
 const input="document.querySelector('[data-coding-task]')";
 await evaluate(`${input}.blur()`);
 await request({draft:'remote initial',expected_input_revision:0});await refresh();await waitFor(`${input}.value==='remote initial'`);
 await type('my unsent text');
 await request({draft:'another device changed this',expected_input_revision:1});await refresh();
 await waitFor("document.querySelector('[data-coding-input-compare]')");
 assert.equal(await evaluate(`${input}.value`),'my unsent text');assert.equal((await request()).draft,'another device changed this');
 await reloadPage();await click('[data-plugin-strip] [data-plugin-id="coding"]');
 await waitFor(`document.querySelector('[data-coding-session="${id}"]')`);
 await click(`[data-coding-session="${id}"]`);await waitFor("document.querySelector('[data-coding-input-compare]')");
 assert.equal(await evaluate(`${input}.value`),'my unsent text','reload does not bless old cached text with a fresh server revision');
 await click('[data-coding-input-compare]');await waitFor("document.querySelector('[data-coding-input-dialog][open]')");
 assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-coding-input-dialog] textarea')].map(x=>x.value)"),['my unsent text','another device changed this']);
 // All standard display sizes/themes retain an internally scrolling form, visible actions and a bounded dialog.
 for(const width of [1440,1024,390])for(const theme of ['light','dark']){
  await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const layout=await evaluate<{left:number;right:number;top:number;bottom:number;buttons:boolean}>(`(()=>{const d=document.querySelector('[data-coding-input-dialog]'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,buttons:[...d.querySelectorAll('button')].every(b=>{const x=b.getBoundingClientRect();return x.width>0&&x.left>=0&&x.right<=innerWidth&&x.top>=0&&x.bottom<=innerHeight;})};})()`);
  assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=850&&layout.buttons,JSON.stringify({width,theme,layout}));
  const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);
  await writeFile(join(tmpdir(),`molis-coding-input-review-20261019-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
 }
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:850,deviceScaleFactor:1,mobile:false},sessionId);
 // Server changes after the review: saving uses the version shown in that review, not the latest poll.
 await request({draft:'third revision after review',expected_input_revision:2});
 await click('[data-coding-input-dialog] .mw-form__footer button:nth-of-type(3)');
 await waitFor("!document.querySelector('[data-coding-input-dialog] [role=alert]').hidden");
 assert.equal((await request()).draft,'third revision after review');assert.equal(await evaluate(`${input}.value`),'my unsent text');
 await click('[data-coding-input-dialog] .mw-form__footer button:nth-of-type(1)');
 await waitFor("!document.querySelector('[data-coding-input-dialog]')");
 await click('[data-coding-input-compare]');await waitFor("document.querySelector('[data-coding-input-dialog][open]')");
 await click('[data-coding-input-dialog] .mw-form__footer button:nth-of-type(3)');
 await waitFor("!document.querySelector('[data-coding-input-dialog]')");
 assert.equal((await request()).draft,'my unsent text');assert.equal((await request()).input_revision,4);
 await evaluate(`${input}.blur()`);await request({draft:'',expected_input_revision:4});await refresh();await waitFor(`${input}.value===''`);
 await type('keep until explicit adoption');await request({draft:'explicitly selected remote text',expected_input_revision:5});await refresh();
 await waitFor("document.querySelector('[data-coding-input-compare]')");
 await click('[data-coding-input-compare]');await waitFor("document.querySelector('[data-coding-input-dialog][open]')");
 await click('[data-coding-input-dialog] .mw-form__footer button:nth-of-type(2)');await waitFor("!document.querySelector('[data-coding-input-dialog]')");
 assert.equal(await evaluate(`${input}.value`),'explicitly selected remote text');assert.equal((await request()).input_revision,6,'adoption reads but does not write another revision');
 // A queued old body must not acquire a fresh background premise after another writer wins.
 const hold=async(afterResponse:boolean)=>evaluate(`(()=>{const original=fetch;window.inputHeld=false;let release;const gate=new Promise(resolve=>release=resolve);window.releaseInputWrite=()=>{fetch=original;release();};let once=true;
  fetch=async(...args)=>{if(once&&String(args[0]).endsWith(${JSON.stringify(path)})&&args[1]?.method==='PATCH'){once=false;${afterResponse?'const response=await original(...args);':''}window.inputHeld=true;await gate;return ${afterResponse?'response':'original(...args)'};}return original(...args);};})()`);
 await hold(false);await type('first pending save');await waitFor('inputHeld');await type('newer local typing');
 await request({draft:'concurrent cloud input',expected_input_revision:6});await refresh();await waitFor("document.querySelector('[data-coding-input-compare]')");
 await evaluate('releaseInputWrite()');
 await click('[data-coding-input-compare]');await waitFor("document.querySelector('[data-coding-input-dialog][open]')");
 assert.equal(await evaluate("document.querySelector('[data-coding-input-dialog] textarea').value"),'newer local typing');
 await click('[data-coding-input-dialog] .mw-form__footer button:nth-of-type(3)');await waitFor("!document.querySelector('[data-coding-input-dialog]')");
 assert.equal((await request()).draft,'newer local typing');assert.equal((await request()).input_revision,8);
 // Own writes queued behind an ACK advance only through that ACK, preserving text typed while it was in flight.
 await hold(true);await type('own write before ACK');await waitFor('inputHeld');await type('own later input');
 await evaluate('releaseInputWrite()');
 await waitFor(`document.querySelector('[data-coding-draft-status]').textContent.includes('草稿已保存')`);
 const final=await request();assert.equal(final.draft,'own later input');assert.equal(final.input_revision,10);
 assert.equal(await evaluate(`${input}.value`),'own later input');
 assert.deepEqual(await evaluate('inputErrors'),[]);
 // Malformed persisted answers remain intact rather than being treated as an empty remote draft.
 await evaluate(`window.corruptQuestionsKey='molis-coding-draft:'+document.querySelector('[data-coding-workbench]').dataset.codingPrefix+':'+${JSON.stringify(id)}+':questions';sessionStorage.setItem(corruptQuestionsKey,'[]')`);
 await reloadPage();await click('[data-plugin-strip] [data-plugin-id="coding"]');await waitFor(`document.querySelector('[data-coding-session="${id}"]')`);
 await click(`[data-coding-session="${id}"]`);await waitFor("document.querySelector('[data-coding-status]').textContent.includes('原内容已保留')");
 assert.equal(await evaluate(`sessionStorage.getItem('molis-coding-draft:'+document.querySelector('[data-coding-workbench]').dataset.codingPrefix+':'+${JSON.stringify(id)}+':questions')`),'[]');
 assert.equal((await request()).draft,'own later input');
});
