import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("project workbench opens home, plugin mother tabs, item tabs, and restores home after the last close", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
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
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=home]')?.hidden"), false);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=mother][aria-current]') && document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group=goals] .tab-group-label')?.textContent"), "Goals");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group=goals] .tab-group-pages .tab-item[data-tab-kind=mother] span')?.textContent"), "画布");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group=goals] .tab-group-pages') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-board-view-tab=kanban]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-tab-board]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-container-tabs]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('.immersive-titlebar [data-titlebar-tabs] .tab-item[data-tab-kind=mother][aria-current]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-tab-pane] [data-tab-strip]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('.tab-item[data-tab-kind=home]') != null"), true);
  await click('.tree-node[data-select-goal="CORE"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=item][aria-current]') && document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === 'CORE'");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('.tab-group[data-tab-group=sessions] .tab-item[data-tab-kind=mother][aria-current]')");
  await waitFor("Boolean(document.querySelector('[data-operation-select=\"" + session.session_id + "\"]'))");
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('.tab-group[data-tab-group=sessions] .tab-item[data-tab-kind=item][aria-current]')");
  assert.equal(await evaluate("document.querySelector('.tab-group[data-tab-group=goals]') != null"), true);
  await evaluate("document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  await evaluate("document.querySelector('[data-tab-pane-close]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1");
  await evaluate(`(() => { for (let i = 0; i < 16; i += 1) document.querySelector("[data-tab-close]")?.click(); })()`);
  await waitFor("document.querySelectorAll('.tab-item').length === 1 && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home");
});
