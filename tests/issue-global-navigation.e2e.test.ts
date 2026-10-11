import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

const entry = '[data-home-plugin-open="issues"]';
const frame = '[data-side-body="plugin:issues/capture"] iframe';
const inside = (expression: string) => `(() => { const document = window.document.querySelector(${JSON.stringify(frame)})?.contentDocument; return document && (${expression}); })()`;
const ready = inside("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

// Real pointer input into the embedded document, with hit testing in both documents.
async function clickInside(b: Browser, selector: string) {
  const point = await b.evaluate<{ x: number; y: number; hit: boolean }>(`(() => {
    const frame = document.querySelector(${JSON.stringify(frame)}), inner = frame.contentDocument;
    const button = inner.querySelector(${JSON.stringify(selector)}); button.scrollIntoView({block:'nearest'});
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
  const evidence = resolve(".impeccable/qa/review/issue-sidebar"); await mkdir(evidence, { recursive: true });
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

test("ISSUE-31 no-project Home opens capture beside the current page, retaining the draft when closed", { timeout: 60_000 }, async t => {
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
  assert.equal(await b.evaluate(inside("document.querySelector('[data-issue-workspace]').hidden")), false, "opens capture directly");
  assert.equal(await b.evaluate(inside("document.querySelector('[name=title]').closest('label').hidden")), true);
  await clickInside(b, '[name=description]'); await b.command("Input.insertText", { text: "首页侧栏草稿，不应丢失" }, b.sessionId);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).getAttribute('aria-expanded')`), "false");
  await b.click(entry); await b.waitFor(ready); await b.click(entry);
  assert.equal(await b.evaluate(inside("document.querySelector('[name=description]').value")), "首页侧栏草稿，不应丢失");
  for (const width of [1440, 1024, 390, 320]) await besidePage(b, width, "home");
  assert.equal(await b.evaluate("fetch('/plugins/issues?side=missing').then(r=>r.status)"), 404);
  assert.equal(await b.evaluate("fetch('/plugins/issues?side=issues').then(r=>r.status)"), 404, "a stage declaration grants no side view");
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
  await clickInside(b, '[name=description]');
  for (const type of ['keyDown','keyUp']) await b.command('Input.dispatchKeyEvent', {type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27}, b.sessionId);
  await b.waitFor("document.querySelector('[data-side-panel]').hidden");
  assert.equal(await b.evaluate(`document.activeElement.matches(${JSON.stringify(entry)})`), true);
  await b.click(entry);
  assert.equal(await b.evaluate(inside("document.querySelector('[name=description]').value")), "首页侧栏草稿，不应丢失");
  const disabled = await b.evaluate<string>(`(async()=>{
    const response=await fetch('/api/plugins/io.molis.work.issues/disable',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:'{}'});
    if(!response.ok)throw new Error(await response.text());return fetch('/plugins/issues?side=capture').then(r=>r.text());
  })()`);
  assert.match(disabled, /data-home-lifecycle="enable"/); assert.match(disabled, /Issue 暂不可用/);
  assert.doesNotMatch(disabled, /data-issues="workbench"/);
});

test("ISSUE-31 project stays usable beside capture; image, draft and Assistant card survive panel switching until one confirmed save", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null); if (!b) return;
  const { requests } = await issueModel(t, b.homeDirectory);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?desktop=1` }, b.sessionId));
  await b.waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await b.click('[data-assistant-input]'); await b.command("Input.insertText", { text: "项目内尚未发送的输入" }, b.sessionId);
  const url = await b.evaluate("location.href"), active = await b.evaluate("document.body.dataset.desktopSurface");
  await b.click(entry); await b.waitFor(ready);
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
    document.querySelector('[data-issue-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return data;
  })()`));
  await b.waitFor(inside("document.querySelectorAll('[data-issue-images] img').length===1 && !document.querySelector('[data-issue-organize]').disabled"));
  await b.click('[data-side-tab="files"]'); await b.click(entry);
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  assert.equal(await b.evaluate(inside("document.querySelector('[name=description]').value")), description);
  assert.equal(await b.evaluate(inside("document.querySelector('[data-issue-images] img').src")), image);
  // Operate the original project while the Issue form stays visible.
  await b.click('[data-assistant-input]'); await b.command("Input.insertText", { text: "；侧栏打开时仍可继续输入" }, b.sessionId);
  assert.match(await b.evaluate<string>("document.querySelector('[data-assistant-input]').value"), /项目内尚未发送的输入.*侧栏打开时仍可继续输入/);
  await clickInside(b, '[data-issue-organize]');
  await b.waitFor(inside("!document.querySelector('[data-issue-save]').hidden && document.querySelector('[data-issue-save]').textContent==='确认并保存'"), 20000);
  assert.equal(await b.evaluate("fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json()).then(r=>r.items.length)"), 0);
  assert.equal(await b.evaluate(inside("document.querySelector('[name=type]').value")), "bug");
  const count = requests.length;
  await b.click('[data-side-close]'); await b.waitFor("document.querySelector('[data-side-panel]').hidden"); await b.click(entry);
  await clickInside(b, '[data-issue-model-settings]');
  await b.waitFor(inside("document.querySelector('[data-home-model-settings] [data-model-name]')"));
  await clickInside(b, '[data-home-model-close]');
  assert.equal(await b.evaluate(inside("document.querySelector('[name=description]').value")), description);
  assert.equal(await b.evaluate(inside("document.querySelector('[data-issue-save]').textContent")), "确认并保存");
  assert.equal(requests.length, count, "reopening does not start another Assistant request");
  await clickInside(b, '[data-issue-save]');
  await b.waitFor(inside("!document.querySelector('[data-issue-view]').hidden && document.querySelector('[data-issue-note]').textContent==='已保存'"));
  const saved = await b.evaluate<Array<{ description: string; version: number; images: Array<{data_url: string}> }>>("(async()=>{const {items}=await fetch('/api/plugins/io.molis.work.issues/list').then(r=>r.json());return Promise.all(items.map(i=>fetch('/api/plugins/io.molis.work.issues/read?id='+i.id).then(r=>r.json())));})()");
  assert.equal(saved.length, 1); assert.equal(saved[0]!.version, 1); assert.equal(saved[0]!.description, description); assert.equal(saved[0]!.images[0]!.data_url, image);
  await clickInside(b, '[data-issue-edit]'); await clickInside(b, '[name=description]'); await b.command("Input.insertText", { text: "；未保存编辑" }, b.sessionId);
  const draft = await b.evaluate(inside("document.querySelector('[name=description]').value"));
  await b.click('[data-side-tab="files"]'); await b.click(entry);
  assert.equal(await b.evaluate(inside("document.querySelector('[name=description]').value")), draft);
  await clickInside(b, '[data-issue-cancel-edit]');
  assert.equal(await b.evaluate(inside("document.querySelector('[data-issue-view-description]').textContent")), description);
  await clickInside(b, '[data-issue-back]');
  assert.match(await b.evaluate<string>(inside("document.querySelector('[data-issue-list]').textContent")), /切换页面后输入内容丢失/);
  assert.equal(await b.evaluate("location.href"), url); assert.equal(await b.evaluate("document.body.dataset.desktopSurface"), active);
  await b.evaluate("document.documentElement.dataset.theme='dark';document.documentElement.dataset.resolvedTheme='dark'");
  await besidePage(b, 1024, "project-dark");
});
