import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { openWork, putInput, seedWork } from "./fixtures/assistant-send-journey.js";

const captures = reviewEvidenceUrl("unified-input-layout/");
const ASSISTANT = "[data-assistant-input]";
const HOME = "[data-home-talk-form] textarea";
const CODING = "[data-coding-task]";
const LONG_DRAFT = Array.from({ length: 60 }, (_, index) => `第 ${index + 1} 行：长文仍然可以修改、选择与滚动。`).join("\n");
type WritingStyle = { font: string; line: string; padding: string; border: string; radius: string; background: string; outline: string; shadow: string };
type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type ControlBox = Box & { label: string; hit: boolean; hidden: boolean };

/** UIV-02 uses Chrome's native editing route, not field.value or a claim about the system clipboard/IME. */
async function nativeEdit(browser: LayoutBrowser, selector: string) {
  const { command,sessionId,evaluate,waitFor,click } = browser;
  await click(selector);
  const sendBefore = await evaluate<string>(`(() => {
    const field=document.querySelector(${JSON.stringify(selector)}), form=field.closest('form');
    form.dataset.layoutSubmits='0'; form.addEventListener('submit',()=>{ form.dataset.layoutSubmits=String(Number(form.dataset.layoutSubmits)+1); });
    field.setSelectionRange(0,field.value.length);
    return form.querySelector('[data-uiv-send-status]').textContent;
  })()`);
  await command('Input.insertText',{text:LONG_DRAFT},sessionId);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),LONG_DRAFT,'native multiline insertion keeps every line');
  const at=LONG_DRAFT.indexOf('修改');
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).setSelectionRange(${at},${at+2})`);
  await command('Input.insertText',{text:'选区替换'},sessionId);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),LONG_DRAFT.slice(0,at)+'选区替换'+LONG_DRAFT.slice(at+2),'native insertion replaces only the selected text');
  const modifiers=process.platform === 'darwin' ? 4 : 2;
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers,commands:['undo']},sessionId);
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers},sessionId);
  await waitFor(`document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(LONG_DRAFT)}`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').dataset.layoutSubmits`),'0','editing and undo do not submit');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('form').querySelector('[data-uiv-send-status]').textContent`),sendBefore,'editing and undo leave send status unchanged');
}

/** UIV-02/11: the same controller moves to the main area; dock consumers must return to their original geometry. */
async function dockRoundTrip(browser: LayoutBrowser) {
  const { command,sessionId,evaluate,waitFor,click } = browser;
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
  const id=await seedWork(browser,'底栏高度与主区搬移验收');
  await openWork(browser,id);
  await waitFor("document.querySelector('[data-assistant-expand]')?.disabled === false");
  const setDraft=async(text:string)=>{
    await evaluate(`(() => { const field=document.querySelector('[data-assistant-input]'); field.value=${JSON.stringify(text)}; field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h'))-document.querySelector('.workbench-bar').getBoundingClientRect().height)<1");
  };
  const height=()=>evaluate<number>("document.querySelector('.workbench-bar').getBoundingClientRect().height");
  await setDraft('一行草稿');
  const short=await height();
  await setDraft(LONG_DRAFT);
  const long=await height();
  assert.ok(long>short+10);
  await evaluate("window.uivMovingField=document.querySelector('[data-assistant-input]')");
  await click('[data-assistant-expand]');
  await waitFor("document.querySelector('[data-system-tab] [data-assistant-input]') && !document.body.matches(':has(.workbench-bar form.uiv-composer)')");
  await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h'))-document.querySelector('.workbench-bar').getBoundingClientRect().height)<1");
  assert.ok(await height()<short,'moving the composer out restores the dock to its original size');
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]') === window.uivMovingField"),true);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"),LONG_DRAFT);
  await click('[data-assistant-retract]');
  await waitFor("!!document.querySelector('.workbench-bar [data-assistant-input]')");
  await setDraft(LONG_DRAFT);
  assert.ok(Math.abs(await height()-long)<1,'returning the same long draft restores the measured dock height');
  await setDraft('一行草稿');
  assert.ok(Math.abs(await height()-short)<1,'after returning, shorter text still shrinks the dock');
  const panels=[];
  await setDraft(LONG_DRAFT);
  for(const [width,height] of [[1440,900],[390,844],[640,393],[320,640]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h'))-document.querySelector('.workbench-bar').getBoundingClientRect().height)<1");
    panels.push(await evaluate<{width:number;height:number;top:number;bottom:number}>("(() => {const panel=document.querySelector('[data-assistant-panel]').getBoundingClientRect();return {width:innerWidth,height:innerHeight,top:panel.top,bottom:panel.bottom};})()"));
    const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);
    await writeFile(new URL(`dock-panel-long-${width}x${height}.png`,captures),Buffer.from(shot.data,'base64'));
  }
  await writeFile(new URL('dock-panel-long.json',captures),JSON.stringify(panels,null,2));
  assert.ok(panels.every(panel=>panel.top>=0&&panel.bottom<=panel.height),`the open panel stays in the viewport above a long draft: ${JSON.stringify(panels)}`);
}

test("UIV-01/02/11 三入口共用书写样式，长文增高后内部滚动，底栏与窄屏录音操作留在窗口内", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null, {
    async request(method, params) { return method === "thread/turns/list" ? { data: [], nextCursor: null } : { thread: { id: params.threadId } }; },
    subscribe() { return () => undefined; },
  });
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, localHost } = browser;
  assert.ok(localHost);
  const resources = await localHost.sessionResources();
  resources.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "uiv-layout", project_id: projectId, title: "布局测试会话", actor_id: "browser-test", user_confirmed: true });
  const feed = createLocalFeedApplication(browser.store.db);
  const source = createLocalFeedSourceService(browser.store.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "uiv-layout" }).source;
  const item = feed.ingestItem({ source, externalId: "uiv-layout", title: "输入布局验收", summary: "打开首页输入", body: "布局测试的内容。", occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }), () => undefined);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-assistant-composer]').dataset.uivBound === '1'");
  const setDraft = async (selector: string, text: string) => {
    await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(text)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  // Compare settled focus styles, not a frame within the production CSS transition.
  const styleOf = (selector: string) => evaluate<WritingStyle>(`(async () => {
    const field = document.querySelector(${JSON.stringify(selector)}); field.focus();
    const surface = field.closest(".uiv-writing-surface");
    await Promise.all([...field.getAnimations(), ...surface.getAnimations()].map(animation => animation.finished));
    const style = getComputedStyle(field), focus = getComputedStyle(surface);
    return { font: style.fontSize, line: style.lineHeight, padding: style.padding, border: style.border, radius: style.borderRadius, background: style.backgroundColor, outline: focus.outline, shadow: focus.boxShadow };
  })()`);
  const closeAssistant = async () => {
    if (await evaluate<boolean>("!document.querySelector('[data-assistant-panel]').hidden")) await click("[data-assistant-panel-close]");
  };
  const dockHeight = async () => {
    await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h')) - document.querySelector('.workbench-bar').getBoundingClientRect().height) < 1");
    return evaluate<number>("document.querySelector('.workbench-bar').getBoundingClientRect().height");
  };
  const growsAndScrolls = async (selector: string) => {
    await nativeEdit(browser,selector);
    await setDraft(selector, "一行文字");
    const short = await evaluate<number>(`document.querySelector(${JSON.stringify(selector)}).clientHeight`);
    assert.ok(short <= 60, `${selector} one line does not fill its parent column (${short}px)`);
    const shortDock = selector === ASSISTANT ? await dockHeight() : null;
    await setDraft(selector, "第一行\n第二行\n第三行");
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).clientHeight > ${short} + 10`);
    await setDraft(selector, LONG_DRAFT);
    const long = await evaluate<{ height: number; client: number; scroll: number; overflow: string; after: number; value: string }>(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)}); field.scrollTop = field.scrollHeight;
      return { height: field.getBoundingClientRect().height, client: field.clientHeight, scroll: field.scrollHeight, overflow: getComputedStyle(field).overflowY, after: field.scrollTop, value: field.value };
    })()`);
    assert.ok(long.height <= 161 && long.height > short, `${selector} grows to a bounded writing area: ${JSON.stringify(long)}`);
    assert.ok(long.scroll > long.client && long.after > 0, `${selector} long draft scrolls inside the field`);
    assert.equal(long.overflow, "auto");
    assert.equal(long.value, LONG_DRAFT);
    if (shortDock !== null) assert.ok(await dockHeight() > shortDock + 10, 'floating consumers receive the growing dock height');
    await setDraft(selector, "一行文字");
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).clientHeight <= ${short} + 1`);
    if (shortDock !== null) assert.ok(Math.abs(await dockHeight() - shortDock) < 1, 'clearing long text shrinks both the dock and its published height');
  };
  const shared = await styleOf(ASSISTANT);
  assert.equal(shared.font, "16px");
  assert.match(shared.outline, /solid 2px$/u);
  assert.notEqual(shared.shadow, "none");
  await growsAndScrolls(ASSISTANT);
  await closeAssistant();
  const event = `[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`;
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  await waitFor(`!!document.querySelector(${JSON.stringify(event)})`);
  await click(event);
  await evaluate("document.querySelector('[data-home-open-talk]').scrollIntoView({block:'center'})");
  await click("[data-home-open-talk]");
  await waitFor("document.querySelector('[data-home-talk-form]').dataset.uivBound === '1'");
  assert.deepEqual(await styleOf(HOME), shared);
  await growsAndScrolls(HOME);
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
  const codingReady = "document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-composer] .coding-composer-shell').getBoundingClientRect().width > 0";
  await waitFor(`(${codingReady}) || !!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length`);
  if (!await evaluate<boolean>(codingReady)) {
    if (await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length")) await click("[data-coding-session]");
    else await click("[data-coding-new]");
    await waitFor(codingReady);
  }
  assert.deepEqual(await styleOf(CODING), shared);
  await growsAndScrolls(CODING);

  await mkdir(captures, { recursive: true });
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 640], [640, 393]]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await setDraft(ASSISTANT, LONG_DRAFT);
    await closeAssistant();
    // Layout fixture only: show the production recording controls without opening a real microphone.
    await evaluate(`(() => { const form = document.querySelector('[data-assistant-composer]'); for (const button of form.querySelectorAll('.uiv-bar button')) button.hidden = !button.matches('[data-uiv-stop-record], [data-uiv-cancel-record]'); })()`);
    await waitFor("document.querySelector('[data-assistant-input]').scrollHeight > document.querySelector('[data-assistant-input]').clientHeight");
    const layout = await evaluate<{ bar: Box; form: Box; field: Box; viewport: number; controls: ControlBox[]; overflow: number }>(`(() => {
      const box = element => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
      const form = document.querySelector('[data-assistant-composer]');
      return { bar: box(document.querySelector('.workbench-bar')), form: box(form), field: box(document.querySelector('[data-assistant-input]')), viewport: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
        controls: [...form.querySelectorAll('[data-uiv-stop-record], [data-uiv-cancel-record], [data-assistant-send]')].map(button => { const r = box(button); const hit = document.elementFromPoint((r.left+r.right)/2, (r.top+r.bottom)/2); return { ...r, label:button.getAttribute('aria-label'), hidden:button.hidden, hit:hit === button || button.contains(hit) }; }) };
    })()`);
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`${width}x${height}.png`, captures), Buffer.from(shot.data, "base64"));
    await writeFile(new URL(`${width}x${height}.json`, captures), JSON.stringify(layout, null, 2));
    assert.ok(layout.bar.bottom <= height + 1 && layout.bar.top >= 0, `${width} dock remains in window: ${JSON.stringify(layout)}`);
    assert.ok(layout.field.top >= layout.bar.top && layout.field.bottom <= layout.bar.bottom, `${width} writing area stays in dock`);
    assert.ok(layout.field.width >= layout.form.width * .7, `${width} writing area remains the primary surface`);
    assert.ok(layout.form.right - layout.controls.at(-1)!.right <= 9, `${width} send stays on the right during recording`);
    assert.ok(layout.overflow <= 1, `${width} no horizontal page overflow`);
    for (const control of layout.controls) {
      assert.ok(!control.hidden && control.hit, `${width} ${control.label} is reachable: ${JSON.stringify(control)}`);
      assert.ok(control.top >= 0 && control.bottom <= height + 1 && control.left >= 0 && control.right <= width + 1, `${width} ${control.label} is inside the window`);
      if (width <= 600) assert.ok(control.height >= 44 && control.width >= 44, `${width} ${control.label} is a touch target`);
    }
  }
  await dockRoundTrip(browser);
});

type LayoutBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type ReachReport = { reachable: boolean; box: Box; clip: Box; point: { x: number; y: number } | null; scroll: number; ancestors: Array<{ name: string; overflow: string; height: number; scroll: number; top: number }> };
function reachReport(browser: LayoutBrowser, selector: string, surface: string): Promise<ReachReport> {
  return browser.evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)}), root = document.querySelector(${JSON.stringify(surface)});
    const box = element => { const r = element.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    const rect = box(target), bounds = box(root), clip = { left:Math.max(0,bounds.left), right:Math.min(innerWidth,bounds.right), top:Math.max(0,bounds.top), bottom:Math.min(innerHeight,bounds.bottom) };
    const ancestors = [];
    for (let node = target.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node), r = box(node);
      ancestors.push({ name:node.className, overflow:style.overflowY, height:node.clientHeight, scroll:node.scrollHeight, top:node.scrollTop, width:node.clientWidth, scrollWidth:node.scrollWidth, overflowX:style.overflowX });
      if (node.contains(root) && style.overflowY !== 'visible') { clip.top = Math.max(clip.top,r.top); clip.bottom = Math.min(clip.bottom,r.bottom); }
      if (node.contains(root) && style.overflowX !== 'visible') { clip.left = Math.max(clip.left,r.left); clip.right = Math.min(clip.right,r.right); }
    }
    const inside = rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
    const x = (rect.left+rect.right)/2, y = (rect.top+rect.bottom)/2;
    const probes = [[x,y],[x,rect.top+2],[x,rect.bottom-2],[rect.left+2,y],[rect.right-2,y]];
    const occluded = probes.map(([px,py]) => { const hit = document.elementFromPoint(px,py); return { x:px,y:py,hit:hit?.outerHTML.slice(0,220),own:target.contains(hit) }; });
    const reachable = inside && occluded.every(probe => probe.own);
    let point = null;
    for (const x of [clip.left+2,clip.right-2,(clip.left+clip.right)/2]) for (const y of [clip.top+2,(clip.top+clip.bottom)/2,clip.bottom-2]) {
      if (point || x <= clip.left || x >= clip.right || y <= clip.top || y >= clip.bottom) continue;
      const hit = document.elementFromPoint(x,y);
      if (!root.contains(hit) || hit.closest('textarea,input')) continue;
      let nestedScroll = false;
      for (let node = hit; node && node !== root; node = node.parentElement) if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) nestedScroll = true;
      if (!nestedScroll) point = { x,y };
    }
    return { reachable, disabled:target.disabled, pointer:getComputedStyle(target).pointerEvents, clientWidth:target.clientWidth, clientHeight:target.clientHeight, occluded, box:rect, clip:{...clip,width:clip.right-clip.left,height:clip.bottom-clip.top}, point, scroll:root.scrollTop, ancestors };
  })()`);
}

/** Only wheel input moves the outer surface: scrollIntoView can conceal overflow:hidden defects. */
async function reachByWheel(browser: LayoutBrowser, selector: string, surface: string) {
  const trace: ReachReport[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const report = await reachReport(browser, selector, surface);
    trace.push(report);
    const previous = trace.at(-2);
    const contained = report.box.top >= report.clip.top && report.box.bottom <= report.clip.bottom;
    const stuck = attempt > 1 && (contained || (previous?.box.top === report.box.top && previous.scroll === report.scroll));
    if (report.reachable || !report.point || stuck) return { selector, reached:report.reachable, trace };
    const distance = (report.box.top + report.box.bottom - report.clip.top - report.clip.bottom) / 2;
    await browser.command('Input.dispatchMouseEvent', { type:'mouseWheel', ...report.point, deltaX:0, deltaY:Math.sign(distance || 1)*Math.max(1,Math.min(600,Math.abs(distance))) }, browser.sessionId);
    await browser.evaluate('new Promise(resolve => setTimeout(resolve, 60))');
  }
  const report = await reachReport(browser, selector, surface);
  trace.push(report);
  return { selector, reached:report.reachable, trace };
}

async function reachByTab(browser: LayoutBrowser, field: string, selectors: string[], surface: string) {
  await browser.click(field);
  const enabled = await browser.evaluate<string[]>(`([${selectors.map(selector => JSON.stringify(selector)).join(',')}]).filter(selector => { const button = document.querySelector(selector); return !button.disabled && !button.hidden; })`);
  const visited:string[] = [];
  for (let count = 0; count < 24 && enabled.some(selector => !visited.includes(selector)); count++) {
    await browser.command('Input.dispatchKeyEvent', { type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9 }, browser.sessionId);
    await browser.command('Input.dispatchKeyEvent', { type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9 }, browser.sessionId);
    const focused = await browser.evaluate<string | null>(`${JSON.stringify(enabled)}.find(selector => document.activeElement.matches(selector)) || null`);
    if (focused && !visited.includes(focused)) {
      const report = await reachReport(browser,focused,surface);
      if (!report.reachable) await captureReachability(browser, "tab-obstructed", report);
      assert.ok(report.reachable, `Tab reaches a visible, unobstructed ${focused}: ${JSON.stringify(report)}`);
      visited.push(focused);
    }
  }
  assert.deepEqual(visited.slice().sort(),enabled.slice().sort(),'Tab reaches every enabled core button from the writing field');
  return { enabled,visited,disabled:selectors.filter(selector => !enabled.includes(selector)) };
}

async function captureReachability(browser: LayoutBrowser, name: string, evidence: unknown) {
  await mkdir(captures, { recursive:true });
  const shot = await browser.command<{ data:string }>('Page.captureScreenshot', { format:'png' }, browser.sessionId);
  await writeFile(new URL(`${name}.png`, captures), Buffer.from(shot.data,'base64'));
  await writeFile(new URL(`${name}.json`, captures), JSON.stringify(evidence,null,2));

}

test('UIV-01/02/11 三入口在窄屏与短窗能通过真实滚轮到达书写、录音与发送操作', { timeout:120_000 }, async t => {
  const browser = await openGoalBrowser(t, 'seeded', undefined, null, {
    async request(method, params) { return method === 'thread/turns/list' ? { data:[], nextCursor:null } : { thread:{ id:params.threadId } }; },
    subscribe() { return () => undefined; },
  });
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId, localHost } = browser;
  assert.ok(localHost);
  const resources = await localHost.sessionResources();
  resources.registry.createSession({ runtime_id:'codex', native_runtime_session_id:'uiv-wheel', project_id:projectId, title:'滚轮可达验收', actor_id:'browser-test', user_confirmed:true });
  const feed = createLocalFeedApplication(browser.store.db);
  const source = createLocalFeedSourceService(browser.store.db, projectId).register({ kind:'research_library', repository:'molis-ai/research-library', research_source:'uiv-wheel' }).source;
  const item = feed.ingestItem({ source, externalId:'uiv-wheel', title:'真实首页浮层的可达验收', summary:'在首页事项中打开说一句', body:'浮层由首页实际路径打开，正文和接收目标由生产代码生成。', occurredAt:new Date().toISOString(), attention:false }).item;
  await feed.flushPendingJudgments();
  await localHost.withProject(molisWorkHostProjectReference({ databasePath:browser.databasePath, projectId }), () => undefined);
  await command('Emulation.setEmulatedMedia', { features:[{ name:'prefers-reduced-motion', value:'reduce' }] }, sessionId);
  await command('Emulation.setFocusEmulationEnabled', { enabled:true }, sessionId);
  const resize = async (width:number, height:number) => {
    await command('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false }, sessionId);
    await evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  };
  const draft = (selector:string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)}); field.value = ${JSON.stringify(LONG_DRAFT)}; field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await resize(1440,900);
  await navigate(() => command('Page.navigate', { url:`${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer]').dataset.uivBound === '1'");
  // UIV-11: the material strip occupies real space above a multiline dock, including on keyboard focus.
  await putInput(browser, LONG_DRAFT, "窄窗材料不能盖住主区");
  await waitFor("!document.querySelector('[data-assistant-context-strip]').hidden");
  const failures:string[] = [];
  const entries = [
    { name:'assistant', form:'[data-assistant-composer]', field:ASSISTANT, surface:'.workbench-bar', send:'[data-assistant-send]' },
    { name:'home', form:'[data-home-talk-form]', field:HOME, surface:'[data-home-talk]', send:'button[type=submit]' },
    { name:'coding', form:'[data-coding-composer]', field:CODING, surface:'[data-coding-dialogue]', send:'[data-coding-send]' },
  ];
  for (const entry of entries) {
    await resize(1440,900);
    if (entry.name === 'home') {
      const event = `[data-home-subject-kind="feed_item"][data-home-subject-id="${item.item_id}"]`;
      await click('[data-plugin-strip] [data-plugin-id="home"]');
      await waitFor(`!!document.querySelector(${JSON.stringify(event)})`);
      await click(event);
      await click('[data-home-open-talk]');
      await waitFor("document.querySelector('[data-home-talk-form]').dataset.uivBound === '1'");
    } else if (entry.name === 'coding') {
      await click('[data-plugin-strip] [data-plugin-id="coding"]');
      await waitFor("!document.querySelector('[data-coding-workbench]').hidden");
      const ready = "document.querySelector('[data-coding-task]') instanceof HTMLTextAreaElement && !document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-task]').getClientRects().length > 0";
      await waitFor(`(${ready}) || !!document.querySelector('[data-coding-session]')?.getClientRects().length || !!document.querySelector('[data-coding-new]')?.getClientRects().length`);
      if (!await evaluate<boolean>(ready)) {
        await click(await evaluate<boolean>("!!document.querySelector('[data-coding-session]')?.getClientRects().length") ? '[data-coding-session]' : '[data-coding-new]');
        await waitFor(ready);
      }
    }
    for (const [width,height] of [[477,560],[320,640],[390,844],[640,393],[1280,393]]) {
      await draft(ASSISTANT);
      if (await evaluate<boolean>("!document.querySelector('[data-assistant-panel]').hidden")) await click('[data-assistant-panel-close]');
      await draft(entry.field);
      await resize(width,height);
      const buttons = `${entry.form} .uiv-bar button`;
      const before = await evaluate<boolean[]>(`[...document.querySelectorAll(${JSON.stringify(buttons)})].map(button => button.hidden)`);
      try {
        // Layout fixtures expose production buttons; microphone/recognition behavior has separate real-path coverage.
        for (const [mode,attrs] of [['idle',['mic']],['recording',['stop-record','cancel-record']]] as const) {
          await evaluate(`document.querySelectorAll(${JSON.stringify(buttons)}).forEach(button => button.hidden = !${JSON.stringify(attrs)}.some(attr => button.hasAttribute('data-uiv-'+attr)))`);
          const reports = [];
          for (const selector of [entry.field,...attrs.map(attr => `${entry.form} [data-uiv-${attr}]`),`${entry.form} ${entry.send}`]) {
            const result = await reachByWheel(browser,selector,entry.surface);
            reports.push(result);
            if (!result.reached) failures.push(`${entry.name} ${width}x${height} ${mode}: ${selector} cannot be reached by wheel`);
            const rect = result.trace.at(-1)!.box;
            if (width <= 600 && (rect.width < 44 || rect.height < 44)) failures.push(`${entry.name} ${width}x${height} ${selector} is below the 44px touch floor`);
          }
          await captureReachability(browser,`wheel-${entry.name}-${width}x${height}-${mode}`,reports);
          const input = await reachByWheel(browser,entry.field,entry.surface);
          if (input.reached) {
            const top = await evaluate<number>(`document.querySelector(${JSON.stringify(entry.field)}).scrollTop`);
            const r = input.trace.at(-1)!.box;
            await command('Input.dispatchMouseEvent', { type:'mouseWheel',x:(r.left+r.right)/2,y:(r.top+r.bottom)/2,deltaX:0,deltaY:top > 0 ? -500 : 500 }, sessionId);
            await waitFor(`document.querySelector(${JSON.stringify(entry.field)}).scrollTop !== ${top}`);
            assert.equal(await evaluate(`document.querySelector(${JSON.stringify(entry.field)}).value`),LONG_DRAFT,'wheel scrolling preserves the whole draft');
            if (mode === 'idle') await reachByTab(browser,entry.field,[`${entry.form} [data-uiv-mic]`,`${entry.form} ${entry.send}`],entry.surface);
          }
        }
      } finally { await evaluate(`document.querySelectorAll(${JSON.stringify(buttons)}).forEach((button,index) => button.hidden = ${JSON.stringify(before)}[index])`); }
    }
  }
  assert.deepEqual(failures,[],'all three actual input surfaces retain reachable controls after the dock grows');
});
