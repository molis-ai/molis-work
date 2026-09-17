import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Goal kanban sits beside the canvas, opens Frame, and remembers the board view", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, store, before } = browser;
  const tap = (selector: string) => evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.querySelector('.tab-item[data-tab-kind=mother][aria-current]') && document.querySelector('[data-container-tabs]')?.hidden && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal]')");
  const goalId = await evaluate<string>("document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal]').dataset.selectGoal");
  assert.equal(await evaluate("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView"), "list");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=goals] .tree-node')"), null);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-goal-stage-list]')).display"), "block");
  const listRows = await evaluate<{ height: number; line: string; stateLeft: number; titleRight: number; relationsLine: string | null; depths: number[] }>(`(() => {
    const rows = [...document.querySelectorAll('[data-goal-stage-list] [data-tree-root]:not([data-collection-tree]) .tree-entry')];
    return {
      height: Math.max(...rows.map(row => Math.round(row.getBoundingClientRect().height))),
      line: getComputedStyle(rows[0].querySelector('.tree-title-line strong')).whiteSpace,
      stateLeft: Math.min(...rows.map(row => Math.round(row.querySelector('.directory-row-state').getBoundingClientRect().left))),
      titleRight: Math.max(...rows.map(row => row.querySelector('.tree-title-line strong').getBoundingClientRect().right)),
      relationsLine: document.querySelector('.tree-relations-copy') ? getComputedStyle(document.querySelector('.tree-relations-copy')).whiteSpace : null,
      depths: [...new Set(rows.map(row => Number(row.closest('[data-tree-depth]').dataset.treeDepth)))]
    };
  })()`);
  assert.equal(listRows.height, 28, "Stage list rows stay a single 28px line");
  assert.equal(listRows.line, "nowrap");
  assert.ok(listRows.titleRight <= listRows.stateLeft, "Titles do not overlap the status column");
  assert.ok(listRows.depths.length > 1, "Alignment is checked across nested Goals");
  const aligned = await evaluate<boolean>(`(() => {
    const lefts = [...document.querySelectorAll('[data-goal-stage-list] [data-tree-root]:not([data-collection-tree]) .directory-row-state')].map(el => Math.round(el.getBoundingClientRect().left));
    return new Set(lefts).size === 1;
  })()`);
  assert.equal(aligned, true, "Status columns share one left edge across depths");
  if (listRows.relationsLine) assert.equal(listRows.relationsLine, "nowrap");
  assert.equal(await evaluate("document.querySelectorAll('[data-kanban-column]').length"), 6);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-kanban]')?.textContent || ''"), /从想要的结果开始|创建第一条 Goal|Click a card/);
  await evaluate("document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal=\"" + goalId + "\"]').click()");
  await waitFor("document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(goalId) + " && !document.querySelector('[data-goal-node-workspace]').hidden && getComputedStyle(document.querySelector('[data-goal-stage-list]')).display === 'block'");
  assert.equal(await evaluate("document.querySelector('.tab-item[data-tab-kind=mother][aria-current]') != null"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-frame-surface]')?.hidden !== false"), true);
  const split = await evaluate<{ list: number; workspace: number; shell: number }>("(() => { const shell = document.querySelector('[data-goal-canvas-shell]').getBoundingClientRect(); const list = document.querySelector('[data-goal-stage-list]').getBoundingClientRect(); const workspace = document.querySelector('[data-goal-node-workspace]').getBoundingClientRect(); return { list: Math.round(list.width), workspace: Math.round(workspace.width), shell: Math.round(shell.width) }; })()");
  assert.ok(split.list >= 250 && split.list <= 300, "Expanded list becomes a narrow rail, got " + split.list);
  assert.ok(split.workspace > split.list, "Workspace sits beside the list");
  assert.ok(Math.abs(split.list + split.workspace - split.shell) <= 2);
  await browser.openGoalFrame('[data-goal-stage-list] .tree-node[data-select-goal="' + goalId + '"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=item][aria-current][data-item-id=\"" + goalId + "\"]') && document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === " + JSON.stringify(goalId));
  await waitFor("Boolean(document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=mother] [role=tab]'))");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=mother] [role=tab]').click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-board-view-tab=list][aria-current=\"page\"]')");
  await tap("[data-board-view-tab=kanban]");
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-goal-kanban]')).display !== 'none'"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-goal-momentum]')).display === 'none'"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-goal-stage-list]')).display === 'none'"), true);
  const desktopFit = await evaluate<{ sw: number; cw: number }>("(() => { const el = document.querySelector('[data-goal-kanban]'); return { sw: el?.scrollWidth || 0, cw: el?.clientWidth || 0 }; })()");
  assert.ok(desktopFit.sw <= desktopFit.cw + 1, "desktop kanban fits six columns without horizontal scroll");
  assert.equal(await evaluate("document.querySelector('[data-kanban-card][data-goal-id=\"" + goalId + "\"]') != null"), true);
  await click('[data-kanban-card][data-goal-id="' + goalId + '"]');
  await waitFor("document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(goalId) + " && !document.querySelector('[data-goal-node-workspace]').hidden");
  await click("[data-goal-collapse]");
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await browser.openGoalFrame('[data-kanban-card][data-goal-id="' + goalId + '"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === " + JSON.stringify(goalId) + " && document.querySelector('.tab-item[data-tab-kind=item][aria-current][data-item-id=\"" + goalId + "\"]')");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=mother] [role=tab]').click()");
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await tap("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-board-view-tab=canvas][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"" + goalId + "\"]').click()");
  await waitFor("document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(goalId) + " && !document.querySelector('[data-goal-node-workspace]').hidden");
  await click("[data-goal-collapse]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && document.querySelector('[data-board-view-tab=canvas][aria-current=\"page\"]') && document.querySelector('.tree-node[data-select-goal=\"" + goalId + "\"]')?.classList.contains('is-selected')");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"" + goalId + "\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === " + JSON.stringify(goalId));
  await tap("[data-container-tab=kanban]");
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await tap('[data-container-tab="' + goalId + '"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === " + JSON.stringify(goalId));
  await tap('[data-container-tab-close="' + goalId + '"]');
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.body.dataset.desktopSurface === 'sessions'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await reloadPage();
  await waitFor("document.body.dataset.desktopSurface === 'home' || document.body.dataset.desktopSurface === 'goal'");
  if (await evaluate("document.body.dataset.desktopSurface") !== "goal") {
    await click('[data-plugin-strip] [data-plugin-id="goals"]');
  }
  await waitFor("document.querySelector('[data-board-view-tab=kanban][aria-current=\"page\"]') && document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban'");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await waitFor("getComputedStyle(document.querySelector('[data-goal-kanban] .goal-kanban-board')).flexDirection === 'column'");
  const stacked = await evaluate<{ direction: string; overflowX: string; groups: number; outcome: string }>("(() => { const board = document.querySelector('[data-goal-kanban] .goal-kanban-board'); const shell = document.querySelector('[data-goal-kanban]'); const outcome = document.querySelector('.goal-kanban-card-outcome'); return { direction: getComputedStyle(board).flexDirection, overflowX: getComputedStyle(shell).overflowX, groups: document.querySelectorAll('[data-kanban-group]').length, outcome: outcome ? getComputedStyle(outcome).display : 'none' }; })()");
  assert.equal(stacked.direction, "column");
  assert.equal(stacked.groups, 6);
  assert.equal(stacked.outcome, "none");
  assert.ok(stacked.overflowX === "hidden" || stacked.overflowX === "clip", "narrow kanban stacks groups instead of scrolling sideways " + JSON.stringify(stacked));
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
});

test("narrow stacked kanban only appears on the kanban view", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  const tap = (selector: string) => evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()");
  await command("Emulation.setDeviceMetricsOverride", { width: 800, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal]')");
  await waitFor("document.querySelector('[data-goal-canvas-shell]').getBoundingClientRect().width < 839");
  const listState = await evaluate<{ view: string; list: string; kanban: string; map: string }>("(() => { const shell = document.querySelector('[data-goal-canvas-shell]'); return { view: shell.dataset.boardView, list: getComputedStyle(document.querySelector('[data-goal-stage-list]')).display, kanban: getComputedStyle(document.querySelector('[data-goal-kanban]')).display, map: getComputedStyle(document.querySelector('[data-goal-momentum]')).display }; })()");
  assert.equal(listState.view, "list");
  assert.equal(listState.list, "block");
  assert.equal(listState.kanban, "none", "list view must not show stacked kanban when the stage is narrow");
  await tap("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  const canvasState = await evaluate<{ list: string; kanban: string }>("(() => ({ list: getComputedStyle(document.querySelector('[data-goal-stage-list]')).display, kanban: getComputedStyle(document.querySelector('[data-goal-kanban]')).display }))()");
  assert.equal(canvasState.list, "none");
  assert.equal(canvasState.kanban, "none", "canvas view must not show stacked kanban when the stage is narrow");
  await tap("[data-board-view-tab=kanban]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'kanban' && getComputedStyle(document.querySelector('[data-goal-kanban]')).display !== 'none'");
  const kanbanState = await evaluate<{ direction: string; list: string; kanban: string }>("(() => ({ direction: getComputedStyle(document.querySelector('.goal-kanban-board')).flexDirection, list: getComputedStyle(document.querySelector('[data-goal-stage-list]')).display, kanban: getComputedStyle(document.querySelector('[data-goal-kanban]')).display }))()");
  assert.notEqual(kanbanState.kanban, "none");
  assert.equal(kanbanState.list, "none");
  assert.equal(kanbanState.direction, "column");
  await tap("[data-board-view-tab=list]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && getComputedStyle(document.querySelector('[data-goal-kanban]')).display === 'none'");
});
