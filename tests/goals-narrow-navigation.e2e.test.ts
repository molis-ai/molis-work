import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const SNAPSHOT = `(() => {
  const workspace = document.querySelector("[data-workspace]");
  const measure = (el) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      display: style.display,
      hidden: el.hidden,
      inert: el.hasAttribute("inert"),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
  };
  const hit = (x, y) => {
    const node = document.elementFromPoint(x, y);
    if (!node) return "";
    if (node.closest(".tree-pane")) return "tree";
    if (node.closest(".document-pane")) return "document";
    if (node.closest(".tui-pane")) return "tui";
    if (node.closest(".goal-momentum")) return "graph";
    if (node.closest("[data-container-tabs], [data-titlebar-tabs]")) return "tabs";
    return node.tagName.toLowerCase();
  };
  const workspaceRect = workspace?.getBoundingClientRect();
  const center = workspaceRect
    ? { x: workspaceRect.x + workspaceRect.width / 2, y: workspaceRect.y + Math.max(40, workspaceRect.height / 2) }
    : { x: innerWidth / 2, y: innerHeight / 2 };
  return {
    width: innerWidth,
    height: innerHeight,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    mobileView: workspace?.dataset.mobileView || "",
    workspaceMode: workspace?.dataset.workspaceMode || "",
    directory: document.querySelector(".tree-pane")?.dataset.desktopDirectory || "",
    drawer: Boolean(workspace?.classList.contains("is-directory-drawer-open")),
    containerTab: document.querySelector(".tab-item.is-active")?.dataset.tabKind || document.querySelector("[data-container-tab][aria-current]")?.dataset.containerTab || "",
    hasMobileSwitch: Boolean(document.querySelector(".mobile-switch")),
    tree: measure(document.querySelector(".tree-pane")),
    list: measure(document.querySelector(".goal-list-view")),
    document: measure(document.querySelector(".document-pane")),
    tui: measure(document.querySelector(".tui-pane")),
    graph: measure(document.querySelector(".goal-momentum")),
    hit: hit(center.x, center.y),
    searchVisible: (() => {
      const search = document.querySelector("[data-global-search-open]");
      if (!search) return false;
      const rect = search.getBoundingClientRect();
      return getComputedStyle(search).display !== "none" && rect.width > 0 && rect.height > 0;
    })(),
  };
})()`;

type PaneSnapshot = {
  width: number;
  height: number;
  overflowX: boolean;
  mobileView: string;
  workspaceMode: string;
  directory: string;
  drawer: boolean;
  containerTab: string;
  hasMobileSwitch: boolean;
  tree: { display: string; hidden: boolean; inert: boolean; x: number; y: number; w: number; h: number } | null;
  list: { display: string; hidden: boolean; inert: boolean; x: number; y: number; w: number; h: number } | null;
  document: { display: string; hidden: boolean; inert: boolean; x: number; y: number; w: number; h: number } | null;
  tui: { display: string; hidden: boolean; inert: boolean; x: number; y: number; w: number; h: number } | null;
  graph: { display: string; hidden: boolean; inert: boolean; x: number; y: number; w: number; h: number } | null;
  hit: string;
  searchVisible: boolean;
};

function isShown(pane: PaneSnapshot["tree"]): boolean {
  return Boolean(pane && pane.display !== "none" && pane.h >= 180 && pane.w >= 180);
}

function isHiddenFromUse(pane: PaneSnapshot["tree"]): boolean {
  return !pane || pane.display === "none" || pane.h < 8 || pane.w < 8;
}

test("narrow Goal drawer shows the list, restores the stored view, and keeps work tabs", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate, reloadPage, showGoalStageList } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/INTERFACES" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'INTERFACES'");
  const snap = () => evaluate<PaneSnapshot>(SNAPSHOT);
  const waitDrawer = () => waitFor(`document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open") && getComputedStyle(document.querySelector(".plugin-rail")).display !== "none"`);
  const waitClosed = () => waitFor(`!document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open")`);

  let state = await snap();
  assert.equal(state.hasMobileSwitch, false);
  assert.equal(state.containerTab, "item");
  assert.equal(state.drawer, false);
  assert.ok(await evaluate("document.querySelector('[data-goal-node-workspace]')?.hidden === false || document.querySelector('[data-goal-frame-surface]')?.hidden === false"));
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document]')?.dataset.goalView"), "INTERFACES");

  await click("[data-directory-show]");
  await waitDrawer();
  state = await snap();
  assert.equal(state.directory, "root");
  assert.equal(isHiddenFromUse(state.tree), true);
  assert.equal(state.searchVisible, true);

  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor(`document.querySelector(".tree-pane").dataset.desktopDirectory === "inbox"`);
  state = await snap();
  assert.equal(state.directory, "inbox");
  assert.equal(state.drawer, true);
  assert.equal(isShown(state.tree), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(`document.querySelector(".tree-pane").dataset.desktopDirectory === "root" && !document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open")`);

  await showGoalStageList();
  await evaluate("document.querySelector('.tree-node[data-select-goal=\"INTERFACES\"]')?.click()");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'INTERFACES' || document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'INTERFACES'");
  state = await snap();
  assert.equal(state.drawer, false);
  assert.notEqual(state.hit, "tree");

  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/CORE/document*"] }, sessionId);
  await showGoalStageList();
  await evaluate("document.querySelector('.tree-node[data-select-goal=\"CORE\"]')?.click()");
  await waitFor("document.querySelector('[data-toast]')?.textContent.includes('Failed to fetch') || document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' || document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'CORE'");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await evaluate("document.querySelector('.tree-node[data-select-goal=\"CORE\"]')?.click()");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' || document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'CORE'");

  const app = new GoalProjectApplication(store);
  const beforeCursor = await evaluate<number>("Number(document.querySelector('[data-goal-event-document]')?.dataset.goalEventCursor || 0)");
  const note = app.goalEvents.recordNote({
    board_id: DEMO_BOARD_ID,
    goal_id: "CORE",
    actor_id: "web-user",
    actor_kind: "user",
    body: "narrow-nav refresh note",
    idempotency_key: "narrow-nav-refresh-note",
  });
  assert.equal(note.recorded, true);
  await evaluate("document.dispatchEvent(new Event('visibilitychange')); true");
  await waitFor(`Number(document.querySelector('[data-goal-event-document]')?.dataset.goalEventCursor || 0) > ${beforeCursor}`);
  assert.match(await evaluate<string>("document.querySelector('[data-goal-event-document]')?.textContent || ''"), /narrow-nav refresh note/);

  await click("[data-directory-show]");
  await waitDrawer();
  await reloadPage();
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'CORE' || document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  state = await snap();
  assert.equal(state.hasMobileSwitch, false);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-goal-work-mode=\"terminal\"]'))"), true);

  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
  assert.deepEqual(after.runs, before.runs);
  assert.ok(app.goalEvents.readState(DEMO_BOARD_ID, "CORE").goal_event_cursor > beforeCursor);
});

test("narrow list, graph return and desktop side-by-side keep usable geometry", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/INTERFACES" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'INTERFACES'");
  const snap = () => evaluate<PaneSnapshot>(SNAPSHOT);
  const waitDrawer = () => waitFor(`document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open") && getComputedStyle(document.querySelector(".tree-pane")).display !== "none" && document.querySelector(".tree-pane").getBoundingClientRect().height > 180`);
  const waitGraph = () => waitFor(`document.querySelector("[data-workspace]").dataset.workspaceMode === "graph" && document.querySelector("#goal-momentum-pane") && !document.querySelector("#goal-momentum-pane").hidden && getComputedStyle(document.querySelector("#goal-momentum-pane")).display !== "none" && document.querySelector("#goal-momentum-pane").getBoundingClientRect().height > 180`);

  await click("[data-directory-show]");
  await waitFor(`document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open") && document.querySelector(".plugin-rail").getBoundingClientRect().width > 40`);
  let state = await snap();
  assert.equal(state.width, 390);
  assert.equal(state.overflowX, false);
  assert.equal(isHiddenFromUse(state.tree), true);
  assert.equal(state.hasMobileSwitch, false);
  assert.equal(state.containerTab, "item");
  await evaluate("document.querySelector('[data-directory-dismiss]')?.click(); true");
  await waitFor(`!document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open")`);

  await evaluate(`(() => {
    const collapse = document.querySelector("[data-goal-collapse]");
    const box = collapse?.getBoundingClientRect();
    if (collapse && box && box.width && box.height) collapse.click();
    else document.querySelector(".tab-item[data-tab-kind=mother] [role=tab]")?.click();
    document.querySelector("[data-board-view-tab=canvas]")?.click();
  })()`);
  await waitGraph();
  state = await snap();
  assert.equal(state.overflowX, false);
  assert.equal(isShown(state.graph), true);
  assert.equal(isHiddenFromUse(state.tree), true);
  assert.equal(state.hit, "graph");
  assert.equal(state.containerTab, "mother");

  await click("[data-directory-show]");
  await waitFor(`document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open") && document.querySelector(".plugin-rail").getBoundingClientRect().width > 40`);
  state = await snap();
  assert.equal(isHiddenFromUse(state.tree), true);
  await evaluate("document.querySelector('[data-directory-dismiss]')?.click(); true");
  await waitFor(`!document.querySelector("[data-workspace]").classList.contains("is-directory-drawer-open")`);
  await waitGraph();

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`document.querySelector("[data-workspace]").classList.contains("is-plugin-directory-empty") && document.querySelector("[data-plugin-stage]").getBoundingClientRect().width > 180`);
  state = await snap();
  assert.ok(state.graph);
  assert.ok(state.graph.w > 180 && state.graph.h > 180);
  assert.equal(isHiddenFromUse(state.tree), true);

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await waitGraph();
  state = await snap();
  assert.equal(state.width, 390);
  assert.equal(state.workspaceMode, "graph");
  assert.equal(isShown(state.graph), true);
  assert.equal(isHiddenFromUse(state.tree), true);
  assert.equal(state.hit, "graph");
  assert.equal(state.hasMobileSwitch, false);

  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
  assert.deepEqual(after.runs, before.runs);
});
