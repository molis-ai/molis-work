import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { installProducers } from "./fixtures/installed-producers.js";
import { boardSnapshot } from "./fixtures/goal-application.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

test("Goal Frames use outer tabs, preserve references, and isolate project state", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, store, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  for (const plugin_id of ["feed", "inbox", "artifacts"] as const) {
    catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "frame-container" });
  }
  catalog.close();
  const now = new Date().toISOString();
  const feed = createLocalFeedApplication(store.db);
  const source = feed.upsertSource({
    project_id: DEMO_PROJECT_ID, source_id: "frame-rss", kind: "rss", definition_id: "rss", sync_kind: "manual",
    name: "产品观察", description: "Frame 验证", status: "active", enabled: true, item_count: 0, origin: "molis_work",
    config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null,
    last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now,
  });
  const feedItem = feed.ingestItem({
    source, externalId: "frame-feed", title: "核对 Frame 的 Feed 条目",
    summary: "点进 Frame 后应变成引用卡片。", body: "只验证引用，不打开整页。", occurredAt: now, attention: false,
  });
  const inbox = feed.ensureInboxEntryForFeedItem(DEMO_PROJECT_ID, feedItem.item.item_id, "manual");
  installProducers(store.db, { plugin_id: "example.writer", artifact_types: ["example.note"] });
  openProjectVersionStores(store).artifacts.commands.registerVersion({ ...pinnedArtifact("Frame artifact"),
    project_id: DEMO_PROJECT_ID, actor_id: "frame-container", artifact_id: "frame-note", version: 1,
    artifact_type_id: "example.note", schema_version: 1,
    producer: { plugin_id: "example.writer", plugin_version: "1.0.0", binding_signature: "fixture" },
    content: { kind: "inline", payload: { text: "Frame artifact" } }, metadata: {},
  });
  const before = boardSnapshot(store, DEMO_PROJECT_ID);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await waitFor("Boolean(document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home], [data-tab-workspace] .tab-item[data-tab-kind=home]'))");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.body.dataset.desktopSurface === 'goal' && !document.querySelector('.tab-item[data-tab-kind=mother]')");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && Boolean(document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]'))");
  assert.equal(await evaluate("document.querySelector('[data-directory-open=frame],[data-plugin-id=frame]')"), null);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-momentum]')?.textContent || ''"), /箭头从前置成果指向后续工作|单击看血缘/);
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-goal-canvas-shell]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-frame-surface]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]').hidden"), true);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-goal-frame-surface]')?.textContent || ''"), /把会话、Feed|这些内容只为完成|从目录把会话/);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && !document.querySelector('[data-goal-canvas-shell]').hidden");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelectorAll('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').length"), 1);
  await waitFor("Boolean(document.querySelector('[data-feed-item-id=\"" + feedItem.item.item_id + "\"]'))");
  await evaluate("document.querySelector('[data-feed-item-id=\"" + feedItem.item.item_id + "\"]').click()");
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 1");
  assert.match(await evaluate<string>("[...document.querySelectorAll('[data-frame-block]')].map(block => block.textContent).join(' ')"), /核对 Frame 的 Feed 条目/);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=feed]').hidden"), true);
  await evaluate(`(() => {
    const canvas = document.querySelector("[data-frame-canvas]");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { getData: (type) => type === "application/x-molis-work-asset" ? JSON.stringify({ kind: "artifact", id: "frame-note#1", title: "Frame artifact" }) : "" },
    });
    canvas.dispatchEvent(event);
  })()`);
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 2");
  assert.match(await evaluate<string>("[...document.querySelectorAll('[data-frame-block]')].map(block => block.textContent).join(' ')"), /Frame artifact/);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=artifacts]').hidden"), true);
  await waitFor("Boolean(document.querySelector('[data-inbox-directory] [data-frame-asset=inbox][data-frame-asset-id=\"" + inbox.entry.entry_id + "\"]'))");
  await evaluate("document.querySelector('[data-inbox-directory] [data-frame-asset=inbox][data-frame-asset-id=\"" + inbox.entry.entry_id + "\"]').click()");
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 3");
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && !document.querySelector('[data-work-surface=feed]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-goal-frame-surface]').hidden"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('.tab-item[aria-current]')?.dataset.tabKind === 'plugin'");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').click()");
  await waitFor("document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][data-item-id=CORE][aria-current]') && !document.querySelector('[data-goal-frame-surface]').hidden");
  assert.equal(await evaluate("document.querySelectorAll('[data-frame-block]').length"), 3);
  await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=feed] > p').click()");
  await waitFor("document.querySelector('[data-frame-block].is-expanded .frame-reading .feed-rich-content')");
  assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded').textContent || ''"), /只验证引用/);
  assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded .feed-detail-actions, [data-frame-block].is-expanded [data-open-source-record], [data-frame-block].is-expanded [data-feed-action]')"), null);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "goal");
  assert.equal(await evaluate("document.querySelectorAll('[data-frame-block].is-expanded').length"), 1);
  await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=artifact]').click()");
  await waitFor("document.querySelector('[data-frame-block].is-expanded .frame-reading .artifact-facts')");
  assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded').textContent || ''"), /example\.note/);
  assert.equal(await evaluate("document.querySelector('[data-frame-block].is-expanded .artifact-actions, [data-frame-block].is-expanded .artifact-raw')"), null);
  await evaluate("document.querySelector('[data-frame-block][data-frame-block-kind=inbox]').click()");
  await waitFor("document.querySelector('[data-frame-block].is-expanded [data-frame-reading=inbox]')");
  assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded').textContent || ''"), /你手工加入/);
  assert.match(await evaluate<string>("document.querySelector('[data-frame-block].is-expanded').textContent || ''"), /查看原消息并处理/);
  await evaluate(`(() => {
    const canvas = document.querySelector("[data-frame-canvas]");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { getData: (type) => type === "application/x-molis-work-asset" ? JSON.stringify({ kind: "goal", id: "CORE", title: "CORE" }) : "" },
    });
    canvas.dispatchEvent(event);
  })()`);
  await waitFor("document.querySelector('[data-toast]').classList.contains('is-visible') && document.querySelector('[data-toast]').textContent.includes('Goal 留在主画布')");
  assert.equal(await evaluate("document.querySelectorAll('[data-frame-block]').length"), 3);
  await evaluate("document.querySelector('.tree-node[data-select-goal=CORE]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:1}));document.querySelector('.tree-node[data-select-goal=CORE]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:2}))");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && !document.querySelector('[data-goal-frame-surface]').hidden && document.querySelector('.tab-item[data-plugin=goals][data-item-id=CORE][aria-current]')");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]') != null"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE] [data-tab-close]').click()");
  await waitFor("!document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && !document.querySelector('[data-goal-canvas-shell]')?.hidden");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-frame-block]')");
  const otherId = await evaluate<string>(`(async()=>{const r=await fetch('/api/settings/projects',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({display_name:'Frame 隔离',user_confirmed:true})});if(!r.ok)throw new Error(await r.text());return (await r.json()).project.project_id;})()`);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + otherId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && !document.querySelector('.tab-item[data-tab-kind=mother]')");
  assert.equal(await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')"), null);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-titlebar-tabs] .tab-item, [data-tab-workspace] .tab-item'))");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]')");
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').click()");
  await waitFor("document.querySelectorAll('[data-frame-block]').length === 3");
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).runs, before.runs);
});

// SYS-52: the Frame draws itself again whenever its stored state arrives from another window (the `storage` handler) or a block opens, closes
// or moves. A redraw with the same words must leave their Text alone, or a selection the person is making in the title or outcome collapses
// under them; words that did change still show.
test("SYS-52 a Goal Frame drawn again with the same words keeps the title and outcome Text and the person's selection; other words still show", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, store, projectId } = browser;
  const goals = boardSnapshot(store, DEMO_PROJECT_ID).goals;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true' && document.body.dataset.desktopSurface === 'goal'");
  await evaluate("document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && Boolean(document.querySelector('[data-graph-node][data-goal-id=CORE] [data-graph-frame]'))");
  await evaluate("document.querySelector('[data-graph-node][data-goal-id=\"CORE\"] [data-graph-frame]').click()");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE' && !document.querySelector('[data-goal-frame-surface]').hidden");
  const core = goals.find(goal => goal.goal_id === "CORE")!;
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-title]').textContent"), core.title);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-outcome]').textContent"), core.outcome);
  const key = "molis-work-frame-container:" + projectId + ":goal:CORE";
  // Selects part of one line, then has the Frame's own `storage` handler draw it again with the state it already has. The marker in the
  // world proves the draw ran (it empties the world); the Text the person selected in is the one still in the page, and so is the selection.
  const redrawKeeps = async (field: "title" | "outcome") => {
    const kept = await evaluate<{ drawn: boolean; connected: boolean; same: boolean; anchored: boolean; selected: string; expected: string }>(`(() => {
      const line = document.querySelector('[data-frame-goal-${field}]'), text = line.firstChild;
      const range = document.createRange(); range.setStart(text, 1); range.setEnd(text, Math.min(9, text.length));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const expected = selection.toString();
      const marker = document.createElement('i'); document.querySelector('[data-frame-world]').append(marker);
      const value = localStorage.getItem(${JSON.stringify(key)}) || JSON.stringify({ camera: { x: 0, y: 0, z: 1 }, blocks: [], expanded: "" });
      window.dispatchEvent(new StorageEvent('storage', { key: ${JSON.stringify(key)}, newValue: value }));
      return { drawn: !marker.isConnected, connected: text.isConnected, same: line.firstChild === text, anchored: getSelection().anchorNode === text,
        selected: getSelection().toString(), expected };
    })()`);
    assert.equal(kept.drawn, true, `the Frame drew itself again (${field})`);
    assert.ok(kept.expected.length > 0, `something of the ${field} was selected`);
    assert.equal(kept.connected && kept.same, true, `the ${field} keeps its Text when its words are the same`);
    assert.equal(kept.anchored, true, `the selection stays in the ${field}`);
    assert.equal(kept.selected, kept.expected, `the selected words of the ${field} stay selected`);
  };
  await redrawKeeps("title");
  await redrawKeeps("outcome");
  // Other words do show: the same Frame drawn for another Goal says that Goal's title and outcome.
  const otherId = await evaluate<string>("[...document.querySelectorAll('.tree-node[data-select-goal]')].map(node => node.dataset.selectGoal).find(id => id !== 'CORE')");
  const other = goals.find(goal => goal.goal_id === otherId)!;
  assert.ok(other && other.title !== core.title, "another Goal with other words");
  await evaluate("window.__sys52Title = document.querySelector('[data-frame-goal-title]').firstChild");
  await evaluate(`(() => { const node = document.querySelector('.tree-node[data-select-goal=${JSON.stringify(otherId)}]');
    node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:1}));
    node.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:2})); })()`);
  await waitFor(`document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === ${JSON.stringify(otherId)} && !document.querySelector('[data-goal-frame-surface]').hidden`);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-title]').textContent"), other.title);
  assert.equal(await evaluate("document.querySelector('[data-frame-goal-outcome]').textContent"), other.outcome || "还没有写明预期结果，可在工作区补充。");
  assert.equal(await evaluate("window.__sys52Title.isConnected"), false, "changed words replace the Text");
});
