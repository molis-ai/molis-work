import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/** WCAG contrast of every tab title in a group against the tint it sits on, composited over the desk. */
const GROUP_CONTRAST = `(() => {
  const rgb = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const desk = rgb(getComputedStyle(document.body).backgroundColor);
  return [...document.querySelectorAll("[data-titlebar-tabs] .tab-group .tab-item")].map((tab) => {
    let bg = over(rgb(getComputedStyle(tab.closest(".tab-group")).backgroundColor), desk);
    const own = rgb(getComputedStyle(tab).backgroundColor);
    if (own[3]) bg = over(own, bg);
    const a = lum(rgb(getComputedStyle(tab.querySelector(".tab-item-name")).color)), b = lum(bg);
    return { tab: tab.dataset.plugin + "/" + tab.dataset.tabKind, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
})()`;

test("PTG-01 PTG-06 PTG-07 PTG-09 plugins stay on the strip as coloured groups; ⌘-click opens a record in its group", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "feed", actor_id: "plugin-tab-groups" });
  catalog.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  const plugin = (id: string) => `[data-titlebar-tabs] .tab-item[data-tab-kind=plugin][data-plugin=${id}]`;

  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(`document.querySelector('${plugin("goals")}[aria-current]')`);
  await click("[data-titlebar-tabs] [data-tab-add]");
  await click("[data-tab-menu-action=open-feed]");
  await waitFor(`document.querySelector('${plugin("feed")}[aria-current]') && document.querySelector('${plugin("goals")}:not([aria-current])')`);
  // PTG-07 the plugin tab is the place; no location chip ahead of the tabs.
  assert.equal(await evaluate("document.querySelector('.tab-view-chip:not(.is-exclusive)')"), null);
  await click(`${plugin("goals")} .tab-item-trigger`);
  await waitFor(`document.body.dataset.desktopSurface === 'goal' && document.querySelector('${plugin("goals")}[aria-current]')`);

  // PTG-06 a ⌘-click on a Goal in the list opens it in the Goals group and the pane stays on the list.
  // D24 the Goals tree does not pick several, so the ⌘-click is still the tab group's (the other side of the D24 case below).
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('.tree-node[data-select-goal=\"CORE\"]')?.getClientRects().length > 0");
  const point = await evaluate<{ x: number; y: number }>("(() => { const r = document.querySelector('.tree-node[data-select-goal=\"CORE\"]').getBoundingClientRect(); return { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2 }; })()");
  for (const type of ["mousePressed", "mouseReleased"] as const) {
    await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1, modifiers: 4 }, sessionId);
  }
  await waitFor("document.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')");
  assert.equal(await evaluate(`document.querySelector('${plugin("goals")}')?.getAttribute('aria-current')`), "page");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-plugin-group=goals] .tab-item')].map((tab) => tab.dataset.tabKind).join()"), "plugin,item");

  // PTG-09 a plugin's group takes the plugin's hue, and every title in it reads at 4.5:1 or better in both themes.
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=goals]').style.getPropertyValue('--group-color')"), "var(--hue-blue)");
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=feed]').style.getPropertyValue('--group-color')"), "var(--hue-brown)");
  for (const scheme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`(() => { document.documentElement.dataset.theme = "${scheme}"; document.documentElement.dataset.resolvedTheme = "${scheme}"; })()`);
    await waitFor(`getComputedStyle(document.body).getPropertyValue('--hue-blue').trim() === ${JSON.stringify(scheme === "light" ? "#3c6fc6" : "#8fb2f5")}`);
    const low = (await evaluate<Array<{ tab: string; ratio: number }>>(GROUP_CONTRAST)).filter((entry) => entry.ratio < 4.5);
    assert.deepEqual(low, [], `${scheme}: every title in a group reads at 4.5:1`);
  }

  // PTG-06 in a split pane (an iframe) the ⌘-click is handed to the workbench and opens in that pane's Goals group.
  await evaluate("document.querySelector('[data-plugin-group=goals] .tab-item[data-item-id=CORE] [data-tab-close]').click()");
  await waitFor("!document.querySelector('[data-plugin-group=goals] .tab-item[data-item-id=CORE]')");
  await evaluate(`(() => {
    const transfer = new DataTransfer(), body = document.querySelector('[data-tab-pane-body]'), r = body.getBoundingClientRect();
    document.querySelector('${plugin("feed")}').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: r.left + r.width * 0.95, clientY: r.top + r.height / 2 };
    body.dispatchEvent(new DragEvent('dragover', at)); body.dispatchEvent(new DragEvent('drop', at));
  })()`);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const goalsPaneId = await evaluate<string>("[...document.querySelectorAll('[data-tab-pane]')].find((pane) => pane.querySelector('[data-plugin-group=goals]')).dataset.tabPane");
  const goalsPaneSelector = `[data-tab-pane=${JSON.stringify(goalsPaneId)}]`;
  const goalsPane = `document.querySelector(${JSON.stringify(goalsPaneSelector)})`;
  await evaluate(`${goalsPane}.querySelector('.tab-item[data-tab-kind=plugin][data-plugin=goals] .tab-item-trigger').click()`);
  const frame = `document.querySelector('iframe[data-pane-owner="' + ${goalsPane}.dataset.tabPane + '"]')`;
  await waitFor(`${frame}?.contentDocument?.querySelector('[data-record-owner=goals] [data-tree-item][data-goal-id=CORE]')`, 30_000);
  await evaluate(`(() => { const f = ${frame}; f.contentDocument.querySelector('[data-tree-item][data-goal-id=CORE] .tree-node').dispatchEvent(new f.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true, ctrlKey: true })); })()`);
  await waitFor(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')`);
  assert.equal(await evaluate(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[aria-current]')?.dataset.tabKind`), "plugin", "the pane stays on the Goals page");

  // PRR-07 PTG-05: the parent owns the split pane's visible strip; the embedded page's strip is hidden and does not own CORE.
  // Keep the pane identity through closing the group, then use its visible undo chip to restore the group and current page.
  await click(`${goalsPaneSelector} [data-tab-kind=plugin][data-plugin=goals] [data-tab-close]`);
  await waitFor(`!${goalsPane}.querySelector('[data-plugin-group=goals] [data-tab-kind=plugin][data-plugin=goals]')`);
  await waitFor(`${goalsPane}.querySelector('[data-tab-undo]')`, 10_000);
  await click(`${goalsPaneSelector} [data-tab-undo]`);
  await waitFor(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')`);
  assert.equal(await evaluate(`${goalsPane}.querySelector('[data-plugin-group=goals] .tab-item[aria-current]')?.dataset.tabKind`), "plugin", "undo restores the Goals page as current");
});

test("D24 a list that picks several keeps ⌘-click for picking; a middle click there still opens the page behind", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const store = openPagesStore(homeDirectory);
  const pages = (() => { try { return ["A", "B", "C"].map((letter) => store.create({ project_id: projectId!, title: `Page ${letter}`, body: { type: "doc", content: [] } })); } finally { store.close(); } })();
  const [a, b, c] = pages.map((page) => page.id) as [string, string, string];
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${a}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-rows] button[data-page-id="${c}"]')?.getClientRects().length > 0`);
  const selected = `[...document.querySelectorAll('[data-pages-rows] button[data-page-id]')].filter((row) => row.getAttribute('aria-selected') === 'true').map((row) => row.dataset.pageId).sort().join()`;
  assert.deepEqual(await child.evaluate(`(() => { const list = document.querySelector('[data-pages-rows]'); return [list.getAttribute('role'), list.getAttribute('aria-multiselectable'), list.querySelector('button[data-page-id]').getAttribute('role')]; })()`),
    ["listbox", "true", "option"], "the list says it picks several");
  const press = async (id: string, button: "left" | "middle", modifiers: number) => {
    const point = await child.point(`[data-pages-rows] button[data-page-id="${id}"]`);
    for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button, clickCount: 1, modifiers }, sessionId);
  };

  // D24 a real ⌘-click on B picks it, with the open A, and opens no tab.
  await press(b, "left", 4);
  await child.waitFor(`(${selected}) === ${JSON.stringify([a, b].sort().join())} && document.querySelectorAll('[data-pages-rows] .pages-doc-row.is-picked').length === 2`);
  assert.equal(await evaluate(`document.querySelector('[data-plugin-group=pages] .tab-item[data-tab-kind=item][data-item-id="${b}"]')`), null, "a ⌘-click in the list opens no tab");

  // D24 a middle click on C still opens it behind in the Pages group; the picks and the open page stay. The page was
  // opened with openItem, so the current tab is A's item tab (or the Pages tab): whichever it is, it stays current.
  const current = `(() => { const tab = document.querySelector('[data-titlebar-tabs] .tab-item[aria-current]'); return tab ? tab.dataset.tabKind + ":" + (tab.dataset.itemId ?? tab.dataset.plugin) : null; })()`;
  const before = await evaluate<string | null>(current);
  assert.ok(before === `item:${a}` || before === "plugin:pages", `the pane is on Pages before the middle click (${before})`);
  await press(c, "middle", 0);
  await waitFor(`document.querySelector('[data-plugin-group=pages] .tab-item[data-tab-kind=item][data-item-id="${c}"]')`);
  assert.equal(await evaluate(current), before, "the pane stays where it was");
  assert.equal(await child.evaluate("document.querySelector('[data-pages-title]')?.value"), "Page A", "A stays open in the editor");
  assert.equal(await child.evaluate(selected), [a, b].sort().join(), "the middle click leaves the picks alone");
});
