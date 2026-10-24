import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { KEYBOARD_FOCUS, KEYBOARD_GROUPS, type KeyboardGroup } from "./fixtures/keyboard-audit.js";
import { layoutFindings } from "./fixtures/layout-audit.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./fixtures/text-wrap-audit.js";

// specs/visual-ui-experience, the surfaces the 2026-10-20~23 review found outside every audit: a Home plugin's own pages
// (/plugins/issues, /plugins/todo), the side-view documents (/projects/<id>/side/issues/capture, .../lingguang/side), and
// the discussion side panel's real IM composer. The shell around them is what the existing audits already read; here the
// opaque plugin frame (and the IM iframe) are read from their own execution contexts.

/** Takes `field-sizing` away before the page's scripts run: `CSS.supports` says no and the property does nothing. */
const WITHOUT_FIELD_SIZING = `(() => { const supports = CSS.supports.bind(CSS);
  CSS.supports = (...args) => String(args[0]).includes('field-sizing') ? false : supports(...args);
  const still = () => { const style = document.createElement('style'); style.textContent = 'textarea{field-sizing:fixed!important}'; document.head.append(style); };
  if (document.head) still(); else document.addEventListener('DOMContentLoaded', still); })();`;

const KEYS: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 };

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Child = Awaited<ReturnType<typeof pluginFrameBrowser>>;

/** A `data-fit` field on a surface the audits did not reach: it grows with the lines written in it, and falls back. */
async function growsAndFallsBack(browser: Browser, child: Child, selector: string): Promise<void> {
  const { command, sessionId } = browser;
  assert.equal(await child.evaluate("typeof window.molisFit === 'function'"), true, `${selector}: the page carries the field-fit program`);
  const box = JSON.stringify(selector);
  const height = () => child.evaluate<number>(`document.querySelector(${box}).getBoundingClientRect().height`);
  await child.evaluate(`(() => { const field = document.querySelector(${box}); field.scrollIntoView({ block: 'center' }); field.focus(); })()`);
  const empty = await height();
  for (let line = 1; line <= 8; line++) await command("Input.insertText", { text: (line === 1 ? "" : "\n") + "第 " + line + " 行：" + "写满一行再多一点的长度".repeat(3) }, sessionId);
  const grown = await height();
  assert.ok(grown > empty + 8, `${selector}: the fallback field grows with what is written (${empty} → ${grown})`);
  await child.evaluate(`document.querySelector(${box}).select()`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  assert.equal(await height(), empty, `${selector}: an emptied field falls back to its start`);
}

/** VUX-28 on one surface: rooms the groups, one tab stop each, arrows along their orientation, Home and End, page still. */
async function keyboardGroups(browser: Browser, child: Child, where: string, found: string[], expected: number): Promise<number> {
  const press = async (key: string) => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await browser.command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] }, browser.sessionId);
    await child.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  const focus = () => child.evaluate<{ at: string; page: number }>(KEYBOARD_FOCUS);
  const groups = (await child.evaluate<KeyboardGroup[]>(KEYBOARD_GROUPS)).sort((a, b) => Number(a.role === "tablist") - Number(b.role === "tablist"));
  assert.ok(groups.length >= expected, `${where}: the audit found the groups (${groups.length} < ${expected}: ${JSON.stringify(groups)})`);
  let tested = 0;
  for (const group of groups) {
    const label = `${where} ${group.role} "${group.name}"`;
    const start = await child.evaluate<string | null>(`(() => { const items = [...document.querySelectorAll('[data-kbd-item^="${group.index}:"]')].filter(item => item.getClientRects().length);
      if (!items.length) return null;
      const typing = 'input:not([type=button], [type=checkbox], [type=radio]), textarea, select';
      document.activeElement?.blur?.();
      const stop = items.find(item => item.tabIndex >= 0 && !item.matches(typing)) ?? items.find(item => !item.matches(typing));
      stop?.focus({ preventScroll: true }); return stop?.dataset.kbdItem ?? null; })()`);
    if (start === null) continue;
    tested++;
    if (group.stops !== 1) found.push(`${label}: ${group.stops} tab stops`);
    const before = await focus();
    if (before.at !== start) { found.push(`${label}: focus did not land (${before.at})`); continue; }
    const i = Number(start.split(":")[1]);
    await press(group.vertical ? "ArrowDown" : "ArrowRight");
    const next = await focus();
    if (next.at !== `${group.index}:${(i + 1) % group.count}`) found.push(`${label}: arrow from ${i} → ${next.at}`);
    if (next.page !== before.page) found.push(`${label}: the page scrolled ${before.page} → ${next.page}`);
    if (!next.at.startsWith(`${group.index}:`)) continue;
    await press("End");
    if ((await focus()).at !== `${group.index}:${group.count - 1}`) found.push(`${label}: End`);
    await press("Home");
    if ((await focus()).at !== `${group.index}:0`) found.push(`${label}: Home`);
  }
  return tested;
}

test("VUX-16 (fallback): the fields on the Home Issue page, the Issue side view and the Lingguang side view grow and fall back", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: WITHOUT_FIELD_SIZING }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  const issues = await pluginFrameBrowser(t, browser, "issues");
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await issues.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 30_000);
  await growsAndFallsBack(browser, issues, "[data-issue-composer] textarea[name=description]");

  const capture = await pluginFrameBrowser(t, browser, "issues");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/side/issues/capture` }, sessionId));
  await capture.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 30_000);
  await growsAndFallsBack(browser, capture, "[data-issue-composer] textarea[name=description]");

  const lingguang = await pluginFrameBrowser(t, browser, "lingguang");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/side/lingguang/side` }, sessionId));
  // The child root exists while still hidden, and becomes visible before its client has installed the listeners.
  await browser.waitFor("document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]')?.dataset.uiClientState === 'ready' && document.querySelector('[data-side-view-root] > [data-work-surface=lingguang]').checkVisibility()", 30_000);
  // The one data-fit field on the side view is the chat's composer; it appears once an idea is jotted down and the
  // conversation pane is opened. That is the path a person takes: 记下 → 头脑风暴.
  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang-title]')?.getClientRects().length", 20_000);
  await lingguang.evaluate("(() => { const title = document.querySelector('[data-lingguang-title]'); title.focus(); title.value = '侧栏里的一条灵光'; title.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await lingguang.waitFor("document.querySelector('[data-lingguang-save-status]')?.textContent === '已保存'", 20_000);
  await lingguang.click("[data-lingguang-brainstorm-current]");
  await lingguang.waitFor("!document.querySelector('[data-lingguang-pane=chat]').hidden && document.querySelector('textarea[data-lingguang-chat-input][data-fit]')?.getClientRects().length", 30_000);
  await growsAndFallsBack(browser, lingguang, "textarea[data-lingguang-chat-input][data-fit]");
});

test("VUX-16 (fallback): the discussion side panel's IM composer is the same field, and grows and falls back", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: WITHOUT_FIELD_SIZING }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')", 20_000);
  await click("[data-side-toggle]");
  await waitFor("document.querySelector('[data-side-tab=\"discussion\"]')?.checkVisibility()", 10_000);
  await click("[data-side-tab=\"discussion\"]");
  const im = "document.querySelector('[data-side-body=\"discussion\"] iframe')?.contentDocument";
  await waitFor(`${im}?.querySelector('[data-name-form] input')`, 30_000);
  await evaluate(`(() => { const form = ${im}.querySelector('[data-name-form]'); form.querySelector('input').value = '浏览器用例'; form.requestSubmit(); })()`);
  await waitFor(`${im}?.querySelector('[data-conversations]')?.hidden === false`, 30_000);
  const composer = `${im}.querySelector('#im-group-input')`;
  await waitFor(`${composer} && !${composer}.disabled`, 20_000);
  assert.equal(await evaluate(`${composer}.hasAttribute('data-fit')`), true, "the composer is the shared field");
  assert.equal(await evaluate(`typeof ${im}.defaultView.molisFit === 'function'`), true, "the IM page carries the field-fit program");
  const height = () => evaluate<number>(`${composer}.getBoundingClientRect().height`);
  await evaluate(`(() => { const field = ${composer}; field.focus(); })()`);
  const empty = await height();
  for (let line = 1; line <= 6; line++) await command("Input.insertText", { text: (line === 1 ? "" : "\n") + "第 " + line + " 行：讨论里要说清楚的事" }, sessionId);
  const grown = await height();
  assert.ok(grown > empty + 8, `the IM composer grows with what is written (${empty} → ${grown})`);
  await evaluate(`${composer}.select()`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await evaluate("new Promise(resolve => setTimeout(resolve, 120))");
  assert.equal(await height(), empty, "an emptied composer falls back to its start");
});

test("VUX-28: Home Todo's placement and placement-choices radios rove, one tab stop each", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const todo = await pluginFrameBrowser(t, browser, "todo");
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/todo` }, sessionId));
  await todo.waitFor("document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]')?.hidden === true", 30_000);
  const found: string[] = [];
  // The quick add's placement radio group is on the page as it opens.
  assert.ok(await keyboardGroups(browser, todo, "Home Todo quick", found, 1) >= 1, "the quick add's placement group is audited");

  // One todo, so the detail editor's placement choices radio group can be opened.
  await todo.evaluate("(() => { const input = document.querySelector('[data-todo-quick-input]'); input.focus(); })()");
  await command("Input.insertText", { text: "验收 Home 待办的键盘分组" }, sessionId);
  await todo.evaluate("document.querySelector('[data-todo-quick-submit]').click()");
  // The quick add answers in whichever view the item belongs to; every view lists it from "全部".
  await todo.waitFor("Boolean(document.querySelector('[data-todo-view=all]'))", 10_000);
  await todo.evaluate("document.querySelector('[data-todo-view=all]').click()");
  await todo.waitFor("document.querySelector('[data-todo-rows]')?.textContent.includes('验收 Home 待办的键盘分组')", 20_000);
  // The batch toolbar's "移到" disclosure menu is left out: its items are plain buttons without role=menuitem, so the
  // shared roving (and its audit) do not manage it — measured as three tab stops when the disclosure is open, which is a
  // separate product gap from the radio groups this test proves rove in a Home frame.
  await todo.evaluate("document.querySelector('[data-todo-row] [data-todo-id]').click()");
  await todo.waitFor("!document.querySelector('[data-todo-stage-workspace]').hidden", 20_000);
  await todo.waitFor("document.querySelectorAll('[data-todo-placement-choices] [role=radio]').length >= 2", 20_000);
  await todo.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  // The status choices are aria-pressed toggle buttons (the same markup on the project page), so the shared audit's
  // radiogroup definition — radios in a radiogroup — reads the placement choices group, not it.
  assert.ok(await keyboardGroups(browser, todo, "Home Todo detail", found, 1) >= 1, "the placement choices radio group is audited");
  assert.deepEqual(found, []);
});

test("VUX-28: the Issue type radio group in a Home Issue and in the Issue side view rove, one tab stop each", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const child = await pluginFrameBrowser(t, browser, "issues");
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 30_000);
  const api = <T = unknown>(path: string, body: unknown) => evaluate<T>(`(async () => { const response = await fetch(${JSON.stringify(path)}, { method: 'POST',
    headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(${JSON.stringify(body)}) });
    const text = await response.text(); if (!response.ok) throw new Error(response.status + ' ' + text); return JSON.parse(text); })()`);
  const record = await api<{ id: string }>("/api/plugins/io.molis.work.issues/create", { title: "Home 与侧栏的键盘", type: "bug", description: "编辑表单里的类型单选用键盘。" });
  const found: string[] = [];
  for (const [where, path] of [["Home Issue", "/plugins/issues"], ["Issue side view", `/projects/${projectId}/side/issues/capture`]] as const) {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 30_000);
    await child.waitFor(`document.querySelector('[data-issue-id=${JSON.stringify(record.id)}]')`, 20_000);
    await child.click(`[data-issue-id=${JSON.stringify(record.id)}]`);
    await child.waitFor("!document.querySelector('[data-issue-detail]').hidden", 15_000);
    await child.click("[data-issue-edit]");
    await child.waitFor("!document.querySelector('[data-issue-editor]').hidden && document.querySelector('[data-issue-types=edit] [role=radio]')?.getClientRects().length", 15_000);
    // The shared roving settles the type group on the frame after the editor is shown; read it after that frame.
    await child.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.ok(await keyboardGroups(browser, child, where, found, 1) >= 1, `the issue type group is audited on ${where}`);
  }
  assert.deepEqual(found, []);
});

test("VUX-04 VUX-30: Home Issue/Todo pages and Issue/Lingguang side views wrap text and lay out cleanly at 1280 and 390 px", { timeout: 300_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  const children = {
    issues: await pluginFrameBrowser(t, browser, "issues"),
    todo: await pluginFrameBrowser(t, browser, "todo"),
    lingguang: await pluginFrameBrowser(t, browser, "lingguang"),
  };
  const surfaces: Array<[string, string, keyof typeof children]> = [
    ["Home Issues", "/plugins/issues", "issues"],
    ["Home Todo", "/plugins/todo", "todo"],
    ["侧栏 Issues capture", `/projects/${projectId}/side/issues/capture`, "issues"],
    ["侧栏 Lingguang", `/projects/${projectId}/side/lingguang/side`, "lingguang"],
  ];
  const found: string[] = [];
  for (const width of [1280, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [name, path, frame] of surfaces) {
      const child = children[frame];
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await waitFor("document.readyState === 'complete' && document.fonts.status === 'loaded'", 20_000);
      if (frame === "issues") await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 30_000);
      else if (frame === "todo") await child.waitFor("document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]')?.hidden === true", 30_000);
      else await child.waitFor("document.querySelector('[data-lingguang=workbench]') && document.querySelector('textarea[data-lingguang-chat-input]')", 30_000);
      await child.waitFor("document.fonts.status === 'loaded'", 10_000);
      // Long names and long copy, as the narrow surfaces carry: the seeded data is short, so it is lengthened in place.
      await child.evaluate(`(() => { const LONG = '，再加上一段很长的说明，长到任何一行都放不下，这样才能看出换行与截断之后还找不找得回来';
        for (const el of document.querySelectorAll('h1, h2, h3, p, li, .todo-title, .issues-row strong, [data-lingguang] .mw-input')) {
          if (el.dataset.stressed) continue; el.dataset.stressed = ''; el.append(document.createTextNode(LONG)); } })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const issue of await child.evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)) found.push(`${width} ${name}: wrap ${JSON.stringify(issue)}`);
      const layout = (await layoutFindings(child.evaluate)).filter(finding => !(width === 1280 && finding.kind === "tiny-target"));
      for (const issue of layout) found.push(`${width} ${name}: layout ${JSON.stringify(issue)}`);
    }
  }
  assert.deepEqual(found, [], "the Home plugin pages and the side views carry no wrap or layout fault at either width");
});
