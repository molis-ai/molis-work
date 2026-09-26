import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for(const width of [1440,390])test(`PPT ${width}px: slides, colors, download, save conflicts and publication recovery`,{timeout:100_000},async t=>{
  const browser=await openGoalBrowser(t,true,undefined,null);if(!browser)return;
  const {command,sessionId,evaluate,waitFor,navigate,click,reloadPage,origin,projectId,homeDirectory}=browser;
  const read=()=>{const store=openPptStore(homeDirectory);try{return store.list(projectId!);}finally{store.close();}};
  const idle=()=>waitFor("document.querySelector('[data-ppt=workbench]').getAttribute('aria-busy') === 'false'");
  const saved=()=>waitFor("document.querySelector('[data-ppt-editor-status]').textContent.endsWith('已保存')");
  const input=async(selector:string,value:string)=>evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const open=async()=>{
    await waitFor("document.querySelector('[data-plugin-id=ppt]')");
    if(await evaluate('document.body.dataset.desktopSurface')!=='ppt'){
      if(width===390)await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=ppt]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'ppt'");
  };
  const output=new URL('../.impeccable/review/action-service/',import.meta.url);await mkdir(output,{recursive:true});
  const screenshot=async(name:string)=>{
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await writeFile(new URL(`ppt-${name}-${width}.png`,output),Buffer.from((await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
  };
  await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:950,deviceScaleFactor:1,mobile:width===390},sessionId);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  await navigate(()=>command('Page.navigate',{url:`${origin}/projects/${projectId}/?openPlugin=ppt`},sessionId));await open();
  await click('[data-ppt-new]');await idle();const id=read()[0]!.id;
  await input('[data-ppt-title]','季度回顾');
  await input('[data-ppt-slide-title]','第一阶段');await input('[data-ppt-slide-bullets]','完成业务迁移\n验证真实路径');await input('[data-ppt-slide-notes]','放慢讲解\n回答提问');await saved();
  const firstId=read()[0]!.slides[0]!.id;
  await click('[data-ppt-add-slide]');await idle();await input('[data-ppt-slide-title]','接下来的工作');await input('[data-ppt-slide-bullets]','接通所有消费场景');await saved();
  const secondId=read()[0]!.slides[1]!.id;
  // Reordering a non-current slide must not copy the current slide fields into it.
  await click(`[data-slide-id="${firstId}"] [data-slide-select]`);await idle();
  await click(`[data-slide-id="${secondId}"] [data-slide-move="-1"]`);await idle();await saved();
  assert.deepEqual(read()[0]!.slides.map(s=>s.title),['接下来的工作','第一阶段']);
  assert.equal(await evaluate("document.querySelector('[data-ppt-slide-title]').value"),'接下来的工作');
  assert.equal(read()[0]!.slides[1]!.notes,'放慢讲解\n回答提问');
  const color=await evaluate<string>("document.querySelector('[data-ppt-color-primary] [data-ppt-swatch]:last-child').dataset.pptSwatch");
  await click('[data-ppt-color-primary] [data-ppt-swatch]:last-child');await idle();await saved();assert.equal(read()[0]!.color_primary,color.toLowerCase());
  await click('[data-ppt-add-slide]');await idle();await saved();assert.equal(read()[0]!.slides.length,3);
  await click('[data-ppt-slide-list] .ppt-slide-row:last-child [data-slide-remove]');await idle();await saved();assert.equal(read()[0]!.slides.length,2);
  // A delayed real save response cannot erase edits made while it is in flight.
  await evaluate(`(()=>{const original=window.fetch;window.pptSaveRequests=0;window.fetch=async(url,init)=>{
    const response=await original(url,init);if(init?.method==='POST'&&new URL(url,location.href).pathname==='/api/plugins/ppt/${id}'){
      window.pptSaveRequests++;if(window.pptSaveRequests===1)await new Promise(resolve=>window.releasePptSave=resolve);
    }return response;};window.restorePptFetch=()=>window.fetch=original;})()`);
  await input('[data-ppt-title]','第一次编辑');await waitFor("typeof window.releasePptSave === 'function'");
  await input('[data-ppt-title]','季度回顾');await input('[data-ppt-slide-notes]','新的备注\n第二行');
  await evaluate('window.releasePptSave()');await saved();assert.equal(read()[0]!.title,'季度回顾');assert.equal(read()[0]!.slides[0]!.notes,'新的备注\n第二行');
  assert.equal(await evaluate('window.pptSaveRequests'),2);await evaluate('window.restorePptFetch()');
  await evaluate("document.querySelector('.ppt-workspace').scrollTop=0");await screenshot('editor');
  const downloads=join(homeDirectory,'exports');await mkdir(downloads);await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  const moreClick = async (selector: string) => {
    if (!await evaluate("document.querySelector('[data-ppt-stage-workspace] .plugin-stage-more').open")) await click('[data-ppt-stage-workspace] .plugin-stage-more > summary');
    await click(selector);
  };
  await moreClick('[data-ppt-export]');await idle();
  const deadline=Date.now()+4000;let exported='';
  while(!exported){try{exported=await readFile(join(downloads,'季度回顾.json'),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(!exported){if(Date.now()>deadline)throw new Error('PPT JSON download missing');await new Promise(resolve=>setTimeout(resolve,50));}}
  assert.deepEqual(JSON.parse(exported),read()[0]);
  // A stale editor blocks publication/export/navigation and retains the local draft.
  const other=openPptStore(homeDirectory);try{other.update(id,{description:'远端修改'},projectId!);}finally{other.close();}
  const remoteVersion=read()[0]!.version;
  await input('[data-ppt-title]','不能丢失的本地标题');await waitFor("document.querySelector('[data-ppt-editor-status]').textContent.endsWith('保存失败')");
  for(const selector of ['[data-ppt-artifact-bar]','[data-ppt-export]','[data-ppt-back]']){if(selector==='[data-ppt-export]') await moreClick(selector); else await click(selector);await idle();}
  assert.equal(read()[0]!.version,remoteVersion);assert.equal(read()[0]!.artifact_version,0);
  assert.equal(await evaluate("document.querySelector('[data-ppt-title]').value"),'不能丢失的本地标题');
  assert.equal(await evaluate("document.querySelector('[data-ppt-stage-workspace]').hidden"),false);await screenshot('conflict');
  await moreClick('[data-ppt-reload]');await waitFor("document.querySelector('[data-ppt-confirm]').open");
  await evaluate("document.querySelector('[data-ppt-confirm]').close('cancel')");await idle();assert.equal(await evaluate("document.querySelector('[data-ppt-title]').value"),'不能丢失的本地标题');
  await moreClick('[data-ppt-reload]');await waitFor("document.querySelector('[data-ppt-confirm]').open");await click('[data-ppt-confirm] [data-confirm-ok]');await idle();
  assert.equal(await evaluate("document.querySelector('[data-ppt-description]').value"),'远端修改');
  const db=openHomeSqliteDatabase(homeDirectory,'ppt');
  try{db.exec("CREATE TRIGGER fail_ppt_ui BEFORE UPDATE OF artifact_version ON presentations WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    await click('[data-ppt-artifact-bar]');await idle();assert.equal(read()[0]!.publication_pending!.version,1);db.exec('DROP TRIGGER fail_ppt_ui');
  }finally{db.close();}
  await input('[data-ppt-description]','继续编辑保留');await saved();assert.equal(await evaluate("document.querySelector('[data-ppt-artifact-bar]').textContent"),'恢复发布');await screenshot('recovery');
  await reloadPage();await open();await waitFor("document.querySelector('[data-ppt-id]')");await click('[data-ppt-id]');await idle();
  await click('[data-ppt-artifact-bar]');await idle();assert.equal(read()[0]!.artifact_version,1);assert.equal(read()[0]!.publication_pending,undefined);assert.equal(read()[0]!.description,'继续编辑保留');
  const denied=await evaluate<number>(`fetch('/api/plugins/ppt?project_id=${projectId}',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({project_id:'wrong',title:'denied'})}).then(r=>r.status)`);
  assert.equal(denied,403);assert.equal(read().length,1);
  assert.equal(await evaluate("document.querySelector('[data-ppt-stage-workspace]').scrollLeft"),0);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
  await moreClick('[data-ppt-delete]');await waitFor("document.querySelector('[data-ppt-confirm]').open");await click('[data-ppt-confirm] [data-confirm-ok]');await idle();assert.equal(read().length,0);
});
