import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("project workbench previews on click, commits on double-click, and keeps split panes", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const commitClick = async (selector: string) => {
    await click(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 2 }))`);
  };
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  for (const plugin_id of ["sessions", "feed", "inbox", "artifacts"] as const) {
    catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "tab-workspace" });
  }
  catalog.close();
  const registry = await openWorkSessionRegistry({ homeDirectory });
  const session = registry.createSession({
    runtime_id: "codex",
    project_id: projectId!,
    current_goal_id: "CORE",
    title: "分栏核对 Session",
    user_confirmed: true,
    actor_id: "tab-workspace",
  });
  registry.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=back]')?.disabled"), true);
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=forward]')?.disabled"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current]') && document.querySelector('[data-workspace-history=back]')?.disabled === false");
  await click("[data-workspace-history=back]");
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=forward]')?.disabled"), false);
  await click("[data-workspace-history=forward]");
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current]')");
  await click(".tab-item[data-tab-kind=home] .tab-item-trigger");
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await evaluate("document.querySelector('.tab-item[data-tab-kind=mother] [data-tab-close]')?.click()");
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother]') == null");
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=home]')?.hidden"), false);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current][data-preview]') && document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  assert.equal(await evaluate("document.querySelector('.tab-item[data-tab-kind=mother][data-preview] .tab-item-name')?.textContent"), "画布");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tab-item[data-preview] .tab-item-name')).fontStyle"), "italic");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-board-view-tab=kanban]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-container-tabs]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('.immersive-titlebar [data-titlebar-tabs] .tab-item[data-tab-kind=mother][aria-current]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-tab-pane] [data-tab-strip]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('.tab-item[data-tab-kind=home]') != null"), true);
  await click('.tree-node[data-select-goal="CORE"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && document.querySelector('.tab-item[aria-current][data-plugin=goals][data-tab-kind=item][data-item-id=CORE]')");
  assert.equal(await evaluate("document.querySelector('.tab-item[aria-current]').dataset.preview"), "true");
  await evaluate(`document.querySelector('.tree-node[data-select-goal="CORE"]').dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 2 }))`);
  await waitFor("document.querySelector('.tab-item[aria-current][data-plugin=goals][data-item-id=CORE]') && !document.querySelector('.tab-item[aria-current]').dataset.preview");
  const coreTabId = await evaluate<string>("document.querySelector('.tab-item[aria-current]').dataset.tabId");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=mother] [role=tab]')?.click()");
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current]') && !document.querySelector('[data-goal-canvas-shell]')?.hidden && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('.tree-node[data-select-goal=\"INTERFACES\"]')?.getClientRects().length > 0");
  await click('.tree-node[data-select-goal="INTERFACES"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'INTERFACES'");
  const interfacesTabId = await evaluate<string>("document.querySelector('.tab-item[aria-current]').dataset.tabId");
  assert.notEqual(interfacesTabId, coreTabId);
  assert.equal(await evaluate("document.querySelector('.tab-item[aria-current]').dataset.preview"), "true");
  await click('[data-tab-id="' + coreTabId + '"] .tab-item-trigger');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && document.querySelector('.tab-item[aria-current]')?.dataset.tabId === " + JSON.stringify(coreTabId));
  await click('[data-tab-id="' + interfacesTabId + '"] [data-tab-close]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=item][aria-current]') && document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  await click('.tab-item[aria-current] .tab-item-trigger');
  await evaluate("document.querySelector('.tab-item[aria-current] .tab-item-trigger')?.focus()");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", windowsVirtualKeyCode: 37 }, sessionId);
  await waitFor("document.activeElement?.closest('[data-tab-kind=mother], [data-tab-kind=home]') != null");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", windowsVirtualKeyCode: 39 }, sessionId);
  await waitFor("document.activeElement?.closest('[data-tab-kind=item][data-item-id=CORE]') != null");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Delete", windowsVirtualKeyCode: 46 }, sessionId);
  await waitFor("!document.querySelector('.tab-item[data-tab-kind=item][data-item-id=CORE]')");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current][data-plugin=sessions]')");
  await waitFor("Boolean(document.querySelector('[data-operation-select=\"" + session.session_id + "\"]'))");
  await commitClick('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=item][aria-current][data-plugin=sessions]') && !document.querySelector('.tab-item[aria-current]').dataset.preview");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group]')"), null);
  await click('[data-titlebar-tabs] .tab-item[data-plugin=sessions][data-tab-kind=item] .tab-item-trigger');
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "F10", code: "F10", windowsVirtualKeyCode: 121, modifiers: 8 }, sessionId);
  await waitFor("document.querySelector('[data-workspace-tab-menu]').matches(':popover-open')");
  await click("[data-tab-menu-action=new-group]");
  await waitFor("document.querySelector('.tab-group[data-tab-group]')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.tab-group[data-tab-group]'), '::after').height"), "2px");
  await click(".tab-group-label");
  await waitFor("document.querySelector('.tab-group[data-collapsed=true]')");
  assert.equal(await evaluate("[...document.querySelectorAll('.tab-group[data-collapsed=true] .tab-item')].every(tab => tab.getClientRects().length === 0)"), true);
  await click(".tab-group-label");
  await waitFor("document.querySelector('.tab-group[data-collapsed=true]') === null");
  await evaluate("document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-tab-pane] [data-tab-strip]')].every(strip => !strip.hidden && strip.querySelector('[data-tab-id]'))"), true);
  assert.equal(await evaluate(`(() => {
    const panes = [...document.querySelectorAll('[data-tab-pane]')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const left = panes[0].querySelector('[data-tab-strip]').getBoundingClientRect();
    const right = panes[1].getBoundingClientRect();
    return left.right <= right.left + 1;
  })()`), true);
  await evaluate("document.querySelector('[data-tab-pane-close]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs]')?.hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item') != null"), true);
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("innerWidth === 390");
  await click("[data-directory-show]");
  await waitFor("document.querySelector('[data-workspace]')?.classList.contains('is-directory-drawer-open')");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && Boolean(document.querySelector('.tree-node[data-select-goal=CORE]'))");
  await evaluate(`(() => {
    const node = document.querySelector('.tree-node[data-select-goal="CORE"]');
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 1 }));
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 2 }));
  })()`);
  await waitFor("document.querySelector('.tab-item[data-plugin=goals][data-item-id=CORE][aria-current]') && !document.querySelector('.tab-item[aria-current]').dataset.preview");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`(() => { for (let i = 0; i < 16; i += 1) document.querySelector("[data-tab-close]")?.click(); })()`);
  await waitFor("document.querySelectorAll('.tab-item').length === 1 && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home");
});
