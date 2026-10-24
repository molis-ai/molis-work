import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// VUX-28（复审 2026-10-20~23，PR #902 的 2026-10-21 复核补充）：Home 待办页的批量栏「移到」菜单
// 原来是一组普通 button，既没有 menuitem 语义、也没有单一 Tab 停点。这条用例钉住修复后的行为：
// 打开菜单后菜单项是 menuitem、整个菜单一个 Tab 停点、方向键在菜单内移动、Enter 触发当前项的移动动作。
test("Home Todo batch placement menu: menuitems, one tab stop, arrow keys and Enter", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin } = browser;
  const child = await pluginFrameBrowser(t, browser, "todo");
  const { evaluate, waitFor, click } = child;

  const press = async (key: string, code: string, virtualKeyCode: number, text?: string) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, ...(text === undefined ? {} : { text, unmodifiedText: text }) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode }, sessionId);
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };

  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/todo` }, sessionId));
  await waitFor("document.querySelector('[data-todo=workbench]') !== null");
  await waitFor("document.querySelector('[data-todo-loading]')?.hidden === true");

  // 造一条待办再选中它：批量栏只在有选中项时出现。
  await evaluate(`(() => {
    const input = document.querySelector('[data-todo-quick-input]');
    input.focus();
    input.value = '整理会议纪要';
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('[data-todo-quick-submit]')?.disabled === false");
  await click("[data-todo-quick-submit]");
  await waitFor("document.querySelector('[data-todo-note-text]')?.textContent.startsWith('已记下「整理会议纪要」')");
  await click('[data-todo-view="all"]');
  await waitFor("document.querySelector('[data-todo-rows]')?.textContent.includes('整理会议纪要')");
  await click("[data-todo-row] [data-todo-pick]");
  await waitFor("!document.querySelector('[data-todo-batch]').hidden && document.querySelector('[data-todo-batch-count]').textContent === '已选 1 件'");

  // 打开「移到」菜单：三个菜单项有 menuitem 语义，且整个菜单只有一个 Tab 停点。
  // Home 页没有项目上下文，客户端把「这个项目」项 hidden，所以实际可用项是「个人空间」「暂未归类」两项。
  await click(".todo-batch-more > summary");
  await waitFor("document.querySelector('.todo-batch-more')?.open === true");
  const menu = await evaluate<{ role: string | null; items: number; names: string[]; stops: number; focusable: number[] }>(`(() => {
    const menu = document.querySelector('.todo-batch-more [role=menu]');
    const items = [...menu.querySelectorAll('[role=menuitem]')];
    return { role: menu.getAttribute('role'), items: items.length, names: items.map(item => item.textContent.trim()), stops: items.filter(item => item.tabIndex >= 0).length, focusable: items.map(item => item.tabIndex) };
  })()`);
  assert.deepEqual(menu, { role: "menu", items: 3, names: ["个人空间", "这个项目", "暂未归类"], stops: 1, focusable: [0, -1, -1] });
  assert.equal(await evaluate("document.querySelector('.todo-batch-more [data-todo-batch-placement=project]').hidden"), true);

  // 从摘要按 Tab 进菜单落在第一项；方向键只在可见菜单项之间移动，焦点进入后仍只有一个 Tab 停点（共享 roving 接管）。
  await evaluate("document.querySelector('.todo-batch-more > summary').focus()");
  await press("Tab", "Tab", 9);
  assert.equal(await evaluate("document.activeElement?.dataset.todoBatchPlacement"), "personal");
  await press("ArrowDown", "ArrowDown", 40);
  assert.equal(await evaluate("document.activeElement?.dataset.todoBatchPlacement"), "unassigned");
  await press("ArrowUp", "ArrowUp", 38);
  assert.equal(await evaluate("document.activeElement?.dataset.todoBatchPlacement"), "personal");
  assert.deepEqual(await evaluate<number[]>("[...document.querySelectorAll('.todo-batch-more [role=menuitem]')].map(item => item.tabIndex)"), [0, -1, -1]);

  // Enter 触发当前菜单项的移动动作：「个人空间」。
  await press("Enter", "Enter", 13, "\r");
  await waitFor("!document.querySelector('[data-todo-note]').hidden && document.querySelector('[data-todo-note-text]').textContent === '已把 1 件移到个人空间'");
  assert.equal(await evaluate("document.querySelector('.todo-batch-more')?.open"), false);
});
