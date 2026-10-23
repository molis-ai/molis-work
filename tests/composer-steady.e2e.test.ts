import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";

// specs/visual-ui-experience §composer-mentions (VUX-16): a composer's box and its main action stay where they are while a round
// starts, runs and ends. The round's settings (way of working, model) give way first, shortened and read whole on hover,
// so pause, stop and send sit together on the right and the bar does not wrap onto a second line when they appear; a
// narrow composer has its settings on their own row, idle or running alike.

const coding = "[data-coding-workbench]";
type Geometry = { task: number[]; send: number[]; rows: number; outside: string[]; controls: string[]; cut: string[] };
const GEOMETRY = `(() => { const box = (node) => { const b = node.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
  const shell = document.querySelector('${coding} .coding-composer-shell').getBoundingClientRect();
  const controls = [...document.querySelectorAll('${coding} .coding-composer-bar :is(button, a)')].filter((node) => node.getClientRects().length && !node.closest('[role=menu], [hidden]'));
  const label = (node) => (node.getAttribute('aria-label') || node.textContent.trim()).slice(0, 24);
  return { task: box(document.querySelector('${coding} [data-coding-task]')), send: box(document.querySelector('${coding} [data-coding-send]')),
    rows: new Set(controls.map((node) => { const b = node.getBoundingClientRect(); return Math.round((b.top + b.bottom) / 2 / 8); })).size,
    outside: controls.filter((node) => { const b = node.getBoundingClientRect(); return b.left < shell.left - 0.5 || b.right > shell.right + 0.5; }).map(label),
    controls: controls.map(label),
    cut: controls.flatMap((node) => [...node.querySelectorAll('[data-mw-select-label]')]).filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent) }; })()`;

async function oneRound(t: test.TestContext, width: number, locale: "zh" | "en") {
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "coding");
  let active: Pick<typeof browser,"evaluate"|"waitFor"|"click"> = browser;
  const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
  const click: typeof browser.click = (...args) => active.click(...args);
  const model = await assistantTextModel(t, homeDirectory, "这一段写完了。", { pieces: 2, pause: 100 });
  const workspace = join(homeDirectory, "steady");
  await mkdir(workspace, { recursive: true }); await writeFile(join(workspace, "note.txt"), "x\n");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill("[data-project-workspaces-add] [name=path]", workspace);
  await click("[data-project-workspaces-add] [type=submit]");
  await waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('steady')");
  await click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  active = child;
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-task]').disabled && document.querySelector('${coding} [data-coding-model]').options.length >= 1`);
  await fill(`${coding} [data-coding-model]`, JSON.stringify(["local-only", "fixture-model"]));
  await fill(`${coding} [data-coding-intent]`, "discuss");
  await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await fill(`${coding} [data-coding-task]`, "写一段");
  await waitFor(`!document.querySelector('${coding} [data-coding-send]').disabled`);
  await evaluate("document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
  const ready = await evaluate<Geometry>(GEOMETRY);
  await click(`${coding} [data-coding-send]`);
  await waitFor(`[...document.querySelectorAll('${coding} [data-coding-turns] [data-kind="assistant"]')].some(node => node.textContent.includes('第一段')) && document.querySelector('${coding} [data-coding-stop]').getClientRects().length > 0`, 60_000);
  const running = await evaluate<Geometry>(GEOMETRY);
  return { browser: {...browser,...child}, model, ready, running, ended: async () => {
    model.finish();
    await waitFor(`!document.querySelector('${coding} [data-coding-stop]').getClientRects().length && !document.querySelector('${coding} [data-coding-mode]').getClientRects().length`, 60_000);
    return evaluate<Geometry>(GEOMETRY);
  } };
}

test("VUX-16: the box and send stay put through a round; pause and stop join send on one row; a shortened setting reads whole on hover", { timeout: 180_000 }, async (t) => {
  const round = await oneRound(t, 1360, "zh"); if (!round) return;
  const { browser: { evaluate, waitFor, command, sessionId }, ready, running } = round;
  assert.equal(ready.rows, 1); assert.equal(running.rows, 1, `running, the bar is one row: ${running.controls.join(" | ")}`);
  assert.deepEqual(running.controls.slice(-3), ["暂停", "停止", "发送"], "pause and stop sit with send, on the right");
  assert.deepEqual([ready.outside, running.outside], [[], []], "nothing leaves the composer");
  assert.ok(running.cut.some((text) => text.includes("fixture-model")), `the model's name gives way first: ${JSON.stringify(running.cut)}`);
  assert.ok(!running.cut.some((text) => text === "讨论"), "the way of working stays whole");
  // The shortened model reads whole under the pointer, through the page's one tip.
  const at = await round.browser.point(`${coding} .mw-select-picker:has([data-coding-model]) .mw-select-picker__trigger`);
  await command("Input.dispatchMouseEvent", {type:"mouseMoved", ...at}, sessionId);
  await waitFor("document.querySelector('.craft-tip[data-shown]')?.textContent.includes('fixture-model')", 5_000);
  const ended = await round.ended();
  assert.equal(ended.rows, 1);
  assert.deepEqual([ended.task, ended.send], [running.task, running.send], "the box and send are where they were while it ran");
});

test("VUX-16: a narrow composer keeps its settings on their own row, idle or running, and nothing moves when the round ends (English)", { timeout: 180_000 }, async (t) => {
  const round = await oneRound(t, 480, "en"); if (!round) return;
  const { browser: { evaluate }, ready, running } = round;
  assert.ok(await evaluate<number>(`document.querySelector('${coding} .coding-composer-shell').getBoundingClientRect().width`) <= 480, "the composer is narrow here");
  assert.deepEqual([ready.rows, running.rows], [2, 2], `settings above, actions below, idle and running: ${running.controls.join(" | ")}`);
  assert.deepEqual(running.controls.slice(-3), ["Pause", "Stop", "Send"]);
  assert.deepEqual([ready.outside, running.outside], [[], []], "nothing leaves the composer");
  const ended = await round.ended();
  assert.equal(ended.rows, 2);
  assert.deepEqual([ended.task, ended.send], [running.task, running.send]);
});

test("VUX-16: the Assistant's box and send stay put as a file is added and a round runs, and the file sits right above the box", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const model = await assistantTextModel(t, homeDirectory, "这一段写完了。", { pieces: 2, pause: 100 });
  type Place = { input: number[]; send: number[]; top: number; strip: number[] | null };
  const place = () => evaluate<Place>(`(() => { const box = (node) => { if (!node || !node.getClientRects().length) return null; const b = node.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    return { input: box(document.querySelector('[data-assistant-input]')), send: box(document.querySelector('[data-assistant-send]')),
      top: Math.round(document.querySelector('[data-assistant-composer]').getBoundingClientRect().top), strip: box(document.querySelector('[data-assistant-context-strip]')) }; })()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] [data-assistant-input]')", 20_000);
  const idle = await place();
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await command("Input.insertText", { text: "看看这个文件" }, sessionId);
  await evaluate(`(() => { const data = new DataTransfer(); data.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    document.querySelector('[data-assistant-composer]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); })()`);
  await waitFor("document.querySelector('[data-assistant-context-strip]')?.textContent.includes('notes.txt')");
  const attached = await place();
  assert.deepEqual([attached.input, attached.send], [idle.input, idle.send], "adding a file does not move the box or send");
  assert.ok(attached.strip && attached.top - (attached.strip[1]! + attached.strip[3]!) <= 8 && attached.top - (attached.strip[1]! + attached.strip[3]!) >= 0, `the file sits right above the box: ${JSON.stringify(attached)}`);
  await evaluate("document.querySelector('[data-assistant-send]').click()");
  await waitFor("document.body.textContent.includes('第一段')", 60_000);
  const running = await place();
  model.finish();
  await waitFor("document.body.textContent.includes('这一段写完了')", 60_000);
  const ended = await place();
  assert.deepEqual([running.input, running.send, ended.input, ended.send], [idle.input, idle.send, idle.input, idle.send], "through the round the box and send stay where they were");
});

test("VUX-16: the discussion's send stays at the composer's corner when the status beside it speaks", { timeout: 120_000 }, async (t) => {
  // The field's growth here needs the shared field-fit program on the IM page, which #919 brings (the #894 review).
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')");
  await click("[data-side-toggle]");
  await waitFor("document.querySelector('[data-side-tab=\"discussion\"]')?.checkVisibility()");
  await click("[data-side-tab=\"discussion\"]");
  const im = "document.querySelector('[data-side-body=\"discussion\"] iframe')?.contentDocument";
  await waitFor(`${im}?.querySelector('[data-name-form] input')`, 30_000);
  await evaluate(`(() => { const form = ${im}.querySelector('[data-name-form]'); form.querySelector('input').value = '读者'; form.requestSubmit(); })()`);
  await waitFor(`${im}?.querySelector('[data-conversations]')?.hidden === false && ${im}.querySelector('#im-group-input')`, 30_000);
  await waitFor(`${im}?.querySelector('[data-composer="group"] .im-send')?.getBoundingClientRect().width > 0 && ${im}.querySelector('#im-group-input')?.getBoundingClientRect().height > 0`);
  await evaluate(`${im}.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))`);
  type Place = { send: number[]; field: number[]; form: number[]; outside: boolean };
  const place = () => evaluate<Place>(`(() => { const doc = ${im}, form = doc.querySelector('[data-composer="group"]'), box = (node) => { const b = node.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round); };
    const f = form.getBoundingClientRect(), s = doc.querySelector('[data-composer="group"] .im-send').getBoundingClientRect();
    return { send: box(doc.querySelector('[data-composer="group"] .im-send')), field: box(doc.querySelector('#im-group-input')), form: box(form), outside: s.right > f.right + 0.5 || s.bottom > f.bottom + 0.5 }; })()`);
  const quiet = await place();
  // The status line speaks beside the send; the send does not move for it.
  await evaluate(`(() => { const status = ${im}.querySelector('[data-compose-status="group"]'); status.textContent = '这条消息还没有发出去，网络恢复后会再试一次'; status.classList.add('is-error'); })()`);
  const spoken = await place();
  assert.deepEqual([spoken.send, spoken.field, spoken.outside], [quiet.send, quiet.field, false], "a long status beside it does not move the field or the send, or push the send out");
});
