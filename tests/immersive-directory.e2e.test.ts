import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openGoalBoardProjectCatalog } from "@adeptify/goalboard-app-desktop";
import { createLocalFeedApplication, DEMO_BOARD_ID, GoalProjectApplication, openWorkSessionRegistry } from "@adeptify/goalboard-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Immersive directories resize and retain compact, operable Goal, Feed and Session lists", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "migrated");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, store, projectId, homeDirectory } = browser;
  const catalog = await openGoalBoardProjectCatalog({ homeDirectory });
  for (const plugin_id of ["feed", "sessions"] as const) catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "directory-test" });
  const other = await catalog.createProject({ display_name: "另一项目", actor_id: "directory-test" });
  catalog.close();
  new GoalProjectApplication(store).goalEvents.createIntent({ board_id: DEMO_BOARD_ID, goal_id: "long-child", parent_goal_id: "CORE", actor_id: "directory-test", actor_kind: "user", title: "迁移 Execution Claim / Run 生命周期并保留现有 Runtime 与 Goal 的完整关联", outcome: "验证多层目录中的长标题不会挤压状态标记。", idempotency_key: "long-child" });
  const before = store.snapshot(DEMO_BOARD_ID);
  const registry = await openWorkSessionRegistry({ homeDirectory });
  const session = registry.createSession({ runtime_id: "codex", project_id: projectId!, current_goal_id: "CORE", title: "完成 GoalBoard 架构、代码与文档重组，保留已有项目工作过程", user_confirmed: true, actor_id: "directory-test" });
  registry.createSession({ runtime_id: "claude-code", project_id: projectId!, current_goal_id: "WEB", title: "检查目录与工作区交互", user_confirmed: true, actor_id: "directory-test" });
  registry.close();
  const page = origin + "/projects/" + projectId + "/?desktop=1";
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uiErrors=[];addEventListener('error',e=>window.__uiErrors.push(e.message));" }, sessionId);
  const viewport = (width: number, height = 1000) => command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
  const key = async (value: string, code: number) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: value, windowsVirtualKeyCode: code }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: value, windowsVirtualKeyCode: code }, sessionId);
  };
  const capture = async (name: string) => {
    if (!process.env.GOALBOARD_DIRECTORY_CAPTURE) return;
    const directory = process.env.GOALBOARD_DIRECTORY_CAPTURE;
    await mkdir(directory, { recursive: true });
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(join(directory, name + ".png"), Buffer.from(data, "base64"));
  };
  const width = () => evaluate<number>("document.querySelector('#goal-tree-pane').getBoundingClientRect().width");
  const expectWidth = (expected: number) => waitFor("document.querySelector('#goal-tree-pane').getBoundingClientRect().width === " + expected);
  await viewport(1440);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await click('[data-directory-panel="root"] [data-directory-open="goals"]');
  const metrics = await evaluate<{ height: number; weight: string; line: string; titleRight: number; stateLeft: number; border: string }[]>(`[...document.querySelectorAll('.tree-entry')].map(row => {
    const title = row.querySelector('strong'), state = row.querySelector('.directory-row-state');
    return { height: row.getBoundingClientRect().height, weight: getComputedStyle(title).fontWeight, line: getComputedStyle(title).whiteSpace, titleRight: title.getBoundingClientRect().right, stateLeft: state.getBoundingClientRect().left, border: getComputedStyle(state).borderWidth };
  })`);
  assert.ok(metrics.length > 10);
  for (const row of metrics) {
    assert.equal(row.height, 32, "Parent and child rows share a single-line height");
    assert.equal(row.line, "nowrap");
    assert.ok(Number(row.weight) <= 500);
    assert.ok(row.titleRight <= row.stateLeft, "Long text must not cover the status");
    assert.equal(row.border, "0px", "The label supplies its own boundary without a second enclosing box");
  }
  await capture("directory-goals-light");
  const point = await evaluate<{ x: number; y: number }>("(()=>{const r=document.querySelector('[data-tree-resizer]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+180};})()");
  const initial = await width();
  await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 120, y: point.y, button: "left", buttons: 1 }, sessionId);
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + 120, y: point.y, button: "left", clickCount: 1 }, sessionId);
  await expectWidth(initial + 120);
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('goalboard-ui:' + JSON.parse(document.querySelector('#goalboard-data').textContent).project.project_id + ':current')).treeWidth"), initial + 120, "Pointer release persists the final width");
  await reloadPage();
  await expectWidth(initial + 120);
  await evaluate("document.querySelector('[data-tree-resizer]').focus()");
  await key("ArrowLeft", 37);
  await expectWidth(initial + 104);
  await click('[data-directory-toggle]');
  await viewport(1280);
  await click('[data-directory-show]');
  await expectWidth(initial + 104);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + other.project_id + "/" }, sessionId));
  await expectWidth(264);
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await expectWidth(initial + 104);
  await click('[data-directory-panel="root"] [data-directory-open="goals"]');
  await evaluate("document.querySelector('[data-tree-resizer]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await expectWidth(264);
  await click('[data-select-goal="long-child"]');
  await waitFor("document.querySelector('[data-goal-node-workspace]').dataset.expandedGoal==='long-child'");
  await click('[data-goal-collapse]');
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("!document.querySelector('[data-feed-empty]').hidden");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-feed-empty]')).backgroundColor"), "rgba(0, 0, 0, 0)");
  const emptyText = await evaluate<string>("document.querySelector('[data-feed-empty]').textContent");
  assert.match(emptyText, /打开来源/);
  await capture("directory-feed-empty");

  const feed = createLocalFeedApplication(store.db);
  const now = new Date().toISOString();
  const source = feed.upsertSource({ board_id: DEMO_BOARD_ID, source_id: "directory-rss", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "产品观察", description: "目录验证", status: "active", enabled: true, item_count: 0, origin: "goalboard", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "first", title: "从首次使用观察中找到下一步值得改进的地方", summary: "完整保留消息来源和正文，再决定如何推进。", body: "这条消息用于验证在真实目录中打开和阅读内容。", occurredAt: now, attention: false });
  feed.ingestItem({ source, externalId: "second", title: "终端与目标信息应当如何配合", summary: "切换工作时保留上下文，让记录留在正确的目标里。", body: "第二条目录内容。", occurredAt: now, attention: false });
  await reloadPage();
  await waitFor("document.querySelectorAll('[data-feed-entry-id]').length===2");
  const feedMetrics = await evaluate<{ height: number; line: string; icons: number }[]>(`[...document.querySelectorAll('.feed-list-item')].map(row => ({
    height: row.getBoundingClientRect().height,
    line: getComputedStyle(row.querySelector('strong')).whiteSpace,
    icons: row.querySelectorAll('.feed-list-icon, .source-list-icon').length,
  }))`);
  assert.equal(feedMetrics.length, 2);
  for (const row of feedMetrics) {
    assert.equal(row.height, 32, "Feed rows share Goal's single-line height");
    assert.equal(row.line, "nowrap");
    assert.equal(row.icons, 0);
  }
  await capture("directory-feed-list");
  await click('[data-feed-views] [data-work-surface-open="sources"]');
  await waitFor("document.querySelectorAll('.source-list-item').length>=1");
  const sourceMetrics = await evaluate<{ height: number; line: string; titleRight: number; stateLeft: number }[]>(`[...document.querySelectorAll('.source-list-item')].map(row => {
    const title = row.querySelector('strong'), state = row.querySelector('.directory-row-state');
    return { height: row.getBoundingClientRect().height, line: getComputedStyle(title).whiteSpace, titleRight: title.getBoundingClientRect().right, stateLeft: state.getBoundingClientRect().left };
  })`);
  assert.ok(sourceMetrics.length >= 1);
  for (const row of sourceMetrics) {
    assert.equal(row.height, 32, "Source rows share Goal's single-line height");
    assert.equal(row.line, "nowrap");
    assert.ok(row.titleRight <= row.stateLeft, "Source titles must not cover the status");
  }
  await click('[data-feed-views] [data-work-surface-open="feed"][data-feed-preset="feed"]');
  await waitFor("document.querySelectorAll('[data-feed-entry-id]').length===2");
  await evaluate("(()=>{let q=document.querySelector('[data-feed-search]');q.value='不存在的消息';q.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("!document.querySelector('[data-feed-empty]').hidden");
  assert.ok(await evaluate("document.querySelector('[data-feed-clear-filters]').getClientRects().length>0"));
  await click('[data-feed-clear-filters]');
  await click('[data-feed-filter-trigger]');
  assert.ok(await evaluate("(()=>{let p=document.querySelector('[data-feed-filter-panel]').getBoundingClientRect(),r=document.querySelector('#goal-tree-pane').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.bottom<=innerHeight;})()"));
  await capture("directory-feed-filter");
  await click('[data-feed-filter-trigger]');
  await click('[data-feed-item-id="' + item.item.item_id + '"]');
  await waitFor("document.querySelector('[data-feed-detail]:not([hidden])')");
  assert.ok(feed.getItem(DEMO_BOARD_ID, item.item.item_id).read_at);
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelectorAll('[data-operation-row=session]').length===2");
  const sessionRows = await evaluate<{ height: number; line: string; titleRight: number; stateLeft: number }[]>(`[...document.querySelectorAll('[data-operation-row=session] .tree-entry')].map(row => {
    const title = row.querySelector('strong'), state = row.querySelector('.directory-row-state');
    return { height: row.getBoundingClientRect().height, line: getComputedStyle(title).whiteSpace, titleRight: title.getBoundingClientRect().right, stateLeft: state.getBoundingClientRect().left };
  })`);
  assert.equal(sessionRows.length, 2);
  for (const row of sessionRows) {
    assert.equal(row.height, 32, "Session rows share the Goal single-line height");
    assert.equal(row.line, "nowrap");
    assert.ok(row.titleRight <= row.stateLeft, "Session titles must not cover the status");
  }
  assert.ok(await evaluate("(()=>{let a=document.querySelector('[data-operation-search=sessions]').getBoundingClientRect(),b=document.querySelector('.project-record-filter-menu > summary').getBoundingClientRect();return Math.abs(a.y-b.y)<3;})()"));
  await capture("directory-sessions-list");
  await click('.project-record-filter-menu > summary');
  assert.ok(await evaluate("(()=>{let p=document.querySelector('.project-record-filter-menu > div').getBoundingClientRect(),r=document.querySelector('#goal-tree-pane').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right;})()"));
  await capture("directory-sessions-filter");
  await evaluate("(()=>{let s=document.querySelector('[data-session-runtime-filter]');s.value='codex';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("document.querySelectorAll('[data-operation-row=session]:not([hidden])').length===1");
  await key("Escape", 27);
  assert.equal(await evaluate("document.querySelector('.project-record-filter-menu').open"), false);
  await click('[data-operation-select="' + session.session_id + '"]');
  assert.match(await evaluate<string>("document.querySelector('[data-operation-detail=session]:not([hidden])').textContent"), /完成 GoalBoard 架构/);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme='dark'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-operation-row=session] .tree-title-line strong')).color"), "rgb(232, 233, 238)");
  await capture("directory-sessions-dark");
  await viewport(1024, 800);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-1024");
  await viewport(700, 800);
  assert.ok(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length>0"));
  await evaluate("document.querySelector('[data-tree-resizer]').focus()");
  await key("ArrowRight", 39);
  await expectWidth(280);
  await viewport(390, 844);
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  assert.ok(await evaluate("document.querySelector('.navigator-project').getBoundingClientRect().height===84"));
  assert.ok(await evaluate("document.querySelector('.personal-sidebar-footer').getBoundingClientRect().bottom<=innerHeight"));
  await expectWidth(264);
  assert.equal(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-mobile");
  await click('[data-select-goal="long-child"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs, before.runs);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});
