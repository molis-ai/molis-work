import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// 07-1 S3, the tab strip of scheme A (specs/product-flow-governance §4.6.2 S3; docs/design/workbench-navigation; PFG-22, PFG-24,
// PFG-26): a group's head and its tabs are two tiers with a hairline between; tabs narrow to 96px and only then does the strip
// scroll, with 全部标签 at its end listing every tab by group; the column without the focus keeps only its place; a record
// that is gone is struck through and its pane says so; 独看 says so at the strip's end; on a phone 主区｜右侧 leads the strip
// and every tab but the current one, pinned ones too, is reached from 全部标签.

const TABS = "[data-titlebar-tabs]";
const ALL = `${TABS} [data-tab-all]`;
const ALL_MENU = "[data-workspace-all-tabs]";
const KEY = "'molis-work-tab-workspace:' + document.body.dataset.projectId";

/** A pinned Goal, Goals with three records (one gone), a person's group of two, then Pages and Issues. */
const seeded = (solo: boolean) => `(() => {
  const side = JSON.parse(localStorage.getItem(${KEY})).side;
  const item = (id, itemId, title, rest = {}) => ({ id, plugin: "goals", kind: "item", itemId, title, ...rest });
  const tabs = [item("tpin", "V1", "让第一次使用的人顺利完成一轮目标协作", { pinned: true }), { id: "tgoals", plugin: "goals", kind: "plugin", title: "Goals" },
    item("tg1", "PLATFORM", "让项目事实成为不同 Runtime 的共同底座"), item("tg2", "INTERFACES", "让不同 AI 对话看到同一项目进度"),
    item("tgone", "goal-gone-s3", "旧的发布清单"), item("tg3", "RISK", "安装文档和真实接入步骤对不上", { groupId: "gweek" }),
    item("tg4", "CORE", "让每项工作都有可信的完成依据", { groupId: "gweek" }),
    { id: "tpages", plugin: "pages", kind: "plugin", title: "Pages" }, { id: "tissues", plugin: "issues", kind: "plugin", title: "Issue" }];
  localStorage.setItem(${KEY}, JSON.stringify({ panes: [{ id: "p1", tabs, activeTabId: "tg1", groups: [{ id: "gweek", title: "发布周", color: "green", collapsed: false }], viewPlugin: "goals" }],
    layout: { direction: "row", sizes: [1], tree: { paneId: "p1" } }, focusedPaneId: "p1", exclusive: null, side, solo: ${solo ? `{ paneId: "p1", side: false }` : "null"} }));
})()`;

test("PFG-22 PFG-24 PFG-26 scheme A: two tiers, tabs narrow to 96px before the strip scrolls, 全部标签 lists every tab by group", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  const key = async (name: string, code: string) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code }, sessionId);
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${TABS} .tab-add-button') && localStorage.getItem(${KEY})`, 15_000);

  // With two plugins open and nothing behind them the strip holds everything: no 全部标签.
  assert.equal(await evaluate(`document.querySelector('${ALL}')?.hidden`), true, "全部标签 shows only once the strip cannot hold its tabs");

  await evaluate(seeded(false));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${TABS} [data-tab-id=tg1][aria-current]')`, 15_000);

  // Two tiers: the Goals head, then a hairline, then its records.
  const tiers = await evaluate<{ after: string | null; hidden: string | null }>(`(() => {
    const sep = document.querySelector('${TABS} [data-plugin-group=goals] .tab-group-sep');
    return { after: sep?.previousElementSibling?.dataset.tabKind ?? null, hidden: sep?.getAttribute('aria-hidden') ?? null };
  })()`);
  assert.deepEqual(tiers, { after: "plugin", hidden: "true" }, "the group's head and its tabs are a hairline apart");

  // Narrowing: the record tabs stop at 96px and the strip scrolls; 全部标签 comes up at its end with the count. The window narrows
  // so the strip cannot hold nine tabs whether or not the right side was left open (it remembers that across pages, 07-1 S4b).
  await command("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`!document.querySelector('${ALL}').hidden`);
  const strip = await evaluate<{ min: number; scrolls: boolean; count: string; label: string | null }>(`(() => {
    const items = [...document.querySelectorAll('${TABS} .tab-item[data-tab-kind=item]:not([data-pinned])')].filter(tab => tab.checkVisibility());
    const scroll = document.querySelector('${TABS} .tab-scroll');
    return { min: Math.min(...items.map(tab => Math.round(tab.getBoundingClientRect().width))), scrolls: scroll.scrollWidth > scroll.clientWidth + 1,
      count: document.querySelector('${ALL} .tab-all-count').textContent, label: document.querySelector('${ALL}').getAttribute('aria-label') };
  })()`);
  assert.equal(strip.min, 96, "tabs narrow to 96px and no further");
  assert.equal(strip.scrolls, true);
  assert.equal(strip.count, "9");
  assert.equal(strip.label, "全部标签 · 9 张");

  // 全部标签 opens beside its button: search first, then a section per group with its count, the current tab marked.
  await click(ALL);
  await waitFor(`document.querySelector('${ALL_MENU}')?.matches(':popover-open') && document.activeElement?.matches('${ALL_MENU} input')`);
  const menu = await evaluate<{ sections: (string | null)[]; current: string | null; expanded: string | null; near: boolean }>(`(() => {
    const menu = document.querySelector('${ALL_MENU}'), button = document.querySelector('${ALL}').getBoundingClientRect(), box = menu.getBoundingClientRect();
    return { sections: [...menu.querySelectorAll('.mw-menu__group')].map(group => group.getAttribute('aria-label')),
      current: menu.querySelector('[aria-current]')?.dataset.allTab ?? null, expanded: document.querySelector('${ALL}').getAttribute('aria-expanded'),
      near: Math.abs(box.top - button.bottom) < 16 };
  })()`);
  // The last section holds Pages and Issues, each open with nothing behind it: one unnamed section rather than one each.
  assert.deepEqual(menu.sections, ["已固定 · 1 张", "Goals · 4 张", "发布周 · 2 张", null]);
  assert.equal(menu.current, "tg1");
  assert.equal(menu.expanded, "true");
  assert.equal(menu.near, true, "the list opens at its button");
  // Typing narrows it; Esc closes it and gives the focus back.
  await evaluate(`(() => { const input = document.querySelector('${ALL_MENU} input'); input.value = '底座'; input.dispatchEvent(new Event('input')); })()`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${ALL_MENU} [data-all-tab]')].filter(row => row.checkVisibility()).map(row => row.dataset.allTab)`), ["tg1"]);
  await key("Escape", "Escape");
  await waitFor(`!document.querySelector('${ALL_MENU}').matches(':popover-open') && document.activeElement?.matches('${ALL}')`);
  assert.equal(await evaluate(`document.querySelector('${ALL}').getAttribute('aria-expanded')`), "false");
  // Pressing it again while open closes it rather than opening it once more.
  await click(ALL);
  await waitFor(`document.querySelector('${ALL_MENU}').matches(':popover-open')`);
  await click(ALL);
  await waitFor(`!document.querySelector('${ALL_MENU}').matches(':popover-open')`);

  // Choosing a row goes to that tab as pressing it on the strip would.
  await click(ALL);
  await waitFor(`document.querySelector('${ALL_MENU}').matches(':popover-open')`);
  await click(`${ALL_MENU} [data-all-tab=tg4]`);
  await waitFor(`document.querySelector('${TABS} [data-tab-id=tg4][aria-current]') && !document.querySelector('${ALL_MENU}').matches(':popover-open')`, 15_000);

  // A record that is gone: its tab is struck through and stays; its pane says so and offers the way out.
  await click(ALL);
  await waitFor(`document.querySelector('${ALL_MENU}').matches(':popover-open')`);
  await click(`${ALL_MENU} [data-all-tab=tgone]`);
  await waitFor(`document.querySelector('${TABS} [data-tab-id=tgone][data-tab-state=gone]') && document.querySelector('[data-tab-gone-stage=tgone]')?.checkVisibility()`, 15_000);
  const gone = await evaluate<{ title: string; label: string | null; buttons: string[]; strike: string }>(`(() => {
    const stage = document.querySelector('[data-tab-gone-stage=tgone]'), tab = document.querySelector('${TABS} [data-tab-id=tgone]');
    return { title: stage.querySelector('h2').textContent, label: tab.querySelector('.tab-item-trigger').getAttribute('aria-label'),
      buttons: [...stage.querySelectorAll('button')].map(button => button.textContent), strike: getComputedStyle(tab.querySelector('.tab-item-name')).textDecorationLine };
  })()`);
  assert.equal(gone.title, "这一条已经不在了");
  assert.match(gone.label ?? "", /这一条已经不在了/);
  assert.deepEqual(gone.buttons, ["关闭标签", "回到 Goals 列表"]);
  assert.equal(gone.strike, "line-through");
  await click("[data-tab-gone-stage=tgone] .mw-btn--secondary");
  await waitFor(`!document.querySelector('${TABS} [data-tab-id=tgone]') && !document.querySelector('[data-tab-gone-stage]')`);

  // The column without the focus keeps only its place: moving into the right side marks the main strip unfocused.
  assert.equal(await evaluate(`document.querySelector('${TABS}').hasAttribute('data-unfocused')`), false);
  await click("[data-side-tabs] [data-side-tab]");
  await waitFor(`document.querySelector('${TABS}').hasAttribute('data-unfocused') && !document.querySelector('[data-side-tabs]').hasAttribute('data-unfocused')`);
});

test("PFG-22 PFG-26 独看 says so at the strip's end, and a phone leads with 主区｜右侧 and folds the other tabs into 全部标签", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`localStorage.getItem(${KEY})`, 15_000);
  await evaluate(seeded(true));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${TABS} [data-solo-chip]')`, 15_000);
  assert.equal(await evaluate(`document.querySelector('${TABS} [data-solo-chip]').textContent`), "独看中 · 显示全部");
  await click(`${TABS} [data-solo-chip]`);
  await waitFor(`!document.querySelector('${TABS} [data-solo-chip]') && JSON.parse(localStorage.getItem(${KEY})).solo === null`);

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('${TABS} > .tab-pane-switch')?.checkVisibility()`, 15_000);
  const phone = await evaluate<{ shown: string[]; all: boolean; switch: (string | null)[]; overflow: boolean; rowHeight: number; target: number }>(`(() => ({
    shown: [...document.querySelectorAll('${TABS} [data-tab-id]')].filter(tab => tab.checkVisibility()).map(tab => tab.dataset.tabId),
    all: document.querySelector('${ALL}').checkVisibility(),
    switch: [...document.querySelectorAll('${TABS} [data-pane-switch]')].map(button => button.getAttribute('aria-pressed')),
    overflow: document.documentElement.scrollWidth > innerWidth,
    rowHeight: Math.round(document.querySelector('${TABS}').getBoundingClientRect().height),
    target: Math.min(...[...document.querySelectorAll('${TABS} > .tab-pane-switch > button, ${ALL}')].map(node => node.getBoundingClientRect().height)),
  }))()`);
  assert.deepEqual(phone.shown, ["tg1"], "a phone shows the current tab alone; the pinned one too is in 全部标签");
  assert.equal(phone.all, true, "a phone always shows 全部标签");
  assert.deepEqual(phone.switch, ["true", "false"]);
  assert.equal(phone.overflow, false);
  // One row, as the 定样 draws it (52px at most): the current tab beside the switch, so the page is not pushed down once the strip is drawn (VUX-31).
  assert.ok(phone.rowHeight <= 52, `the phone strip is one row: ${phone.rowHeight}px`);
  assert.ok(phone.target >= 44, `touch targets ${phone.target}`);
  // 右侧 shows the right side and takes the focus there.
  await click(`${TABS} [data-pane-switch=side]`);
  await waitFor(`document.querySelector('${TABS} [data-pane-switch=side]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-side-panel]')?.checkVisibility()`);
});
