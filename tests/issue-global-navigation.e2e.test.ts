import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

const entry = '[data-home-plugin-open="issues"]';
const frame = '[data-side-body="plugin:issues/capture"] iframe';
const inside = (expression: string) => `(() => { const document = window.document.querySelector(${JSON.stringify(frame)})?.contentDocument; if(!document)return false; const pane=document.querySelector('[role=tabpanel]:not([hidden])') || document; return (${expression}); })()`;
const ready = inside("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

// Real pointer input into the embedded document, with hit testing in both documents.
async function clickInside(b: Browser, selector: string) {
  const point = await b.evaluate<{ x: number; y: number; hit: boolean }>(`(() => {
    const frame = document.querySelector(${JSON.stringify(frame)}), inner = frame.contentDocument;
    const button = inner.querySelector('[role=tabpanel]:not([hidden])')?.querySelector(${JSON.stringify(selector)}) || inner.querySelector(${JSON.stringify(selector)}); button.scrollIntoView({block:'nearest'});
    const box = button.getBoundingClientRect(), outer = frame.getBoundingClientRect(), x = box.left + box.width/2, y = box.top + box.height/2;
    return {x:outer.left+x,y:outer.top+y,hit:button.contains(inner.elementFromPoint(x,y)) && document.elementFromPoint(outer.left+x,outer.top+y)===frame};
  })()`);
  assert.equal(point.hit, true, `${selector} must be visible and clickable in the side panel`);
  for (const type of ["mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 }, b.sessionId);
}

async function besidePage(b: Browser, width: number, name: string) {
  await b.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.waitFor("document.body.dataset.sideOpen === 'true'");
  const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
  const evidence = resolve(".impeccable/qa/review/issue-tabs"); await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, `${name}-${width}.png`), Buffer.from(shot.data, "base64"));
  const geometry = await b.evaluate(`(() => {
    const main=document.querySelector('[data-plugin-stage]').getBoundingClientRect(), panel=document.querySelector('[data-side-panel]').getBoundingClientRect();
    const button=document.querySelector(${JSON.stringify(entry)}), box=button.getBoundingClientRect();
    return {main:{right:main.right,bottom:main.bottom},panel:{left:panel.left,top:panel.top},visible:main.width>200 && main.height>100 && panel.height>200, separate:innerWidth>760 ? main.right<=panel.left : main.bottom<=panel.top,
      clickable:button.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)), fits:document.documentElement.scrollWidth<=innerWidth};
  })()`);
  const {main,panel,...result}=geometry as {main:unknown;panel:unknown;visible:boolean;separate:boolean;clickable:boolean;fits:boolean};
  assert.deepEqual(result, { visible: true, separate: true, clickable: true, fits: true }, `${name}, ${width}, ${JSON.stringify({main,panel})}`);
}

test("ISSUE-31 ISSUE-32 no-project Home opens capture beside the current page, retaining the draft when closed", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/?desktop=1" }, b.sessionId));
  await b.evaluate(`(async () => {
    const response = await fetch('/api/onboarding/dismiss', {method:'POST', headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({kind:'first_run',user_confirmed:true})});
    if (!response.ok) throw new Error(await response.text());
  })()`);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/?desktop=1" }, b.sessionId));
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).closest('header') !== null`), true);
  assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(entry)}).length`), 1);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(frame)}).hasAttribute('src')`), false, "closed panel loads no plugin document");
  const url = await b.evaluate("location.href");
  await b.click(entry); await b.waitFor(ready);
  assert.equal(await b.evaluate("location.href"), url);
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-workspace]').hidden")), false, "opens capture directly");
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=title]').closest('label').hidden")), true);
  await clickInside(b, '[name=description]'); await b.command("Input.insertText", { text: "首页侧栏草稿，不应丢失" }, b.sessionId);
  assert.deepEqual(await b.evaluate(inside("[...document.querySelectorAll('[role=tab]')].map(tab=>tab.textContent)")), ['记录Issue','Issue列表']);
  assert.equal(await b.evaluate(inside("new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size===document.querySelectorAll('[id]').length")), true, 'labels and dialogs have unique identities');
  await clickInside(b, '#issue-tab-1');
  await b.waitFor(inside("pane.querySelector('[data-issue-list]').textContent.includes('还没有问题记录')"));
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  assert.equal(await b.evaluate(inside("document.querySelector('[aria-selected=true]').textContent")), 'Issue列表');
  await clickInside(b, '#issue-tab-1');
  for (const type of ['keyDown','keyUp']) await b.command('Input.dispatchKeyEvent', {type,key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37}, b.sessionId);
  assert.equal(await b.evaluate(inside("document.activeElement.id")), 'issue-tab-0');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), '首页侧栏草稿，不应丢失');
  await b.evaluate(inside(`(() => {
    const view=document.defaultView, decode=view.createImageBitmap.bind(view);
    view.createImageBitmap=(...args)=>new Promise(resolve=>{view.issueFinishDecode=()=>resolve(decode(...args));});
    const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;
    const data=canvas.toDataURL('image/png'), dt=new view.DataTransfer();
    dt.items.add(new view.File([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))],'pending.png',{type:'image/png'}));
    pane.querySelector('[data-issue-drop]').dispatchEvent(new view.DragEvent('drop',{bubbles:true,dataTransfer:dt}));
  })()`));
  await b.waitFor(inside("typeof document.defaultView.issueFinishDecode==='function'"));
  await clickInside(b, '#issue-tab-1');
  await b.evaluate(inside("document.defaultView.issueFinishDecode()"));
  await b.waitFor(inside("document.querySelectorAll('#issue-panel-0 [data-issue-images] img').length===1"));
  await clickInside(b, '#issue-tab-0');
  await clickInside(b, '[data-issue-manual]'); await clickInside(b, '[name=title]');
  await b.command('Input.insertText',{text:'尚未保存的手动标题'},b.sessionId);
  await clickInside(b, '#issue-tab-1'); await clickInside(b, '#issue-tab-0');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=title]').value")), '尚未保存的手动标题');
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-save]').hidden")), false);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).getAttribute('aria-expanded')`), "false");
  await b.click(entry); await b.waitFor(ready); await b.click(entry);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), "首页侧栏草稿，不应丢失");
  for (const width of [1440, 1024, 390, 320]) await besidePage(b, width, "home");
  assert.equal(await b.evaluate("fetch('/plugins/issues?side=missing').then(r=>r.status)"), 404);
  assert.equal(await b.evaluate("fetch('/plugins/issues?side=issues').then(r=>r.status)"), 404, "a stage declaration grants no side view");
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
  await clickInside(b, '[name=description]');
  for (const type of ['keyDown','keyUp']) await b.command('Input.dispatchKeyEvent', {type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27}, b.sessionId);
  await b.waitFor("document.querySelector('[data-side-panel]').hidden");
  assert.equal(await b.evaluate(`document.activeElement.matches(${JSON.stringify(entry)})`), true);
  await b.click(entry);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), "首页侧栏草稿，不应丢失");
  const disabled = await b.evaluate<string>(`(async()=>{
    const response=await fetch('/api/plugins/io.molis.work.issues/disable',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:'{}'});
    if(!response.ok)throw new Error(await response.text());return fetch('/plugins/issues?side=capture').then(r=>r.text());
  })()`);
  assert.match(disabled, /data-home-lifecycle="enable"/); assert.match(disabled, /Issue 暂不可用/);
  assert.doesNotMatch(disabled, /data-issues="workbench"/);
});

test("ISSUE-31 ISSUE-32 project stays usable beside capture; image, draft and Assistant card survive panel switching until one confirmed save", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  let reply!: () => void;
  const firstReply = new Promise<void>(resolve => { reply=resolve; }); t.after(() => reply());
  const { requests } = await issueModel(t, b.homeDirectory, { firstReply });
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?desktop=1` }, b.sessionId));
  await b.waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await b.click('[data-assistant-input]'); await b.command("Input.insertText", { text: "项目内尚未发送的输入" }, b.sessionId);
  const url = await b.evaluate("location.href"), active = await b.evaluate("document.body.dataset.desktopSurface");
  await b.click(entry); await b.waitFor(ready);
  const previous = await b.evaluate<{id:string}>(`fetch('/api/plugins/io.molis.work.issues/create',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({title:'已有问题',type:'experience',description:'已有记录原文'})}).then(r=>r.json())`);
  assert.equal(await b.evaluate("location.href"), url);
  assert.equal(await b.evaluate("document.body.dataset.desktopSurface"), active, "Issue never switches the main surface");
  for (const width of [1440, 1024, 390, 320]) await besidePage(b, width, "project");
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  const description = "【侧栏自检】切换页面后输入内容不见了。";
  await clickInside(b, '[name=description]'); await b.command("Input.insertText", { text: description }, b.sessionId);
  const image = await b.evaluate<string>(inside(`(() => {
    const c=document.createElement('canvas');c.width=160;c.height=80;c.getContext('2d').fillRect(0,0,160,80);
    const data=c.toDataURL('image/png'), bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)), dt=new DataTransfer();
    dt.items.add(new File([bytes],'side-demo.png',{type:'image/png'}));
    pane.querySelector('[data-issue-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return data;
  })()`));
  await b.waitFor(inside("pane.querySelectorAll('[data-issue-images] img').length===1 && !pane.querySelector('[data-issue-organize]').disabled"));
  await clickInside(b, '#issue-tab-1');
  await b.waitFor(inside(`pane.querySelector('[data-issue-id="${previous.id}"]')`));
  await clickInside(b, `[data-issue-id="${previous.id}"]`); await b.waitFor(inside("!pane.querySelector('[data-issue-view]').hidden"));
  await clickInside(b, '[data-issue-edit]'); await clickInside(b, '[name=description]'); await b.command('Input.insertText',{text:'；列表编辑草稿'},b.sessionId);
  const oldDraft=await b.evaluate(inside("pane.querySelector('[name=description]').value"));
  await clickInside(b, '#issue-tab-0');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), description);
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-images] img').src")), image);
  await clickInside(b, '#issue-tab-1');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), oldDraft);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), oldDraft);
  await clickInside(b, '[data-issue-cancel-edit]');
  await clickInside(b, '#issue-tab-0');
  await b.click('[data-side-tab="files"]'); await b.click(entry);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), description);
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-images] img').src")), image);
  // Operate the original project while the Issue form stays visible.
  await b.click('[data-assistant-input]'); await b.command("Input.insertText", { text: "；侧栏打开时仍可继续输入" }, b.sessionId);
  assert.match(await b.evaluate<string>("document.querySelector('[data-assistant-input]').value"), /项目内尚未发送的输入.*侧栏打开时仍可继续输入/);
  await clickInside(b, '[data-issue-organize]');
  await b.waitFor(inside("pane.querySelector('[data-issue-assistant-note]').textContent.includes('正在整理')"));
  await clickInside(b, '#issue-tab-1');
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-view-title]').textContent")), '已有问题');
  reply();
  await b.waitFor("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length===1)");
  await clickInside(b, '#issue-tab-0');
  await b.waitFor(inside("!pane.querySelector('[data-issue-save]').hidden && pane.querySelector('[data-issue-save]').textContent==='确认并保存'"), 20000);
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 1);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=type]').value")), "bug");
  const count = requests.length;
  const suggested=await b.evaluate(inside("pane.querySelector('[name=title]').value"));
  await clickInside(b, '#issue-tab-1'); await clickInside(b, '#issue-tab-0');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=title]').value")), suggested);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  await clickInside(b, '[data-issue-model-settings]');
  await b.waitFor(inside("document.querySelector('[data-home-model-settings] [data-model-name]')"));
  await clickInside(b, '[data-home-model-close]');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), description);
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-save]').textContent")), "确认并保存");
  assert.equal(requests.length, count, "reopening does not start another Assistant request");
  await clickInside(b, '[data-issue-save]');
  await b.waitFor(inside("!pane.querySelector('[data-issue-view]').hidden && pane.querySelector('[data-issue-note]').textContent==='已保存'"));
  const saved = await b.evaluate<Array<{ description: string; version: number; images: Array<{data_url: string}> }>>("(async()=>{const {items}=await fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json());return Promise.all(items.map(i=>fetch('/api/plugins/io.molis.work.issues/read?id='+i.id).then(r=>r.json())));})()");
  assert.equal(saved.length, 2); const recorded=saved.find(issue=>issue.description===description)!;
  assert.equal(recorded.version, 1); assert.equal(recorded.images[0]!.data_url, image);
  assert.equal(await b.evaluate(inside("document.querySelector('[aria-selected=true]').textContent")), 'Issue列表');
  await clickInside(b, '[data-issue-again]');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), '');
  assert.equal(await b.evaluate(inside("pane.querySelectorAll('[data-issue-images] img').length")), 0);
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-organize]').disabled")), false, 'the next capture is immediately usable');
  await clickInside(b, '#issue-tab-1');
  await clickInside(b, '[data-issue-edit]'); await clickInside(b, '[name=description]'); await b.command("Input.insertText", { text: "；未保存编辑" }, b.sessionId);
  const draft = await b.evaluate(inside("pane.querySelector('[name=description]').value"));
  await b.click('[data-side-tab="files"]'); await b.click(entry);
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), draft);
  await clickInside(b, '[data-issue-cancel-edit]');
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-view-description]').textContent")), description);
  await clickInside(b, '[data-issue-back]');
  assert.match(await b.evaluate<string>(inside("pane.querySelector('[data-issue-list]').textContent")), /切换页面后输入内容丢失/);
  assert.equal(await b.evaluate("location.href"), url); assert.equal(await b.evaluate("document.body.dataset.desktopSurface"), active);
  await b.evaluate("document.documentElement.dataset.theme='dark';document.documentElement.dataset.resolvedTheme='dark'");
  await besidePage(b, 1024, "project-dark");
});

test("ISSUE-32 a late save receipt neither changes the active tab nor overwrites the other editor", {timeout:60_000}, async t => {
  const b=await openGoalBrowser(t,'user'); if(!b)return;
  await b.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:`${b.origin}/projects/${b.projectId}/?desktop=1`},b.sessionId));
  await b.click(entry); await b.waitFor(ready);
  const old=await b.evaluate<{id:string}>(`fetch('/api/plugins/io.molis.work.issues/create',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({title:'原有问题',type:'bug',description:'原有描述'})}).then(r=>r.json())`);
  await clickInside(b,'[name=description]'); await b.command('Input.insertText',{text:'新问题原文'},b.sessionId);
  await clickInside(b,'[data-issue-manual]'); await clickInside(b,'[name=title]'); await b.command('Input.insertText',{text:'新问题标题'},b.sessionId);
  await clickInside(b, '[name=type] + [data-mw-select-trigger]');
  await clickInside(b, '[data-mw-select-option="1"]');
  await b.evaluate(inside(`(() => {
    const view=document.defaultView, fetch=view.fetch.bind(view);
    view.fetch=async(...args)=>{const response=await fetch(...args);if(String(args[0]).endsWith('/create'))await new Promise(resolve=>{view.issueReleaseSave=resolve;});return response;};
  })()`));
  await clickInside(b,'[data-issue-save]'); await b.waitFor(inside("typeof document.defaultView.issueReleaseSave==='function'"));
  await clickInside(b,'#issue-tab-1'); await b.waitFor(inside(`pane.querySelector('[data-issue-id="${old.id}"]')`));
  await clickInside(b,`[data-issue-id="${old.id}"]`); await b.waitFor(inside("!pane.querySelector('[data-issue-view]').hidden"));
  await clickInside(b,'[data-issue-edit]'); await clickInside(b,'[name=description]'); await b.command('Input.insertText',{text:'；应保留的编辑'},b.sessionId);
  const draft=await b.evaluate(inside("pane.querySelector('[name=description]').value"));
  await b.evaluate(inside("document.defaultView.issueReleaseSave()"));
  await b.waitFor(inside("document.querySelector('#issue-panel-0 [data-issue-view-title]').textContent==='新问题标题' && !document.querySelector('#issue-panel-0 form').inert"));
  assert.equal(await b.evaluate(inside("document.querySelector('[aria-selected=true]').textContent")), 'Issue列表');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")),draft);
  const stored=await b.evaluate<Array<{title:string;description:string}>>(`fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>Promise.all(r.items.map(i=>fetch('/api/plugins/io.molis.work.issues/read?id='+i.id).then(r=>r.json()))))`);
  assert.deepEqual(stored.map(i=>[i.title,i.description]).sort(),[['原有问题','原有描述'],['新问题标题','新问题原文']].sort());
  await clickInside(b,'#issue-tab-0'); await clickInside(b,'[data-issue-again]');
  assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")), '');
  assert.equal(await b.evaluate(inside("pane.querySelector('[data-issue-organize]').disabled")), false);
  await clickInside(b,'#issue-tab-1'); assert.equal(await b.evaluate(inside("pane.querySelector('[name=description]').value")),draft);
});
