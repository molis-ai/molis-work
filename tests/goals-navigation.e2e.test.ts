import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Goal navigation preserves history, keyboard focus, failed selection recovery and repeated selections without executing work", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate, reloadPage, openGoalWork } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1?desktop=1" }, sessionId));
  await openGoalWork(); // A Goal opens on its Frame tab; this test works in its workspace view.
  const selected = (id: string) => `document.querySelector('[data-goal-view="${id}"]') && document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === "${id}"`;
  async function key(key: string, code: number) {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code }, sessionId);
  }
  await waitFor(selected("V1"));
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor(selected("RELEASE"));
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.tree-entry.is-selected .tree-node')].map(node => node.dataset.selectGoal)"), ["RELEASE"]);
  await evaluate("history.back()");
  await waitFor(selected("V1"));
  assert.equal(await evaluate("location.pathname"), "/goals/V1");
  await evaluate("history.forward()");
  await waitFor(selected("RELEASE"));
  assert.equal(await evaluate("location.pathname"), "/goals/RELEASE");
  await evaluate("document.querySelector('.tree-node[data-select-goal=CORE]').focus()");
  await key("Enter", 13);
  await waitFor(selected("CORE"));
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor(selected("RELEASE"));

  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'RELEASE'");
  const timelineItem = "document.querySelector('[data-timeline-item]')";
  if (await evaluate(timelineItem + " != null")) {
    await click("[data-timeline-item]");
    assert.equal(await evaluate("document.querySelector('[data-timeline-item][aria-current=\"true\"]') != null"), true);
  }

  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/CORE/document*"] }, sessionId);
  await click('.tree-node[data-select-goal="CORE"]');
  await waitFor(selected("RELEASE") + " && !document.querySelector('#goal-document-pane').hasAttribute('aria-busy') && document.querySelector('[data-toast]').textContent.includes('Failed to fetch')");
  assert.equal(await evaluate("location.pathname"), "/goals/RELEASE");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click('.tree-node[data-select-goal="CORE"]');
  await waitFor(selected("CORE"));
  // Current Goals switch in place. GRAPH is archived in the demo: it sits in the 归档 fold and opens in the archive view.
  const opened = ["PLATFORM", "WORKSPACE", "ADOPTION", "CORE", "INTERFACES", "WEB", "DESKTOP"];
  for (const id of opened) {
    await click('.tree-node[data-select-goal="' + id + '"]');
    await waitFor(selected(id));
  }
  await reloadPage();
  await waitFor(selected("DESKTOP"));
  assert.equal(await evaluate("document.querySelector('[data-workspace-goal-title]').textContent"), before.goals.find(goal => goal.goal_id === "DESKTOP").title);
  await navigate(() => click('[data-goal-collection-fold=archive] .tree-node[data-select-goal="GRAPH"]'));
  assert.equal(await evaluate("location.pathname"), "/goals/GRAPH");
  assert.equal(await evaluate("document.body.dataset.boardView"), "archive");
  assert.equal(await evaluate("document.querySelector('[data-goal-view]')?.dataset.goalView"), "GRAPH");
  const after = store.snapshot(DEMO_PROJECT_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
  assert.equal(after.board.active_goal_id, before.board.active_goal_id);
});

test("browsing does not set a current Goal; archive actions recover, persist on reload and retain the Goal's history", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate, reloadPage } = browser;
  const openWork = async () => {
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
    await waitFor("document.querySelector('.goal-more > summary')?.getBoundingClientRect().width > 0");
  };
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/WEB" }, sessionId));
  await waitFor("document.querySelector('[data-goal-view=WEB]')");
  await openWork();
  await click('.goal-more > summary');
  assert.equal(await evaluate("Boolean(document.querySelector('[data-set-active-goal]'))"), false);
  assert.equal(store.snapshot(DEMO_PROJECT_ID).board.active_goal_id, before.board.active_goal_id);
  await reloadPage();
  await waitFor("document.querySelector('[data-goal-view=WEB]')");
  assert.equal(store.snapshot(DEMO_PROJECT_ID).board.active_goal_id, before.board.active_goal_id);

  await navigate(() => command("Page.navigate", { url: origin + "/goals/CORE" }, sessionId));
  await openWork();
  await waitFor("document.querySelector('[data-goal-view=" + JSON.stringify("CORE") + "]')");
  await click('.goal-more > summary');
  await waitFor("document.querySelector('[data-goal-archive=" + JSON.stringify("true") + "]')");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/CORE/archive"] }, sessionId);
  await click('[data-goal-archive="true"]');
  await waitFor("!document.querySelector('[data-goal-archive]').disabled && document.querySelector('[data-toast]').textContent.length > 0");
  assert.equal(store.snapshot(DEMO_PROJECT_ID).goals.find(g => g.goal_id === "CORE")!.archived_at, null);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click('[data-goal-archive="true"]'));
  await waitFor("document.querySelector('[data-goal-archive=" + JSON.stringify("false") + "]')");
  assert.equal(await evaluate("location.pathname"), "/archive/goals/CORE");
  assert.ok(store.snapshot(DEMO_PROJECT_ID).goals.find(g => g.goal_id === "CORE")!.archived_at);
  await reloadPage();
  await waitFor("document.querySelector('[data-goal-archive=" + JSON.stringify("false") + "]')");
  await openWork();
  await click('.goal-more > summary');
  await navigate(() => click('[data-goal-archive="false"]'));
  await waitFor("document.querySelector('[data-goal-view=" + JSON.stringify("CORE") + "]')");
  assert.equal(await evaluate("location.pathname"), "/goals/CORE");
  const after = store.snapshot(DEMO_PROJECT_ID);
  assert.equal(after.goals.find(g => g.goal_id === "CORE")!.archived_at, null);
  assert.equal(after.goals.find(g => g.goal_id === "CORE")!.created_at, before.goals.find(g => g.goal_id === "CORE")!.created_at);
  assert.deepEqual(after.goals.filter(g => g.goal_id !== "CORE"), before.goals.filter(g => g.goal_id !== "CORE"));
  assert.deepEqual(after.relations, before.relations);
  assert.equal(after.board.active_goal_id, before.board.active_goal_id);
  const historyId = await evaluate(`document.querySelector('[data-source="journal"]')?.dataset.timelineItem || ""`) as string;
  assert.ok(historyId, "CORE keeps its journal records in the timeline after archive and restore");
  await click(`[data-timeline-item="${historyId}"]`);
  await waitFor("document.querySelector('[data-event-sheet] .event')");
  const body = await evaluate("document.querySelector('[data-event-sheet]')?.textContent || ''") as string;
  assert.match(body, /查看原始记录标识/);
});

test("Sources mutation and Feed reload preserve utility state while fresh Goal links still open Goals", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, click, navigate, reloadPage, openGoalWork } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1?desktop=1#goal-records-V1" }, sessionId));
  await openGoalWork(); // A Goal opens on its Frame tab; this test works in its workspace view.
  await waitFor("document.body.dataset.desktopSurface === 'goal' && Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=\"feed\"]'))");
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && Boolean(document.querySelector('[data-feed-stage-directory]'))");
  await click('[data-feed-add-toggle]');
  await waitFor("!document.querySelector('[data-feed-sources-dialog]')?.hidden");
  await click('[data-feed-choose-kind="rss"]');
  await waitFor("document.querySelector('[data-feed-source-register]')?.dataset.feedSourceRegister === 'rss' && Boolean(document.querySelector('[data-feed-rss-definition]')?.value)");
  const sourceDefinition = await evaluate<string>("document.querySelector('[data-feed-rss-definition]').value");
  // Adding a source completes in place: the panel closes and the new source is selected, without a page load.
  await click('[data-feed-source-register]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-feed-sources-dialog]').hidden");
  assert.equal(await evaluate("location.pathname"), "/goals/V1");
  const response = await fetch(origin + "/api/feed");
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.ok(snapshot.sources.some((source: { definition_id: string }) => source.definition_id === sourceDefinition));
  await reloadPage();
  await waitFor("document.body.dataset.desktopSurface === 'feed'");
  assert.equal(await evaluate("document.querySelector('[data-feed-directory]').dataset.feedPreset"), "feed");
  await navigate(() => command("Page.navigate", { url: origin + "/goals/RELEASE?desktop=1" }, sessionId));
  await openGoalWork(); // A Goal opens on its Frame tab; this test works in its workspace view.
  await waitFor("document.body.dataset.desktopSurface === 'goal' && Boolean(document.querySelector('[data-goal-view=RELEASE]'))");
});
