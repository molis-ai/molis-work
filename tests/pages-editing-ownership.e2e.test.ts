import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore, openPartitionLibraryDatabase } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";

const body = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(t: TestContext, completion: Parameters<typeof openGoalBrowser>[3] = null) {
  const b = await openGoalBrowser(t, true, undefined, completion); if (!b) return null;
  await pluginFrameInitScript(t, b, `window.molisWorkbenchPluginFactories=new Proxy({}, {set(target,key,factory){
    target[key]=host=>{if(key==='pages'&&!host.side){const api=window.MolisWorkPagesEditor;
      window.creationCompletions=0;
      window.MolisWorkPagesEditor={...api,mount(root,options){const create=options.onCreateFromAi;
        return window.ownershipEditor=api.mount(root,{...options,onCreateFromAi:async(...args)=>{try{return await create(...args);}finally{creationCompletions++;}}});}};}return factory(host);};return true;
  }});`);
  const frame = await pluginFrameBrowser(t, b, "pages");
  const create = (title: string, text: string) => {
    const store = openPagesStore(b.homeDirectory, b.projectId!);
    try { return store.create({ title, body: body(text) }); } finally { store.close(); }
  };
  const a = create("Original document", "Original body");
  const path = `/projects/${b.projectId}/api/plugins/io.molis.work.pages/pages/${a.id}`;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=pages&openItem=${a.id}` }, b.sessionId));
  await frame.waitFor(`window.ownershipEditor?.view && document.querySelector('[data-pages-title]')?.value === ${JSON.stringify(a.title)}`);
  const read = () => { const store = openPagesStore(b.homeDirectory, b.projectId!); try { return store.get(a.id)!; } finally { store.close(); } };
  const documents = () => { const store = openPagesStore(b.homeDirectory, b.projectId!); try { return store.list(); } finally { store.close(); } };
  const title = (value: string) => frame.evaluate(`{ const input=document.querySelector('[data-pages-title]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true})); }`);
  const text = () => frame.evaluate<string>("ownershipEditor.view.state.doc.textContent");
  return { ...b, frame, a, path, create, read, documents, title, text };
}

for (const dirty of [false, true]) test(`QEA-69: publication conflict ${dirty ? "preserves later local edits and their original baseline" : "reloads the complete current document"} without overwriting another writer`, { timeout: 90_000 }, async t => {
  const f = await fixture(t); if (!f) return;
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest, target=${JSON.stringify(f.path)};
    window.publicationRace={writes:[]};
    window.molisWorkRequest=Object.assign(async (url,options)=>{
      const path=new URL(url,'http://plugin.invalid').pathname, method=options?.method||'GET';
      if(path===target+'/promote'&&method==='POST') {
        publicationRace.promote=options;await new Promise(resolve=>publicationRace.releasePromote=resolve);
        try{return await original(url,options);}catch(error){publicationRace.rejected=true;throw error;}
      }
      if(path===target&&method==='POST') {
        try {const result=await original(url,options);publicationRace.writes.push('saved');return result;}
        catch(error){publicationRace.writes.push('failed');throw error;}
      }
      const result=await original(url,options);
      if(path===target&&method==='GET'&&publicationRace.rejected){
        publicationRace.latest=result;await new Promise(resolve=>publicationRace.releaseLatest=resolve);
      }
      return result;
    },original);
  })()`);
  await f.frame.click('[data-pages-promote][data-pages-artifact-bar]');
  await f.frame.waitFor("typeof publicationRace.releasePromote==='function'");
  const before = f.read();
  await f.web.post(f.path, { expected_version: before.version, title: "Other writer", body: body("Other writer body") });
  const remote = f.read();
  await f.frame.evaluate("publicationRace.releasePromote()");
  await f.frame.waitFor("typeof publicationRace.releaseLatest==='function'");
  if (dirty) await f.title("My later draft");
  await f.frame.evaluate("publicationRace.releaseLatest()");
  await f.frame.waitFor("document.querySelector('[data-pages-note]')?.textContent.length > 0");
  const displayed = await f.text();
  const writes = await f.frame.evaluate<number>("publicationRace.writes.length");
  await f.title(dirty ? "My draft remains unsubmitted" : "Edited current document");
  // Wait for the real request to settle, not merely the editor's debounce timer.
  await f.frame.waitFor(`publicationRace.writes.length > ${writes}`, 15_000);
  assert.equal((f.read().body as { content: Array<{ content: Array<{ text: string }> }> }).content[0]!.content[0]!.text,
    "Other writer body", "no later autosave overwrites the other writer's body");
  assert.equal(displayed, dirty ? "Original body" : "Other writer body", "fresh versions belong to their complete body; unsubmitted edits keep their original baseline");
  assert.equal(await f.frame.evaluate("publicationRace.writes.at(-1)"), dirty ? "failed" : "saved");
  if (dirty) assert.deepEqual(f.read(), remote, "a failed publication cannot silently borrow the new version for an old draft");
});

// The global search result goes through the registered select-item event and the real document GET.
async function selectFromSearch(f: NonNullable<Awaited<ReturnType<typeof fixture>>>, document: { id: string; title: string }) {
  for (const deadline = Date.now() + 45_000; ;) {
    const answer = await f.web.post<{ hits: Array<{ subject: { id: string } }> }>(`/projects/${f.projectId}/api/search/query`, { query: document.title, scope: "all", limit: 20 });
    if (answer.hits.some(hit => hit.subject.id === document.id)) break;
    if (Date.now() > deadline) assert.fail("the actual document was not indexed");
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await f.click("[data-global-search-open]");
  await f.waitFor("document.querySelector('[data-global-search-dialog]').open");
  await f.evaluate(`{const input=document.querySelector('[data-global-search]');input.value=${JSON.stringify(document.title)};input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  const hit = `[data-global-search-hit][data-global-search-id="${document.id}"]`;
  await f.waitFor(`document.querySelector(${JSON.stringify(hit)})`, 15_000);
  await f.click(hit);
}

for (const refused of [false, true]) test(`QEA-70: selecting a document while reading it ${refused ? "keeps later edits visible when the real save is refused" : "saves later edits before switching"}`, { timeout: 90_000 }, async t => {
  const f = await fixture(t); if (!f) return;
  const other = f.create("Document newly available in search", "Other document body");
  const otherPath = `/projects/${f.projectId}/api/plugins/io.molis.work.pages/pages/${other.id}`;
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest, a=${JSON.stringify(f.path)}, b=${JSON.stringify(otherPath)};
    window.selectionRace={};
    const saving=new Promise(resolve=>selectionRace.allowSave=resolve);
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      const path=new URL(url,'http://plugin.invalid').pathname,method=options?.method||'GET';
      if(path===a&&method==='POST') {
        selectionRace.releaseSave=selectionRace.allowSave;await saving;
        try{return await original(url,options);}catch(error){selectionRace.saveFailed=true;throw error;}
      }
      const result=await original(url,options);
      if(path===b&&method==='GET') await new Promise(resolve=>selectionRace.releaseRead=resolve);
      return result;
    },original);
  })()`);
  await selectFromSearch(f, other);
  await f.frame.waitFor("typeof selectionRace.releaseRead==='function'");
  await f.title("Draft typed while opening another document");
  await f.frame.waitFor("typeof selectionRace.releaseSave==='function'");
  const previous = f.read();
  if (refused) await f.web.post(f.path, { expected_version: previous.version, title: "Remote edit", body: body("Remote body stays") });
  const remote = f.read();
  await f.frame.evaluate("selectionRace.releaseRead()");
  await f.frame.evaluate("selectionRace.releaseSave()");
  if (refused) {
    await f.frame.waitFor("selectionRace.saveFailed && document.querySelector('[data-pages-note]')?.textContent.length>0");
    assert.equal(await f.frame.evaluate("document.querySelector('[data-pages-title]').value"), "Draft typed while opening another document");
    assert.equal(await f.text(), "Original body");
    assert.deepEqual(f.read(), remote, "the rejected local draft did not modify either owner's persisted version");
  } else {
    await f.frame.waitFor(`document.querySelector('[data-pages-title]').value===${JSON.stringify(other.title)}`);
    assert.equal(f.read().title, "Draft typed while opening another document");
    assert.equal(await f.text(), "Other document body");
  }
});

async function translation(f: NonNullable<Awaited<ReturnType<typeof fixture>>>, expected: string) {
  await f.frame.evaluate(`(() => { const editor=document.querySelector('[data-pages-editor] .ProseMirror'),p=editor.querySelector('p');
    editor.focus();const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange')); })()`, undefined, "person");
  const more = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) [data-more]";
  await f.waitFor(`document.querySelector(${JSON.stringify(more)})`);
  await f.click(more);
  await f.waitFor("[...document.querySelectorAll('.mw-ctx-menu button')].some(button=>button.textContent.includes('整篇翻译成新文档'))");
  await f.evaluate("[...document.querySelectorAll('.mw-ctx-menu button')].find(button=>button.textContent.includes('整篇翻译成新文档')).click()");
  await f.frame.waitFor(`document.querySelector('.pages-pop:not([hidden]) textarea')?.value === ${JSON.stringify(expected)}`);
}

for (const lost of [false, true]) test(`QEA-71: an edited translation candidate survives ${lost ? "a lost committed reply" : "a real database refusal"} and explicitly retries once`, { timeout: 90_000 }, async t => {
  let models = 0;
  const f = await fixture(t, async () => { models++; return "Translated model candidate"; }); if (!f) return;
  await translation(f, "Translated model candidate");
  const candidate = ".pages-pop:not([hidden]) textarea";
  await f.frame.evaluate(`{const area=document.querySelector(${JSON.stringify(candidate)});area.value='My edited translation';area.dispatchEvent(new Event('input',{bubbles:true}));}`);
  const alter = (sql: string) => { const db = openPartitionLibraryDatabase(f.homeDirectory, f.projectId!, "pages"); try { db.exec(sql); } finally { db.close(); } };
  if (!lost) alter("CREATE TRIGGER refuse_translation BEFORE INSERT ON pages BEGIN SELECT RAISE(ABORT, 'fixture translation storage unavailable'); END");
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest,target=${JSON.stringify(f.path.slice(0, f.path.lastIndexOf('/')))};
    window.translationAttempt={requests:[]};
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      if(new URL(url,'http://plugin.invalid').pathname!==target||options?.method!=='POST') return original(url,options);
      translationAttempt.requests.push(options.body);
      try {
        const result=await original(url,options);
        if(${lost}&&translationAttempt.requests.length===1) throw new Error('fixture committed reply lost');
        return result;
      } finally {translationAttempt.finished=true;}
    },original);
  })()`);
  await f.frame.click(".pages-pop:not([hidden]) .mw-btn--primary");
  await f.frame.waitFor("translationAttempt.finished");
  assert.equal(await f.frame.evaluate(`document.querySelector(${JSON.stringify(candidate)})?.value`), "My edited translation", "a failed save must leave the person's candidate available");
  await f.frame.waitFor("document.querySelector('.pages-pop:not([hidden]) .pages-pop-error') && !document.querySelector('.pages-pop:not([hidden]) .mw-btn--primary').disabled");
  assert.equal(f.documents().length, lost ? 2 : 1);
  if (!lost) {
    const directory = join(process.cwd(), ".impeccable/qa/review/quality-audit-pages"); await mkdir(directory, { recursive: true });
    for (const theme of ["light", "dark"]) for (const width of [1440, 1024, 390]) {
      await f.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, f.sessionId);
      await f.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
      await f.frame.waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
      await f.frame.evaluate("window.dispatchEvent(new Event('resize'))");
      assert.equal(await f.frame.evaluate(`(() => {const rect=document.querySelector('.pages-pop:not([hidden]) .mw-btn--primary').getBoundingClientRect();
        return rect.width>0 && rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight;})()`), true, `retry remains reachable at ${theme}/${width}`);
      const shot = await f.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, f.sessionId);
      await writeFile(join(directory, `translation-retry-${theme}-${width}.png`), Buffer.from(shot.data, "base64"));
    }
  }
  if (!lost) alter("DROP TRIGGER refuse_translation");
  if (lost) {
    const made = f.documents().find(document => document.id !== f.a.id)!;
    await f.web.post(f.path.slice(0, f.path.lastIndexOf('/')) + '/' + made.id,
      { expected_version: made.version, title: "Later owner edit", body: body("Later owner content") });
    await f.title('x'.repeat(81));
    await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='failed'");
    await f.frame.click(".pages-pop:not([hidden]) .mw-btn--primary");
    await f.frame.waitFor('creationCompletions===2');
    assert.equal(await f.frame.evaluate("document.querySelector('.pages-pop:not([hidden]) textarea').readOnly"), true,
      "a later refusal does not prove the first unknown attempt did not commit");
    await f.title('Repaired original title');
    await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='saved'");
  }
  await f.frame.click(".pages-pop:not([hidden]) .mw-btn--primary");
  await f.frame.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent === ${JSON.stringify(lost ? "Later owner content" : "My edited translation")}`);
  assert.equal(f.documents().length, 2, "one original document and one translation even when the first reply was lost");
  assert.equal(models, 1, "retrying storage does not regenerate the model candidate");
  const requests = await f.frame.evaluate<Array<Record<string, unknown>>>("translationAttempt.requests");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0], "retry sends the original frozen request and body");
  assert.equal(typeof requests[0]!.request_id, "string");
  assert.equal(f.read().title, lost ? 'Repaired original title' : f.a.title);
});

test("QEA-69: a committed publication with a lost reply reads back the actual fixed version and body", { timeout: 90_000 }, async t => {
  const f = await fixture(t); if (!f) return;
  await f.frame.evaluate(`(() => {const original=window.molisWorkRequest;window.publicationLost=false;
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      const result=await original(url,options);
      if(options?.method==='POST'&&new URL(url,'http://plugin.invalid').pathname.endsWith('/promote')) {
        publicationLost=true;throw new Error('fixture publication reply lost');
      }
      return result;
    },original);
  })()`);
  await f.frame.click('[data-pages-promote][data-pages-artifact-bar]');
  await f.frame.waitFor("publicationLost && document.querySelector('[data-pages-note]')?.textContent.length>0");
  assert.equal(f.read().artifact_version, 1);
  assert.ok(f.read().artifact_id);
  assert.equal(await f.text(), "Original body");
  assert.equal(await f.frame.evaluate<string>("document.querySelector('[data-pages-promote][data-pages-artifact-bar]').textContent"), "再存一个固定版本");
  await f.title("After publication");
  await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='saved'");
  assert.equal(f.read().title, "After publication");
  assert.equal(f.read().artifact_version, 1);
});

test("QEA-71: a definite refusal before creation keeps the candidate editable for a corrected submission", { timeout: 90_000 }, async t => {
  let models = 0;
  const f = await fixture(t, async () => { models++; return "Editable translation"; }); if (!f) return;
  await translation(f, "Editable translation");
  await f.title("x".repeat(81));
  await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='failed'");
  await f.frame.click(".pages-pop:not([hidden]) .mw-btn--primary");
  await f.frame.waitFor("creationCompletions===1");
  assert.equal(f.documents().length, 1, "the source input refusal happens before any create");
  assert.equal(await f.frame.evaluate("document.querySelector('.pages-pop:not([hidden]) textarea').readOnly"), false);
  await f.frame.evaluate("document.querySelector('.pages-pop:not([hidden]) textarea').value='Corrected translation'");
  await f.title("Corrected source title");
  await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='saved'");
  await f.frame.click(".pages-pop:not([hidden]) .mw-btn--primary");
  await f.frame.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')?.textContent==='Corrected translation'");
  assert.equal(f.documents().length, 2);
  assert.equal(models, 1);
});

test("QEA-71: dismissing a pending translation and opening a new candidate prevents an old completion from closing or navigating it", { timeout: 90_000 }, async t => {
  let models = 0;
  const f = await fixture(t, async () => `Translation ${++models}`); if (!f) return;
  await translation(f, "Translation 1");
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest,target=${JSON.stringify(f.path.slice(0,f.path.lastIndexOf('/')))};
    window.translationHeld={calls:0};
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      if(new URL(url,'http://plugin.invalid').pathname!==target||options?.method!=='POST') return original(url,options);
      translationHeld.calls++;
      const result=await original(url,options);
      await new Promise(resolve=>translationHeld.release=resolve);translationHeld.returned=true;return result;
    },original);
    window.originalCandidateSave=document.querySelector('.pages-pop:not([hidden]) .mw-btn--primary');
    originalCandidateSave.click();originalCandidateSave.click();
  })()`);
  await f.frame.waitFor("typeof translationHeld.release==='function'");
  assert.equal(await f.frame.evaluate("translationHeld.calls"), 1, "a second click while saving does not create a second request");
  await f.frame.click(".pages-pop:not([hidden]) .mw-btn--ghost");
  await translation(f, "Translation 2");
  await f.frame.evaluate("translationHeld.release()");
  await f.frame.waitFor(`document.querySelector('[data-page-id="${f.documents().find(row=>row.id!==f.a.id)!.id}"]')`);
  assert.equal(await f.frame.evaluate("document.querySelector('.pages-pop:not([hidden]) textarea')?.value"), "Translation 2");
  assert.equal(await f.frame.evaluate("document.querySelector('[data-pages-title]').value"), f.a.title);
  assert.equal(f.documents().length, 2, "dismissal does not pretend to undo the already committed write");
  assert.equal(models, 2);
});

for (const later of ["selection", "return"] as const) test(`QEA-70 QEA-72: a later ${later} owns navigation while an earlier selection is waiting to save`, { timeout: 90_000 }, async t => {
  const f = await fixture(t); if (!f) return;
  const b = f.create("Pending destination", "Pending body"), c = f.create("Latest destination", "Latest body");
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest,a=${JSON.stringify(f.path)},b=${JSON.stringify(f.path.slice(0,f.path.lastIndexOf('/'))+'/'+b.id)};
    window.latestSelection={};const saves=new Promise(resolve=>latestSelection.allowSaves=resolve);
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      const path=new URL(url,'http://plugin.invalid').pathname,method=options?.method||'GET';
      if(path===a&&method==='POST'){latestSelection.waitingSave=true;await saves;}
      const result=await original(url,options);
      if(path===b&&method==='GET'&&!latestSelection.readReleased) await new Promise(resolve=>latestSelection.releaseRead=()=>{latestSelection.readReleased=true;resolve();});
      return result;
    },original);
  })()`);
  await selectFromSearch(f,b);
  await f.frame.waitFor("typeof latestSelection.releaseRead==='function'");
  await f.title("Saved before latest navigation");
  await f.frame.waitFor("latestSelection.waitingSave");
  await f.frame.evaluate("latestSelection.releaseRead()");
  if(later==='selection') await selectFromSearch(f,c);
  else await f.frame.click("[data-pages-back]");
  await f.frame.evaluate("latestSelection.allowSaves()");
  await f.frame.waitFor(later==='selection'
    ? `document.querySelector('[data-pages-title]').value===${JSON.stringify(c.title)}`
    : "document.querySelector('[data-pages=workbench]').dataset.expanded==='false'");
  assert.equal(f.read().title,"Saved before latest navigation");
  if(later==='selection') assert.equal(await f.text(),"Latest body");
  else {
    await selectFromSearch(f,b);
    await f.frame.waitFor(`document.querySelector('[data-pages-title]').value===${JSON.stringify(b.title)}`);
    assert.equal(await f.text(),"Pending body","a later explicit request can still open the previously abandoned destination");
  }
});

for (const action of ["dismiss", "invalid source"] as const) test(`QEA-71: after creation is accepted, ${action} during navigation cannot reopen or duplicate the candidate`, { timeout: 90_000 }, async t => {
  let models=0;const f=await fixture(t,async()=>{models++;return 'Accepted translation';});if(!f)return;
  await translation(f,'Accepted translation');
  await f.frame.evaluate(`(() => {
    const original=window.molisWorkRequest,a=${JSON.stringify(f.path)},list=${JSON.stringify(f.path.slice(0,f.path.lastIndexOf('/')))};
    window.afterCreate={};const saves=new Promise(resolve=>afterCreate.allowSaves=resolve);
    window.molisWorkRequest=Object.assign(async(url,options)=>{
      const path=new URL(url,'http://plugin.invalid').pathname,method=options?.method||'GET';
      if(path===a&&method==='POST'){afterCreate.saving=true;await saves;}
      const result=await original(url,options);
      if(path===list&&method==='GET'&&!afterCreate.releasedList) {
        await new Promise(resolve=>afterCreate.releaseList=()=>{afterCreate.releasedList=true;resolve();});
      }
      return result;
    },original);
  })()`);
  await f.frame.click('.pages-pop:not([hidden]) .mw-btn--primary');
  await f.frame.waitFor("typeof afterCreate.releaseList==='function'");
  assert.equal(f.documents().length,2,'the translation already exists before navigation');
  await f.title(action==='dismiss'?'Keep this source draft':'x'.repeat(81));
  await f.frame.waitFor('afterCreate.saving');
  await f.frame.evaluate('afterCreate.releaseList()');
  await f.frame.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
  if(action==='dismiss') await f.frame.click('.pages-pop:not([hidden]) .mw-btn--ghost');
  await f.frame.evaluate('afterCreate.allowSaves()');
  await f.frame.waitFor('creationCompletions===1');
  if(action==='dismiss') {
    assert.equal(await f.frame.evaluate("document.querySelector('[data-pages-title]').value"),'Keep this source draft');
    assert.equal(await f.text(),'Original body');
  } else {
    assert.equal(await f.frame.evaluate("document.querySelector('[data-pages-title]').value"),'x'.repeat(81));
    await f.title('Repaired source title');
    await f.frame.waitFor("document.querySelector('[data-pages-editor-status]').dataset.mwState==='saved'");
    if(await f.frame.evaluate("!!document.querySelector('.pages-pop:not([hidden]) .mw-btn--primary')")) {
      await f.frame.click('.pages-pop:not([hidden]) .mw-btn--primary');
      await f.frame.waitFor('creationCompletions===2');
    }
    assert.equal(f.documents().length,2,'a navigation refusal cannot turn an accepted create into a second intent');
  }
  assert.equal(models,1);
});
