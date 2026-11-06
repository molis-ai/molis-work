import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// 07-S2 (specs/product-flow-governance §4.6.2 S2; PFG-22, PFG-23, PFG-24, PFG-25): the project home is the Dock's, not a tab;
// ＋ only opens, beside its button, from the Host's directory, and says where an open plugin already is; opening it again
// goes there (recall) instead of a second copy; the title bar's one layout button acts on the focused column, with 独看 its
// own state; a tab moves to the right side and back, and the side remembers its history and the tabs closed there.

const TABS = "[data-titlebar-tabs]";
const PLUS = `${TABS} .tab-add-button`;
const OPEN_MENU = "[data-workspace-open-menu]";
const LAYOUT_MENU = "[data-workspace-layout]";
const GOALS_TAB = `${TABS} .tab-item[data-tab-kind=plugin][data-plugin=goals]`;
const MOVED = "pane:goals:plugin";
const stored = "JSON.parse(localStorage.getItem('molis-work-tab-workspace:' + document.body.dataset.projectId) || 'null')";

test("PFG-22 PFG-23 PFG-24 ＋ opens from the directory, recalls what is open, and the layout button acts on the focused column", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.body.dataset.desktopSurface === 'home' && document.querySelector('${PLUS}') && document.querySelector('[data-dock-pin=home]')`, 15_000);
  const mac = await evaluate<boolean>("/Mac|iP/.test(navigator.platform)");
  const key = async (name: string, code: string, modifiers = 0) => {
    // A plain ↵ carries its text, so a focused button activates as under a real key; a chord does not.
    const text = name === "Enter" && !modifiers ? { text: "\r" } : {};
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, modifiers, windowsVirtualKeyCode: name === "Enter" ? 13 : 0, ...text }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, modifiers }, sessionId);
  };
  const META = mac ? 4 : 2, SHIFT = 8;

  // 口径 3: the home is no tab; the strip starts empty.
  assert.equal(await evaluate(`document.querySelectorAll('${TABS} .tab-item').length`), 0, "the project home is the Dock's, not a tab");

  // PFG-23: ＋ opens a list beside itself: search, the project's plugins, then the person's, then what was just closed.
  await click(PLUS);
  await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open') && document.activeElement?.matches('${OPEN_MENU} input')`);
  const menu = await evaluate<{ groups: string[]; ids: string[]; beside: boolean; expanded: string | null; near: boolean }>(`(() => {
    const menu = document.querySelector('${OPEN_MENU}'), plus = document.querySelector('${PLUS}').getBoundingClientRect(), box = menu.getBoundingClientRect();
    return { groups: [...menu.querySelectorAll('.mw-menu__group')].map(group => group.getAttribute('aria-label')),
      ids: [...menu.querySelectorAll('[data-plus-open]')].map(row => row.dataset.plusOpen),
      beside: [...menu.querySelectorAll('[data-plus-open]')].every(row => row.getAttribute('aria-keyshortcuts') === 'Alt+Enter' && row.nextElementSibling?.matches('.tab-menu-beside[aria-hidden=true][tabindex="-1"]')),
      expanded: document.querySelector('${PLUS}').getAttribute('aria-expanded'),
      near: Math.abs(box.top - plus.bottom) < 16 && box.left < plus.right + 8 };
  })()`);
  assert.deepEqual(menu.groups, ["这个项目的插件", "个人 · 所有项目共用", "刚关掉的"]);
  assert.ok(menu.ids.includes("goals"), JSON.stringify(menu.ids));
  assert.equal(menu.beside, true, "every row opens beside by ⌥↵; its pointer button stays out of the tab order and the menu items");
  assert.equal(menu.expanded, "true");
  assert.equal(menu.near, true, "the list opens at ＋, not as a centred dialog");
  // Typing narrows it; Esc closes it and puts focus back on ＋.
  await evaluate(`(() => { const input = document.querySelector('${OPEN_MENU} input'); input.value = 'zz-no-such-plugin'; input.dispatchEvent(new Event('input')); })()`);
  assert.equal(await evaluate(`[...document.querySelectorAll('${OPEN_MENU} [data-plus-open]')].filter(row => row.checkVisibility()).length`), 0);
  await key("Escape", "Escape");
  await waitFor(`!document.querySelector('${OPEN_MENU}').matches(':popover-open') && document.activeElement?.matches('${PLUS}')`);
  assert.equal(await evaluate(`document.querySelector('${PLUS}').getAttribute('aria-expanded')`), "false");

  // ↵ on a row opens it in this pane.
  await click(PLUS);
  await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open')`);
  await evaluate(`document.querySelector('${OPEN_MENU} [data-plus-open=goals]').focus()`);
  await key("Enter", "Enter");
  await waitFor(`document.body.dataset.desktopSurface === 'goals' && document.querySelector('${GOALS_TAB}[aria-current]')`, 15_000);

  // PFG-24 recall: the open plugin says where it is, and choosing it again (here, or from the Dock) goes there: no second tab.
  await click(PLUS);
  await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open')`);
  assert.equal(await evaluate(`document.querySelector('${OPEN_MENU} [data-plus-open=goals] .tab-menu-where')?.textContent`), "在这一栏");
  await click(`${OPEN_MENU} [data-plus-open=goals]`);
  await waitFor(`!document.querySelector('${OPEN_MENU}').matches(':popover-open')`);
  await click("[data-dock-pin=home]");
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate(`document.querySelectorAll('${GOALS_TAB}').length`), 1, "recall does not open a second Goals tab");

  // 口径 6: one layout button at the title bar's end, no split button on the strip.
  assert.equal(await evaluate(`document.querySelector('${TABS} [data-tab-split], .tab-split-button')`), null);
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open') && document.activeElement?.closest('${LAYOUT_MENU}')`);
  const items = await evaluate<{ title: string | null; actions: string[]; splits: string[]; panes: string[] }>(`(() => {
    const menu = document.querySelector('${LAYOUT_MENU}');
    return { title: menu.getAttribute('aria-label'), actions: [...menu.querySelectorAll('[data-layout-action]')].map(row => row.dataset.layoutAction),
      splits: [...menu.querySelectorAll('[data-layout-split]')].map(row => row.dataset.layoutSplit), panes: [...menu.querySelectorAll('[data-focus-pane]')].map(row => row.dataset.focusPane) };
  })()`);
  assert.equal(items.title, "布局 · 主区");
  assert.deepEqual(items.splits, ["right", "bottom"]);
  assert.deepEqual(items.actions, ["to-side", "solo", "merge", "side", "equal", "close"]);
  assert.equal(items.panes.length >= 1, true);
  // ↓ moves through the rows; Esc closes and puts focus back on the button.
  const first = await evaluate<string>("document.activeElement.textContent");
  await key("ArrowDown", "ArrowDown");
  assert.notEqual(await evaluate<string>("document.activeElement.textContent"), first);
  await key("Escape", "Escape");
  await waitFor(`!document.querySelector('${LAYOUT_MENU}').matches(':popover-open') && document.activeElement?.matches('[data-layout-open]')`);

  // Split right, then 独看 (⌘⇧↵, 口径 2): only the focused pane shows; again, both come back. `solo` is its own field.
  await click(GOALS_TAB + " .tab-item-trigger, " + GOALS_TAB);
  await waitFor("document.body.dataset.desktopSurface === 'goals'");
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
  await click(`${LAYOUT_MENU} [data-layout-split=right]`);
  await waitFor("document.querySelectorAll('[data-tab-workspace] .tab-pane, [data-tab-workspace] .tab-content-frame').length >= 2", 15_000);
  await key("Enter", "Enter", META | SHIFT);
  await waitFor("document.querySelector('[data-tab-workspace][data-solo], .tab-workspace[data-solo]')");
  const solo = await evaluate<{ shown: number; saved: unknown; exclusive: unknown }>(`({ shown: new Set([...document.querySelectorAll('.tab-workspace-panes > :is(.tab-pane, .tab-content-frame)')].filter(node => node.checkVisibility()).map(node => node.dataset.tabPane || node.dataset.paneOwner)).size,
    saved: ${stored}?.solo, exclusive: ${stored}?.exclusive })`);
  assert.equal(solo.shown, 1, "独看 shows only the focused pane");
  assert.ok(solo.saved && typeof (solo.saved as { paneId: unknown }).paneId === "string", JSON.stringify(solo));
  assert.equal(solo.exclusive, null, "独看 is not the cover (exclusive)");
  await key("Enter", "Enter", META | SHIFT);
  await waitFor("!document.querySelector('.tab-workspace[data-solo]')");

  // 合并: every pane's tabs join the focused one.
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
  // The title names the focused column: the split's new pane took the focus.
  const at = await evaluate<number>(`${stored}.panes.findIndex(pane => pane.id === ${stored}.focusedPaneId) + 1`);
  assert.equal(at, 2);
  assert.equal(await evaluate(`document.querySelector('${LAYOUT_MENU}').getAttribute('aria-label')`), "布局 · 第 2 栏");
  await click(`${LAYOUT_MENU} [data-layout-action=merge]`);
  await waitFor(`${stored}?.panes.length === 1`);
  assert.equal(await evaluate(`document.querySelectorAll('${GOALS_TAB}').length`), 1);
});

test("PFG-22 PFG-25 a tab moves to the right side and back, by counted requests; the side keeps its history and closed tabs", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, reloadPage } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${PLUS}') && document.querySelector('[data-side-tabs] [data-side-tab]')`, 15_000);
  const mac = await evaluate<boolean>("/Mac|iP/.test(navigator.platform)");
  const META = mac ? 4 : 2;
  const toggleSide = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "\\", code: "Backslash", modifiers: META }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "\\", code: "Backslash", modifiers: META }, sessionId);
  };
  // Same-origin requests, by kind: a view rebuilt is a Document load; its own reads are fetches.
  const seen: Array<{ url: string; type: string }> = [];
  const off = browser.on("Network.requestWillBeSent", params => {
    const { request, type } = params as { request: { url: string }; type: string };
    if (new URL(request.url).origin === origin) seen.push({ url: request.url, type });
  });
  t.after(off);
  await command("Network.enable", {}, sessionId);
  const since = () => { const start = seen.length; return () => seen.slice(start); };

  await click("[data-plugin-strip] [data-plugin-id=goals], [data-dock-pin=goals]");
  await waitFor(`document.body.dataset.desktopSurface === 'goals' && document.querySelector('${GOALS_TAB}[aria-current]')`, 15_000);

  // Move to the right: the tab leaves the strip and shows in the side, in the workbench's pane page. One document load.
  let mark = since();
  await evaluate(`document.querySelector('${GOALS_TAB}').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 20 }))`);
  await waitFor("document.querySelector('[data-tab-menu-action=to-side]')?.checkVisibility()");
  await click("[data-tab-menu-action=to-side]");
  await waitFor(`!document.querySelector('${GOALS_TAB}') && document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"][aria-selected=true]')`, 15_000);
  await waitFor(`document.querySelector('[data-side-body="${MOVED}"] iframe')?.contentDocument?.readyState === 'complete'`, 20_000);
  await evaluate(`document.querySelector('[data-side-body="${MOVED}"] iframe').contentWindow.__kept = true`);
  const moved = mark();
  const documents = moved.filter(entry => entry.type === "Document");
  assert.equal(documents.length, 1, "moving to the right loads one document, the pane page: " + JSON.stringify(documents.map(entry => entry.url)));
  assert.match(documents[0]!.url, /workbenchPane=side/u);
  t.diagnostic(`07-S2 move to the right: ${moved.length} same-origin requests (${documents.length} document, ${moved.filter(entry => entry.type === "Fetch" || entry.type === "XHR").length} reads)`);

  // Switching side tabs, collapsing and opening the side, and recalling the moved view rebuild nothing.
  mark = since();
  const other = await evaluate<string>(`[...document.querySelectorAll('[data-side-tabs] [data-side-tab]:not([data-side-pane])')].find(tab => tab.checkVisibility()).dataset.sideTab`);
  await click(`[data-side-tabs] [data-side-tab="${other}"]`);
  await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${other}"][aria-selected=true]')`);
  await click(`[data-side-tabs] [data-side-tab="${MOVED}"]`);
  await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"][aria-selected=true]')`);
  await toggleSide();
  await waitFor("document.body.dataset.sideOpen === 'false'");
  await toggleSide();
  await waitFor("document.body.dataset.sideOpen === 'true'");
  const otherLoads = mark().filter(entry => entry.type === "Document" && entry.url.includes("workbenchPane"));
  assert.deepEqual(otherLoads, [], "switching, collapsing and opening the side load no pane page again");
  assert.equal(await evaluate(`document.querySelector('[data-side-body="${MOVED}"] iframe').contentWindow.__kept`), true, "the moved view stays the same document");

  // The side's 返回 steps back through what it showed (its own history, with the focus in the side).
  await click(`[data-side-tabs] [data-side-tab="${other}"]`);
  await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${other}"][aria-selected=true]') && !document.querySelector('[data-workspace-history=back]').disabled`);
  await click("[data-workspace-history=back]");
  await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"][aria-selected=true]')`);

  // Back to the main area: the main surface shows Goals again, with no document load.
  mark = since();
  await evaluate(`document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`);
  await waitFor("document.querySelector('[data-side-menu=to-main]')?.checkVisibility()");
  await click("[data-side-menu=to-main]");
  await waitFor(`document.querySelector('${GOALS_TAB}[aria-current]') && document.body.dataset.desktopSurface === 'goals' && !document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"]')`, 15_000);
  const back = mark();
  assert.equal(back.filter(entry => entry.type === "Document").length, 0, "moving back reuses the main surface: " + JSON.stringify(back.filter(entry => entry.type === "Document").map(entry => entry.url)));
  t.diagnostic(`07-S2 move back: ${back.length} same-origin requests (${back.filter(entry => entry.type === "Fetch" || entry.type === "XHR").length} reads)`);

  // A side tab closed stays closed across a reload (side.closed, in the same workspace state).
  await evaluate(`document.querySelector('[data-side-tabs] [data-side-tab="${other}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`);
  await waitFor("document.querySelector('[data-side-menu=close]')?.checkVisibility()");
  await click("[data-side-menu=close]");
  await waitFor(`${stored}?.side.closed.includes(${JSON.stringify(other)})`);
  await reloadPage();
  await waitFor(`document.querySelector('${PLUS}') && document.querySelector('[data-side-tabs]')`, 15_000);
  assert.equal(await evaluate(`Boolean(${stored}?.side.tabs.some(tab => tab.itemId === ${JSON.stringify(other)}))`), false, "the closed side tab did not come back on reload");
  assert.equal(await evaluate(`document.querySelector('[data-side-tabs] [data-side-tab="${other}"]')?.hasAttribute('data-side-closed') ?? true`), true);
});
