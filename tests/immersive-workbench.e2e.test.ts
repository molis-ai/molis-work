import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { installProducers } from "./fixtures/installed-producers.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

test("Project navigation preserves the fixed Goal workspace, terminal instance, and camera without writing Goal facts", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, store, before } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uiErrors=[];addEventListener('error',e=>window.__uiErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__uiErrors.push(String(e.reason)));" }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=home]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-goal-canvas-shell]').hidden"), true);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane').dataset.desktopDirectory"), "root");
  const homeRail = await evaluate<Record<string, string>>(`(() => {
    const out = {};
    for (const node of document.querySelectorAll('.plugin-rail-items [data-plugin-id], [data-global-menu] [data-plugin-id]')) {
      const svg = node.querySelector('svg');
      out[node.dataset.pluginId] = svg ? getComputedStyle(svg).color : '';
    }
    return out;
  })()`);
  assert.ok(homeRail.goals && homeRail.feed && homeRail.inbox && homeRail.market, "demo rail has work plugins and market: " + JSON.stringify(homeRail));
  // Colour says selection, not identity: the current entry reads darker, every idle glyph shares one neutral.
  assert.notEqual(homeRail.goals, homeRail.home, "the current entry reads darker than the rest");
  assert.equal(homeRail.goals, homeRail.feed, "idle glyphs stay neutral; position and name say which tool it is");
  assert.equal(homeRail.feed, homeRail.inbox);
  assert.equal(homeRail.goals, homeRail.market);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]').getAttribute('aria-current') === 'page'");
  await click("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  await waitFor("document.querySelector('[data-graph-node][data-goal-id] [data-graph-open]')");
  const camera = await evaluate("document.querySelector('[data-graph-stage]').getAttribute('style')");
  const goalId = await evaluate<string>(`(() => {
    const visible = [...document.querySelectorAll('[data-graph-node][data-goal-id]')].find((node) => {
      const rect = node.getBoundingClientRect();
      return node.querySelector('[data-graph-open]') && rect.width > 8 && rect.height > 8
        && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    });
    const node = visible || document.querySelector('[data-graph-node].is-selected') || document.querySelector('[data-graph-node][data-goal-id]');
    node.querySelector('[data-graph-open]').click();
    return node.dataset.goalId;
  })()`);
  await waitFor("document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(goalId));
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]').dataset.workMode"), "terminal");
  assert.equal(await evaluate("document.querySelector('[data-goal-work-mode=conversation]').disabled"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]').dataset.workMode"), "terminal");
  await evaluate("window.__terminalInstance=document.querySelector('[data-tui-terminal]')");
  assert.equal(await evaluate("document.querySelector('[data-tui-pane]').hidden"), false);
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-work-surface=feed]:not([hidden])')");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(goalId) + " && document.querySelector('[data-goal-node-workspace]')?.hidden === false");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane').dataset.desktopDirectory"), "root");
  assert.equal(await evaluate("document.querySelector('[data-tui-pane]').hidden"), false);
  assert.equal(await evaluate("window.__terminalInstance===document.querySelector('[data-tui-terminal]')"), true);
  assert.equal(await evaluate("document.querySelector('[data-plugin-heading]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane').dataset.desktopDirectory"), "root");
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]').hidden"), false);
  await click('[data-goal-collapse]');
  assert.equal(await evaluate("document.querySelector('[data-graph-stage]').getAttribute('style')"), camera);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).runs, before.runs);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list'");
  await click('[data-select-goal="' + goalId + '"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});

test("Bundled market adds to the selected project and Artifact versions stay in the current workbench", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { store, projectId, command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  const app = openProjectVersionStores(store);
  installProducers(store.db, { plugin_id: "example.writer", artifact_types: ["example.note"] });
  for (const version of [1, 2]) app.artifacts.commands.registerVersion({ ...pinnedArtifact(version === 1 ? "Original result" : "Revised result", { kind: "item", id: "review-note" }, String(version)),
    project_id: projectId!, actor_id: "fixture", artifact_id: "review-note", version,
    artifact_type_id: "example.note", schema_version: 1,
    producer: { plugin_id: "example.writer", plugin_version: "1.0.0", binding_signature: "fixture" },
    content: { kind: "inline", payload: { text: version === 1 ? "Original result" : "Revised result" } }, metadata: {},
  });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const prefix = "/projects/" + projectId;
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  assert.equal(await evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=artifacts]')"), null);
  // The market is yours everywhere, so it is a button at the head of the switcher rather than among this project's plugins.
  assert.equal(await evaluate("Boolean(document.querySelector('.plugin-rail-items [data-plugin-id=market]'))"), false);
  assert.equal(await evaluate("document.querySelector('.plugin-picker-extend[data-global-menu] [data-work-surface-open=market]')?.dataset.pluginId"), "market");
  const railColors = await evaluate<{ current: string; idle: string; market: string; idleId: string }>(`(() => {
    const items = [...document.querySelectorAll('.plugin-rail-items [data-plugin-id]')].map((node) => ({
      id: node.dataset.pluginId,
      current: node.getAttribute('aria-current') === 'page',
      color: getComputedStyle(node.querySelector('svg')).color,
    }));
    const current = items.find((item) => item.current);
    const idle = items.find((item) => !item.current);
    const marketNode = document.querySelector('[data-global-menu] [data-plugin-id=market] svg');
    return { current: current?.color || '', idle: idle?.color || '', idleId: idle?.id || '', market: marketNode ? getComputedStyle(marketNode).color : '' };
  })()`);
  assert.ok(railColors.idle && railColors.current && railColors.market, "rail has current, idle and market icons: " + JSON.stringify(railColors));
  assert.notEqual(railColors.idle, railColors.current, "idle " + railColors.idleId + " keeps a different identity colour from the current plugin");
  assert.equal(railColors.idle, railColors.market, "idle tools and the market share one neutral glyph colour");
  const otherId = await evaluate<string>(`(async()=>{const r=await fetch('/api/settings/projects',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({display_name:'另一个项目',user_confirmed:true})});if(!r.ok)throw new Error(await r.text());return (await r.json()).project.project_id;})()`);
  await click('[data-work-surface-open="market"]');
  await waitFor("!document.querySelector('[data-market-project]').disabled");
  await evaluate(`(()=>{const s=document.querySelector('[data-market-project]');s.value=${JSON.stringify(otherId)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('[data-market-add="feed"]');
  await waitFor("document.querySelector('[data-market-add=feed]').textContent === '移除'");
  assert.equal(await evaluate("document.querySelector('[data-market-add=inbox]').textContent"), "移除");
  const list = await evaluate<{ project_id: string; plugins: string[] }[]>("fetch('/api/settings/project-plugins').then(r=>r.json()).then(r=>r.projects)");
  assert.deepEqual(list.find(item => item.project_id === projectId)!.plugins, ["goals", "schedule"]);
  assert.deepEqual(list.find(item => item.project_id === otherId)!.plugins, ["feed", "goals", "inbox", "schedule"]);
  await evaluate(`(()=>{const s=document.querySelector('[data-market-project]');s.value=${JSON.stringify(projectId)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // This project: the page changes in place (the switcher's entry wakes, nothing is loaded again).
  await evaluate("window.__stayedOnPage = true");
  await click('[data-market-add="artifacts"]');
  await waitFor("document.querySelector('[data-market-add=artifacts]').dataset.marketMembership === 'added' && !document.querySelector('[data-plugin-tile=artifacts]').classList.contains('is-available')");
  assert.equal(await evaluate("window.__stayedOnPage === true"), true, "adding to this project does not load the page again");
  await waitFor("document.body.dataset.desktopSurface === 'market' && !document.querySelector('[data-market-project]').disabled");
  await evaluate("(()=>{let q=document.querySelector('[data-market-search]');q.value='成果';q.dispatchEvent(new Event('input',{bubbles:true}));})()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-market-plugin]:not([hidden])')].map(x=>x.dataset.marketPlugin)"), ["artifacts"]);
  await click('[data-plugin-strip] [data-plugin-id="artifacts"]');
  await waitFor("document.querySelector('[data-artifact-directory] .artifact-version-list')");
  await evaluate("window.__workbenchInstance=document.querySelector('[data-workspace]')");
  await click('[data-artifact-directory] a[href$="/versions/1"]');
  await waitFor("document.body.dataset.desktopSurface === 'artifacts' && /Original result/.test(document.querySelector('[data-artifact-detail] h1')?.textContent || '')");
  assert.equal(await evaluate("window.__workbenchInstance===document.querySelector('[data-workspace]')"), true);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + otherId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=artifacts]')"), null);
  assert.ok(await evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=feed]'))"));
  assert.ok(await evaluate("Boolean(document.querySelector('[data-plugin-strip] [data-plugin-id=inbox]'))"));
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor("document.body.dataset.desktopSurface === 'inbox' && document.querySelector('[data-inbox-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.match(await evaluate<string>("document.querySelector('[data-inbox-stage-group-empty]')?.textContent || document.querySelector('[data-inbox-detail-empty]')?.textContent || ''"), /现在没有需要你介入的事项/);
  assert.equal(await evaluate("document.querySelector('[data-feed-views]')"), null);
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && Boolean(document.querySelector('[data-feed-stage-directory]'))");
  assert.equal(await evaluate("document.querySelector('[data-feed-views]')"), null);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory"), "root");
  assert.ok(await evaluate("Boolean(document.querySelector('[data-feed-add-toggle]'))"));
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane [data-feed-task=all]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-feed-list]')?.closest('#goal-tree-pane')"), null);
});

test("Project entry lands at home, while refresh preserves work and Goal links remain direct", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  await waitFor("document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await evaluate("document.querySelector('[data-goal-collapse]')?.click(); document.querySelector('[data-board-view-tab=canvas]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas' && document.querySelector('[data-goal-node-workspace]')?.hidden !== false");
  await waitFor("document.querySelector('[data-graph-node][data-goal-id] [data-graph-open]')");
  const goalId = await evaluate<string>(`(() => {
    const visible = [...document.querySelectorAll('[data-graph-node][data-goal-id]')].find((node) => {
      const rect = node.getBoundingClientRect();
      return node.querySelector('[data-graph-open]') && rect.width > 8 && rect.height > 8
        && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    });
    const node = visible || document.querySelector('[data-graph-node].is-selected') || document.querySelector('[data-graph-node][data-goal-id]');
    node.querySelector('[data-graph-open]').click();
    return node.dataset.goalId;
  })()`);
  await waitFor("!document.querySelector('[data-goal-node-workspace]').hidden");
  await reloadPage();
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-goal-node-workspace]')?.hidden === false");
  const linkedGoal = goalId === "CORE" ? "WEB" : "CORE";
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(linkedGoal) }, sessionId));
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === " + JSON.stringify(linkedGoal) + " && document.querySelector('[data-goal-frame-surface]')?.hidden === false");
  await click("[data-frame-goal-work]");
  await waitFor("document.querySelector('[data-goal-node-workspace]')?.dataset.expandedGoal === " + JSON.stringify(linkedGoal) + " && document.querySelector('[data-goal-node-workspace]')?.hidden === false");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document]')?.dataset.goalView"), linkedGoal);
  assert.equal(await evaluate("location.pathname"), "/goals/" + linkedGoal);
  await click('[data-plugin-strip] [data-plugin-id="home"]');
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home");
});

test("RAC-1313 RAC-1314 a market change to another project says what came or went with it, and what did not come", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { projectId, command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  const status = () => evaluate<string>("document.querySelector('[data-market-status]').textContent || ''");
  const selectProject = (id: string) => evaluate(`(()=>{const s=document.querySelector('[data-market-project]');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const other = await evaluate<string>(`(async()=>{const r=await fetch('/api/settings/projects',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({display_name:'另一个项目',user_confirmed:true})});if(!r.ok)throw new Error(await r.text());return (await r.json()).project.project_id;})()`);
  await click('[data-work-surface-open="market"]');
  await waitFor("!document.querySelector('[data-market-project]').disabled");
  await selectProject(other);
  await waitFor("Boolean(document.querySelector('[data-market-plugin=\"feed\"] [data-market-add]')) && !document.querySelector('[data-market-plugin=\"feed\"] [data-market-add]').disabled", 10_000);
  // RAC-1313: adding Feed to another project says Inbox came with it.
  await click('[data-market-plugin="feed"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"feed\"] [data-market-add]').dataset.marketMembership === 'added'", 10_000);
  assert.match(await status(), /^已添加到 另一个项目；同时添加了：Inbox$/);
  // RAC-1313: removing Inbox from it takes Feed with it.
  await click('[data-market-plugin="inbox"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').dataset.marketMembership === 'available'", 10_000);
  assert.match(await status(), /^已移除自 另一个项目；同时移除了：Feed$/);
  // RAC-1314: adding Inbox to that project (no Feed now) says Feed does not come with it.
  await click('[data-market-plugin="inbox"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').dataset.marketMembership === 'added'", 10_000);
  assert.match(await status(), /^已添加到 另一个项目；依赖它的插件不会一并添加：Feed$/);
  // RAC-1314: once Feed is in it too, the Inbox card is a removal and says nothing about a plugin not coming with it.
  await click('[data-market-plugin="feed"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"feed\"] [data-market-add]').dataset.marketMembership === 'added'", 10_000);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').getAttribute('title') || ''"), /依赖它的插件不会一并添加/);
  // RAC-1313: in this project the same two things are done in place, and the line stays the one sentence: the toast says
  // what came along, once. The current project starts with Feed and Inbox; taking Inbox out takes Feed with it.
  await selectProject(projectId!);
  await waitFor("Boolean(document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]'))", 10_000);
  const here = await evaluate<string>("document.querySelector('[data-market-project-label]').textContent");
  const membership = () => evaluate<string[]>(`fetch('/api/settings/project-plugins').then(r=>r.json()).then(r=>r.projects.find(p=>p.project_id===${JSON.stringify(projectId)})?.plugins || [])`);
  if ((await evaluate("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').dataset.marketMembership")) === "added") {
    await click('[data-market-plugin="inbox"] [data-market-add]');
    await waitFor("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').dataset.marketMembership === 'available'", 10_000);
  }
  assert.deepEqual((await membership()).filter(id => ["feed", "inbox"].includes(id)), [], "neither is in this project now");
  // Every write of the status line from here on, wherever the market's own surface is redrawn: the writer the page keeps holds
  // the element it was made with, so a line written after a redraw would be invisible — record the writes themselves.
  await evaluate(`(() => {
    window.__marketStatusWrites = [];
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    Object.defineProperty(Node.prototype, "textContent", {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) {
        if (this instanceof Element && this.hasAttribute("data-market-status")) window.__marketStatusWrites.push(String(value));
        descriptor.set.call(this, value);
      },
    });
    return true;
  })()`);
  // Adding Feed in this project brings Inbox with it: the membership shows both, the toast says so once, the line does not.
  await click('[data-market-plugin="feed"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"feed\"] [data-market-add]').dataset.marketMembership === 'added'", 10_000);
  await waitFor("(() => { const t = document.querySelector('[data-toast]'); return t && /同时添加了：Inbox/.test(t.textContent || ''); })()", 10_000);
  assert.deepEqual((await membership()).filter(id => ["feed", "inbox"].includes(id)).sort(), ["feed", "inbox"], "Inbox came along");
  const addedWrites: string[] = await evaluate("window.__marketStatusWrites");
  assert.ok(addedWrites.includes("已添加到 " + here), "the one existing sentence was written: " + JSON.stringify(addedWrites));
  assert.deepEqual(addedWrites.filter(line => /同时添加了|同时移除了|依赖它的插件不会一并添加/.test(line)), [],
    "the line never repeats what the toast says: " + JSON.stringify(addedWrites));
  // Removing Inbox takes Feed with it: same rule, the other way.
  await click('[data-market-plugin="inbox"] [data-market-add]');
  await waitFor("document.querySelector('[data-market-plugin=\"inbox\"] [data-market-add]').dataset.marketMembership === 'available'", 10_000);
  await waitFor("(() => { const t = document.querySelector('[data-toast]'); return t && /同时移除了：Feed/.test(t.textContent || ''); })()", 10_000);
  assert.deepEqual((await membership()).filter(id => ["feed", "inbox"].includes(id)), [], "Feed went with Inbox");
  const removedWrites: string[] = await evaluate("window.__marketStatusWrites");
  assert.ok(removedWrites.includes("已移除自 " + here), "the one existing sentence was written: " + JSON.stringify(removedWrites));
  assert.deepEqual(removedWrites.filter(line => /同时添加了|同时移除了|依赖它的插件不会一并添加/.test(line)), [],
    "the line never repeats what the toast says: " + JSON.stringify(removedWrites));
});
