import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

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
const GOALS_ENTRY = "[data-plugin-strip] [data-plugin-id=goals], [data-dock-pin=goals]";
// Every toast text shown from now on, so a toast left from the step before cannot pass for this one.
const WATCH_TOASTS = `(() => { window.__toasts = []; if (window.__toastWatch) return; const toast = document.querySelector('[data-toast]');
  window.__toastWatch = new MutationObserver(() => window.__toasts.push(toast.textContent)); window.__toastWatch.observe(toast, { childList: true, characterData: true, subtree: true, attributes: true }); })()`;
const toasted = (text: string) => `window.__toasts.some(shown => shown.includes(${JSON.stringify(text)}))`;

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
  const ends = await evaluate<boolean>(`(() => { const layout = document.querySelector('[data-layout-open]').getBoundingClientRect();
    return [...document.querySelector('.immersive-titlebar').querySelectorAll('button')].filter(button => button.checkVisibility() && !button.matches('[data-layout-open]')).every(button => button.getBoundingClientRect().right <= layout.left + 1) && innerWidth - layout.right < 24; })()`);
  assert.equal(ends, true, "the layout button is the title bar's last control, at its right end");
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

  // PFG-24 口径 8 ③: opening the moved tab again, from the Dock or from ＋, goes to it on the right and says so; nothing opens in
  // the main area and the view is not loaded again.
  await evaluate(WATCH_TOASTS);
  for (const route of ["the Dock", "＋"] as const) {
    await click(`[data-side-tabs] [data-side-tab="${other}"]`);
    await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${other}"][aria-selected=true]')`);
    mark = since();
    await evaluate("window.__toasts = []");
    if (route === "the Dock") await click(GOALS_ENTRY);
    else {
      await click(PLUS);
      await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open')`);
      assert.equal(await evaluate(`document.querySelector('${OPEN_MENU} [data-plus-open=goals] .tab-menu-where')?.textContent`), "在右侧");
      await click(`${OPEN_MENU} [data-plus-open=goals]`);
    }
    await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"][aria-selected=true]') && ${toasted("已在右侧打开，切过去了")}`, 10_000);
    assert.equal(await evaluate(`document.querySelectorAll('${GOALS_TAB}').length + ${stored}.panes.flatMap(pane => pane.tabs).filter(tab => tab.plugin === 'goals').length`), 0, `${route}: no Goals tab opens in the main area`);
    assert.equal(await evaluate(`document.querySelector('[data-side-body="${MOVED}"] iframe').contentWindow.__kept`), true, `${route}: the moved view is the same document`);
    assert.deepEqual(mark().filter(entry => entry.type === "Document" && entry.url.includes("workbenchPane")), [], `${route}: no pane page loads again`);
  }

  // PFG-22 口径 2: the right side is a column like the main area's, so 独看 with the focus there shows the side alone, from
  // ⌘⇧↵ (on the page and in the side's pane page) and from the layout menu; again, or 独看中 · 显示全部, brings the layout
  // back. `solo` names the side, and nothing loads again.
  const sideAlone = `document.body.hasAttribute('data-side-solo') && ${stored}.solo?.paneId === ${stored}.side.id && ${stored}.solo.side === false`;
  const covers = `(() => { const panel = document.querySelector('.side-panel').getBoundingClientRect();
    return panel.left < 40 && panel.right > innerWidth - 40 && getComputedStyle(document.querySelector('[data-plugin-stage]')).visibility === 'hidden'; })()`;
  const layoutBack = `!document.body.hasAttribute('data-side-solo') && ${stored}.solo === null && document.body.dataset.sideOpen === 'true'
    && document.querySelector('.side-panel').getBoundingClientRect().left > innerWidth / 3 && getComputedStyle(document.querySelector('[data-plugin-stage]')).visibility === 'visible'`;
  const soloKey = async () => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: META | 8, windowsVirtualKeyCode: 13 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: META | 8 }, sessionId);
  };
  mark = since();
  await click(`[data-side-tabs] [data-side-tab="${MOVED}"]`);
  await waitFor(`document.querySelector('[data-side-tabs] [data-side-tab="${MOVED}"][aria-selected=true]')`);
  await soloKey();
  await waitFor(sideAlone);
  assert.equal(await evaluate(covers), true, "the side takes the stage; the main area steps aside");
  await soloKey();
  await waitFor(layoutBack);
  // The side's pane page hands ⌘⇧↵ up, as a main pane's does.
  await evaluate(`document.querySelector('[data-side-body="${MOVED}"] iframe').contentDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, metaKey: ${mac}, ctrlKey: ${!mac}, bubbles: true }))`);
  await waitFor(sideAlone);
  await soloKey();
  await waitFor(layoutBack);
  // The layout menu, with the focus in the side, offers it too, and its row brings the layout back.
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
  assert.equal(await evaluate(`document.querySelector('${LAYOUT_MENU}').getAttribute('aria-label')`), "布局 · 右侧");
  await click(`${LAYOUT_MENU} [data-layout-action=solo]`);
  await waitFor(sideAlone);
  assert.equal(await evaluate(covers), true);
  // 601–760: the side's strip is the title bar's second row, so the side alone starts below that row, as its sheet does.
  await command("Emulation.setDeviceMetricsOverride", { width: 700, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("innerWidth === 700");
  const below = await evaluate<{ panel: number; strip: number; bottom: number; covered: boolean }>(`(() => {
    const panel = document.querySelector('.side-panel').getBoundingClientRect(), strip = document.querySelector('.immersive-titlebar > [data-side-tabs]').getBoundingClientRect();
    return { panel: panel.top, strip: strip.bottom, bottom: panel.bottom, covered: ${covers} }; })()`);
  assert.ok(below.covered && below.panel >= below.strip && below.panel - below.strip <= 24 && below.bottom <= 900, `700 wide, 独看 on the right starts below the strip row and stays on screen: ${JSON.stringify(below)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`innerWidth === 1440 && ${sideAlone}`);
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
  assert.match(await evaluate<string>(`document.querySelector('${LAYOUT_MENU} [data-layout-action=solo]').textContent`), /独看中 · 显示全部/u);
  await click(`${LAYOUT_MENU} [data-layout-action=solo]`);
  await waitFor(layoutBack);
  assert.equal(await evaluate(`document.querySelector('[data-side-body="${MOVED}"] iframe').contentWindow.__kept`), true, "独看 on the right reloads nothing");
  assert.deepEqual(mark().filter(entry => entry.type === "Document" && entry.url.includes("workbenchPane")), []);

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

test("PFG-24 07-AUDIT 口径 8 ① Goals open in the other column is recalled there from the switcher, the Dock, ＋ and a link: the focus moves, a toast says so, no second copy", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  // The recall routes below are counted apart: going to a view that is already open never loads the page (or its document) again.
  const seen: Array<{ url: string; type: string }> = [];
  const off = browser.on("Network.requestWillBeSent", params => {
    const { request, type } = params as { request: { url: string }; type: string };
    if (new URL(request.url).origin === origin) seen.push({ url: request.url, type });
  });
  t.after(off);
  await command("Network.enable", {}, sessionId);
  const since = () => { const start = seen.length; return () => seen.slice(start); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const project = `${origin}/projects/${projectId}/`;
  await navigate(() => command("Page.navigate", { url: project }, sessionId));
  await waitFor(`document.querySelector('${PLUS}') && document.querySelector('[data-dock-pin=home]')`, 15_000);
  // Two columns, both on the project home; the split's new column (the second) takes the focus.
  await click("[data-layout-open]");
  await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
  await click(`${LAYOUT_MENU} [data-layout-split=right]`);
  await waitFor(`${stored}?.panes.length === 2`);
  const [first, second] = await evaluate<string[]>(`${stored}.panes.map(pane => pane.id)`);
  assert.equal(await evaluate(`${stored}.focusedPaneId`), second);
  const focusColumn = async (paneId: string) => {
    await click("[data-layout-open]");
    await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
    await click(`${LAYOUT_MENU} [data-focus-pane="${paneId}"]`);
    await waitFor(`${stored}.focusedPaneId === ${JSON.stringify(paneId)}`);
  };
  await focusColumn(first!);
  await click(GOALS_ENTRY);
  await waitFor(`${stored}.panes[0].tabs.some(tab => tab.kind === 'plugin' && tab.plugin === 'goals')`, 15_000);
  // Only the first column holds Goals, the second still shows the home, and nothing else differs between the routes.
  const recalled = async (route: string) => {
    await waitFor(`${stored}.focusedPaneId === ${JSON.stringify(first)} && ${toasted("已在另一栏打开，切过去了")}`, 15_000);
    const after = await evaluate<{ goals: number; second: { tabs: number; view: unknown } }>(`(() => { const saved = ${stored};
      return { goals: saved.panes.flatMap(pane => pane.tabs).filter(tab => tab.plugin === 'goals').length,
        second: { tabs: saved.panes[1].tabs.length, view: saved.panes[1].viewPlugin } }; })()`);
    assert.deepEqual(after, { goals: 1, second: { tabs: 0, view: null } }, `${route}: no second copy of Goals`);
  };

  // The bar's switcher lists every plugin; choosing one that is open in the other column goes there, as the Dock does.
  await focusColumn(second!);
  await evaluate(WATCH_TOASTS);
  const viaSwitcher = since();
  await click("[data-plugin-picker-popover] [data-plugin-id=goals]");
  await recalled("the switcher");
  assert.deepEqual(viaSwitcher().filter(entry => entry.type === "Document"), [], "recalling from the switcher loads no document");

  await focusColumn(second!);
  await evaluate("window.__toasts = []");
  const viaDock = since();
  await click("[data-dock-pin=goals]");
  await recalled("the Dock");
  assert.deepEqual(viaDock().filter(entry => entry.type === "Document"), [], "recalling from the Dock loads no document");

  // Split, each column has its own strip and ＋ (the title bar's strip is the one column's only); the second column's.
  await focusColumn(second!);
  await evaluate("window.__toasts = []");
  await click(`[data-tab-pane="${second}"] .tab-add-button`);
  await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open')`);
  assert.equal(await evaluate(`document.querySelector('${OPEN_MENU} [data-plus-open=goals] .tab-menu-where')?.textContent`), "在第 1 栏");
  await click(`${OPEN_MENU} [data-plus-open=goals]`);
  await recalled("＋");

  // A link loads the page again, so no toast is left over: the one showing (or about to) is this link's.
  await focusColumn(second!);
  await navigate(() => command("Page.navigate", { url: `${project}?openPlugin=goals` }, sessionId));
  await evaluate(`(() => { ${WATCH_TOASTS}; window.__toasts.push(document.querySelector('[data-toast]')?.textContent ?? ''); })()`);
  await recalled("the link ?openPlugin=goals");
});

test("PFG-24 口径 8 ② a Dataset record found from the other column opens in the column that holds Dataset, with no item tab", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, click, waitFor } = b;
  const dataset = await pluginFrameBrowser(t, b, "dataset");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-plugin-strip] [data-plugin-id=dataset]");
  await dataset.click("[data-dataset-empty] [data-dataset-new]");
  await dataset.waitFor("!document.querySelector('[data-dataset-stage-workspace]').hidden && document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await dataset.evaluate("(() => { const el = document.querySelector('[data-dataset-title]'); el.value = '另一栏召回这份数据'; el.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await dataset.waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  const id = await dataset.evaluate<string>("document.querySelector('[data-dataset-id]').dataset.datasetId");
  // The first column keeps Dataset's tab while it shows the home, so the split's new column starts on the home and holds nothing.
  await click("[data-dock-pin=home]");
  await click("[data-layout-open]"); await click("[data-layout-split=right]");
  await waitFor(`${stored}?.panes.length === 2`);
  const [first, second] = await evaluate<string[]>(`${stored}.panes.map(pane => pane.id)`);
  assert.equal(await evaluate(`${stored}.focusedPaneId`), second);
  assert.equal(await evaluate(`${stored}.panes[1].tabs.length`), 0);

  await evaluate(WATCH_TOASTS);
  await click("[data-global-search-open]");
  await evaluate("(() => { const el = document.querySelector('[data-global-search]'); el.value = '另一栏召回这份数据'; el.dispatchEvent(new Event('input', {bubbles:true})); })()");
  // Content results come from the system search, so they arrive after the request, not with the keystroke.
  await waitFor(`Boolean(document.querySelector('[data-global-search-id="${id}"]'))`, 15_000);
  await click(`[data-global-search-id="${id}"]`);
  await waitFor(`${stored}.focusedPaneId === ${JSON.stringify(first)} && ${toasted("已在另一栏打开，切过去了")}`, 15_000);
  const ownerFrame = `iframe.tab-content-frame[data-pane-owner="${first}"]:not([hidden])`;
  await waitFor(`document.querySelector(${JSON.stringify(ownerFrame)})`, 20_000);
  const held = await pluginFrameBrowser(t, b, "dataset", ownerFrame);
  await held.waitFor("document.querySelector('[data-dataset-title]')?.value === '另一栏召回这份数据' && !document.querySelector('[data-dataset-stage-workspace]').hidden", 20_000);
  const tabs = await evaluate<{ itemTabs: number; savedItems: number; second: number }>(`(() => { const saved = ${stored};
    return { itemTabs: document.querySelectorAll('.tab-item[data-plugin=dataset][data-item-id]').length,
      savedItems: saved.panes.flatMap(pane => pane.tabs).filter(tab => tab.plugin === 'dataset' && tab.kind === 'item').length, second: saved.panes[1].tabs.length }; })()`);
  assert.deepEqual(tabs, { itemTabs: 0, savedItems: 0, second: 0 }, "the record opens in Dataset's own column, as no item tab in either");
});

// Review evidence (ignored folder unless MOLIS_WORK_REVIEW_EVIDENCE=1): ＋'s list with one plugin already open, and the layout
// menu, at three widths, in both languages and both themes.
test("PFG-23 review shots of ＋ and the layout menu at 1440, 1024 and 390, Chinese and English, light and dark", { timeout: 240_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { waitFor, evaluate, command, sessionId, navigate, origin, projectId } = browser;
  const evidence = reviewEvidenceUrl("07-s2-open-layout/"); await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(name + ".png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  for (const lang of ["zh", "en"] as const) for (const theme of ["light", "dark"] as const) for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 760 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
    await waitFor(`document.querySelector('${PLUS}')`, 15_000);
    if (!(await evaluate<boolean>(`Boolean(document.querySelector('${GOALS_TAB}'))`))) {
      await evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=goals], [data-dock-pin=goals]')?.click()");
      await waitFor(`document.querySelector('${GOALS_TAB}')`, 15_000);
    }
    const name = `${lang}-${theme}-${width}`;
    await evaluate(`document.querySelector('${PLUS}').click()`);
    await waitFor(`document.querySelector('${OPEN_MENU}')?.matches(':popover-open')`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(name + "-plus");
    await evaluate(`document.querySelector('${OPEN_MENU} input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await waitFor(`!document.querySelector('${OPEN_MENU}').matches(':popover-open')`);
    await evaluate("document.querySelector('[data-layout-open]').click()");
    await waitFor(`document.querySelector('${LAYOUT_MENU}')?.matches(':popover-open')`);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(name + "-layout");
    await evaluate(`document.querySelector('${LAYOUT_MENU}').hidePopover()`);
  }
});
