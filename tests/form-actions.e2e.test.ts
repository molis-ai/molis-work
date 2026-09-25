import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const width of [1440,390]) test(`Form ${width}px: author, preview, historical answers, conflicts and fixed Artifact recovery`, {timeout:100_000}, async t => {
  let modelCalls=0;
  const browser=await openGoalBrowser(t,true,undefined,async prompt=>{modelCalls++;assert.match(prompt,/常用工具/);return "你最常用的工具是什么？";});if(!browser)return;
  const {command,sessionId,evaluate,waitFor,navigate,click,reloadPage,origin,projectId,homeDirectory}=browser;
  const read=()=>{const store=openFormStore(homeDirectory);try{const forms=store.list(projectId!);return {forms,submissions:forms[0]?store.listSubmissions(forms[0].id,projectId!):[]};}finally{store.close();}};
  const idle=()=>waitFor("document.querySelector('[data-form=workbench]').getAttribute('aria-busy') === 'false'");
  const saved=()=>waitFor("['已保存','已发布'].includes(document.querySelector('[data-form-editor-status]').textContent)");
  const input=async(selector:string,value:string)=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const open=async()=>{
    await waitFor("document.querySelector('[data-plugin-id=form]')");
    if(await evaluate('document.body.dataset.desktopSurface')!=='form'){
      if(width===390)await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=form]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'form'");
  };
  const output=new URL('../.impeccable/review/action-service/',import.meta.url);await mkdir(output,{recursive:true});
  const screenshot=async(name:string)=>{
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await writeFile(new URL(`form-${name}-${width}.png`,output),Buffer.from((await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  };
  await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:950,deviceScaleFactor:1,mobile:width===390},sessionId);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/?openPlugin=form`},sessionId));await open();
  await click('[data-form-new]');await idle();const id=read().forms[0]!.id;
  await input('[data-form-title]','实际问卷');await saved();
  // Each question is created by the real editor, including stable option IDs.
  for(const type of ['text','singleChoice','multiChoice','dropdown','rating','date']){
    await evaluate(`(()=>{const node=document.querySelector('[data-form-question-type]');node.value=${JSON.stringify(type)};node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('[data-form-add-question]');await idle();
    await input('[data-form-question]:last-child [data-question-title]',type==='text'?'原始问题':type);
    if(type==='text')await click('[data-form-question]:last-child [data-question-required]');
    if(['singleChoice','multiChoice','dropdown'].includes(type)){
      await input('[data-form-question]:last-child [data-option-label]','是');
      await input('[data-form-question]:last-child .form-option-row:nth-child(2) [data-option-label]','否');
    }
    await saved();
  }
  assert.equal(read().forms[0]!.questions.length,6);
  await evaluate("document.querySelector('[data-form-pane=editor]').scrollTop=0");
  assert.ok(await evaluate("document.querySelector('[data-question-title]').getBoundingClientRect().width >= 180"));
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
  await screenshot('editor');
  // A rejected one-option draft must remain editable and resume saving once repaired.
  const choice='[data-form-question]:nth-child(2)';
  await click(choice+' [data-option-remove]');await idle();
  await waitFor("document.querySelector('[data-form-editor-status]').textContent === '保存失败'");
  assert.equal(read().forms[0]!.questions[1]!.options!.length,2);
  await click(choice+' [data-option-add]');await idle();
  await input(choice+' .form-option-row:last-child [data-option-label]','是');await saved();
  assert.equal(await evaluate("document.querySelector('[data-form-note]').hidden"),true);
  const originalQuestions=read().forms[0]!.questions;
  // Real save responses are delayed; subsequent typing must survive and be committed after the first acknowledgement.
  await evaluate(`(()=>{const original=window.fetch;window.formSaveRequests=0;window.fetch=async(url,init)=>{
    const response=await original(url,init);
    if(init?.method==='POST' && new URL(url,location.href).pathname==='/api/plugins/form/${id}'){
      window.formSaveRequests++;if(window.formSaveRequests===1)await new Promise(resolve=>window.releaseFormSave=resolve);
    }return response;
  };window.restoreFormFetch=()=>window.fetch=original;})()`);
  await input('[data-form-title]','第一笔');await waitFor("typeof window.releaseFormSave === 'function'");
  await input('[data-form-title]','第二笔');assert.equal(read().forms[0]!.title,'第一笔');
  await evaluate('window.releaseFormSave()');await saved();assert.equal(read().forms[0]!.title,'第二笔');assert.equal(await evaluate('window.formSaveRequests'),2);
  await evaluate('window.restoreFormFetch()');
  await click('[data-form-tab=preview]');await idle();
  await click('[data-form-submit]');await idle();assert.equal(read().submissions.length,0);
  const answer=(type:string)=>`[data-answer-id="${originalQuestions.find(q=>q.type===type)!.id}"]`;
  await input(answer('text'),'这份答案需要保留');
  await click(answer('singleChoice')+' input[value="是"]');
  await click(answer('multiChoice')+' input[value="是"]');await click(answer('multiChoice')+' input[value="否"]');
  await input(answer('dropdown'),'否');await click(answer('rating')+' input[value="5"]');await input(answer('date'),'2026-09-25');
  assert.equal(await evaluate("document.querySelector('[data-form-note]').hidden"),true);
  await screenshot('preview');
  // Discard the response after the server really saved it. Retrying must reuse one submission.
  await evaluate(`(()=>{const original=window.fetch;let first=true;window.fetch=async(url,init)=>{const response=await original(url,init);
    if(first && new URL(url,location.href).pathname.endsWith('/submit')){first=false;throw new Error('fixture response lost');}return response;};window.restoreFormFetch=()=>window.fetch=original;})()`);
  await click('[data-form-submit]');await idle();assert.equal(read().submissions.length,1);
  await click('[data-form-submit]');await idle();assert.equal(read().submissions.length,1);
  await evaluate('window.restoreFormFetch()');
  assert.equal(read().submissions[0]!.questions![0]!.title,'原始问题');
  await screenshot('results');
  // Editing or removing a question cannot relabel or hide its earlier answer.
  await click('[data-form-tab=editor]');await idle();
  await input('[data-form-question] [data-question-title]','后来改题');await saved();
  await click('[data-form-tab=results]');await idle();
  const resultText=await evaluate<string>("document.querySelector('[data-form-result-list]').textContent");
  assert.match(resultText,/原始问题/);assert.doesNotMatch(resultText,/后来改题/);assert.match(resultText,/这份答案需要保留/);
  await click('[data-form-tab=editor]');await idle();
  await input('[data-form-ai-prompt]','本地问题');await click('[data-form-generate]');await idle();assert.equal(modelCalls,0);
  await input('[data-form-ai-prompt]','常用工具');await click('[data-form-generate-ai]');await idle();assert.equal(modelCalls,1);
  assert.equal(read().forms[0]!.questions.at(-1)!.title,'你最常用的工具是什么？');
  await click('[data-form-publish]');await idle();const share=read().forms[0]!.share_id;assert.ok(share);
  // Saving a stale editor keeps local input and cannot publish or navigate away.
  const editorOther=openFormStore(homeDirectory);try{editorOther.update(id,{title:'编辑冲突远端版本'},projectId!);}finally{editorOther.close();}
  const remoteVersion=read().forms[0]!.version;
  await input('[data-form-description]','必须保留的本地编辑');
  await waitFor("document.querySelector('[data-form-editor-status]').textContent === '保存失败'");
  await click('[data-form-publish]');await idle();
  await click('[data-form-back]');await idle();
  assert.equal(read().forms[0]!.version,remoteVersion);
  assert.equal(await evaluate("document.querySelector('[data-form-description]').value"),'必须保留的本地编辑');
  assert.equal(await evaluate("document.querySelector('[data-form-stage-workspace]').hidden"),false);
  await screenshot('editor-conflict');
  await click('[data-form-reload]');await waitFor("document.querySelector('[data-form-confirm]').open");
  await evaluate("document.querySelector('[data-form-confirm]').close('cancel')");await idle();
  assert.equal(await evaluate("document.querySelector('[data-form-description]').value"),'必须保留的本地编辑');
  await click('[data-form-reload]');await waitFor("document.querySelector('[data-form-confirm]').open");
  await click('[data-form-confirm] [data-confirm-ok]');await idle();
  assert.equal(await evaluate("document.querySelector('[data-form-title]').value"),'编辑冲突远端版本');
  assert.equal(await evaluate("document.querySelector('[data-form-note]').hidden"),true);
  // A stale preview is not submitted against a different questionnaire.
  await click('[data-form-tab=preview]');await idle();await input(answer('text'),'尚未提交的答案');
  const other=openFormStore(homeDirectory);try{other.update(id,{title:'其他客户端修改'},projectId!);}finally{other.close();}
  await click('[data-form-submit]');await idle();assert.equal(read().submissions.length,1);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(answer('text'))}).value`),'尚未提交的答案');
  await screenshot('conflict');
  await click('[data-form-reload]');await waitFor("document.querySelector('[data-form-confirm]').open");await click('[data-form-confirm] [data-confirm-ok]');await idle();
  await click('[data-form-tab=editor]');await idle();
  const db=openHomeSqliteDatabase(homeDirectory,'form');
  try{
    db.exec("CREATE TRIGGER fail_form_ui BEFORE UPDATE OF artifact_version ON forms WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    await click('[data-form-artifact-bar]');await idle();assert.equal(read().forms[0]!.publication_pending!.version,1);
    db.exec('DROP TRIGGER fail_form_ui');
    // Legacy answer has no historical snapshot; preserve unknown IDs explicitly in the result.
    db.prepare('INSERT INTO submissions (id,form_id,answers_json,submitted_at) VALUES (?,?,?,?)').run('old-answer',id,JSON.stringify({'removed-question':'历史回答'}),'2025-01-01T00:00:00Z');
  }finally{db.close();}
  assert.equal(await evaluate("document.querySelector('[data-form-artifact-bar]').textContent"),'恢复发布');
  await input('[data-form-description]','发布后继续编辑');await saved();await screenshot('recovery');
  assert.equal(await evaluate("document.querySelector('[data-form-note]').hidden"),true);
  assert.equal(await evaluate("document.querySelector('[data-form-publication-note]').hidden"),false);
  await click('[data-form-artifact-bar]');await idle();assert.equal(read().forms[0]!.artifact_version,1);assert.equal(read().forms[0]!.publication_pending,undefined);
  assert.equal(read().forms[0]!.description,'发布后继续编辑');assert.equal(read().forms[0]!.share_id,share);
  const denied=await evaluate<number>(`fetch('/api/plugins/form?project_id=${projectId}',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({project_id:'wrong',title:'denied'})}).then(r=>r.status)`);
  assert.equal(denied,403);assert.equal(read().forms.length,1);
  await reloadPage();await open();await waitFor("document.querySelector('[data-form-id]')");await click('[data-form-id]');await idle();
  await click('[data-form-tab=results]');await idle();
  assert.match(await evaluate<string>("document.querySelector('[data-form-result-list]').textContent"),/历史答卷未保存题目快照/);
  assert.match(await evaluate<string>("document.querySelector('[data-form-result-list]').textContent"),/removed-question.*历史回答/);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.form-result-legacy')).display"),'block');
  assert.equal(await evaluate("document.querySelector('[data-form-stage-workspace]').scrollLeft"),0);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
  await screenshot('history');
});

test('Form unavailable model keeps local question creation usable',{timeout:45_000},async t=>{
  const browser=await openGoalBrowser(t,true,undefined,null);if(!browser)return;
  const {command,sessionId,navigate,waitFor,evaluate,click,origin,projectId}=browser;
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/?openPlugin=form`},sessionId));
  await waitFor("document.querySelector('[data-plugin-id=form]')");
  if(await evaluate('document.body.dataset.desktopSurface')!=='form')await click('[data-plugin-strip] [data-plugin-id=form]');
  await click('[data-form-new]');await waitFor("document.querySelector('[data-form=workbench]').getAttribute('aria-busy') === 'false'");
  assert.equal(await evaluate("document.querySelector('[data-form-generate-ai]').disabled"),true);
  assert.match(await evaluate<string>("document.querySelector('[data-form-ai-reason]').textContent"),/模型/);
  await evaluate("document.querySelector('[data-form-ai-prompt]').value='手工问题'");await click('[data-form-generate]');
  await waitFor("document.querySelector('[data-question-title]')?.value === '手工问题'");
});
