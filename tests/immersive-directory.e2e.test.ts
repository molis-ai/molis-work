import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication, GoalProjectApplication, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Immersive directories resize and retain compact, operable Goal, Feed and Session lists", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, store, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  for (const plugin_id of ["feed", "sessions"] as const) catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "directory-test" });
  const other = await catalog.createProject({ display_name: "另一项目", actor_id: "directory-test" });
  catalog.close();
  new GoalProjectApplication(store).goalEvents.createIntent({ project_id: projectId!, goal_id: "long-child", parent_goal_id: "CORE", actor_id: "directory-test", actor_kind: "user", title: "迁移 Execution Claim / Run 生命周期并保留现有 Runtime 与 Goal 的完整关联", outcome: "验证多层目录中的长标题不会挤压状态标记。", idempotency_key: "long-child" });
  const before = store.snapshot(projectId!);
  const registry = await openWorkSessionRegistry({ homeDirectory });
  const session = registry.createSession({ runtime_id: "codex", project_id: projectId!, current_goal_id: "CORE", title: "完成 Molis Work 架构、代码与文档重组，保留已有项目工作过程", user_confirmed: true, actor_id: "directory-test" });
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
    if (!process.env.MOLIS_WORK_DIRECTORY_CAPTURE) return;
    const directory = process.env.MOLIS_WORK_DIRECTORY_CAPTURE;
    await mkdir(directory, { recursive: true });
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(join(directory, name + ".png"), Buffer.from(data, "base64"));
  };
  const width = () => evaluate<number>("Math.round(document.querySelector('#goal-tree-pane').getBoundingClientRect().width)");
  const expectWidth = (expected: number) => waitFor("Math.round(document.querySelector('#goal-tree-pane').getBoundingClientRect().width) === " + expected);
  await viewport(1440);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  // craft-finish round 4 retired the left plugin rail, its project island and the Dock line; the bottom-bar test below
  // covers the current shell. This test keeps to the Goal, Feed and Session lists themselves.
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("Math.round(document.querySelector('.immersive-titlebar').getBoundingClientRect().height)"), 32, "Titlebar is a 32px Linear-height row");
  assert.equal(await evaluate("document.querySelector('[data-directory-list-title]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-list-region]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-goal-stage-chrome] [data-open-create]') && document.querySelector('[data-goal-stage-list] [data-tree-root]')");
  const addLayout = await evaluate<{ ok: boolean; dump: string }>(`(()=>{
    const tabs=[...document.querySelectorAll('[data-titlebar-tabs] .tab-item')].filter((tab)=>tab.getClientRects().length);
    const last=tabs.at(-1), add=document.querySelector('[data-titlebar-tabs] .tab-add-button'), split=document.querySelector('[data-titlebar-tabs] .tab-split-button'), titlebar=document.querySelector('.immersive-titlebar');
    if(!last||!add||!split||!titlebar) return {ok:false, dump:'missing'};
    const l=last.getBoundingClientRect(), a=add.getBoundingClientRect(), s=split.getBoundingClientRect(), t=titlebar.getBoundingClientRect();
    return {
      ok: Math.abs(s.left-a.right)<20 && Math.abs((a.top+a.bottom)/2-(s.top+s.bottom)/2)<4 && Math.abs(t.right-s.right)<20 && a.left>=l.right+24,
      dump: JSON.stringify({lastRight:Math.round(l.right), addLeft:Math.round(a.left), addRight:Math.round(a.right), splitLeft:Math.round(s.left), splitRight:Math.round(s.right), titlebarRight:Math.round(t.right), addCy:Math.round((a.top+a.bottom)/2), splitCy:Math.round((s.top+s.bottom)/2)})
    };
  })()`);
  assert.ok(addLayout.ok, "Add sits with the split on the titlebar right " + addLayout.dump);
  assert.ok(await evaluate("(()=>{const create=document.querySelector('[data-goal-stage-chrome] [data-open-create]'),filter=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]'),board=document.querySelector('[data-goal-stage-chrome] [data-board-switch]'),shell=document.querySelector('[data-goal-canvas-shell]');if(!create||!filter||!board||!shell)return false;const c=create.getBoundingClientRect(),f=filter.getBoundingClientRect(),b=board.getBoundingClientRect(),s=shell.getBoundingClientRect();return c.left-s.left<40 && f.left-s.left<200 && b.left>=f.right && b.left-f.right<16 && Math.abs(b.top-f.top)<8 && s.right-b.right>80 && Math.abs(c.top-s.top)<28 && Math.abs(f.top-s.top)<28;})()"), "New Goal, filter, and icon view switch sit together in the stage top-left");
  assert.ok(await evaluate("(()=>{const search=document.querySelector('[data-workspace-chrome] [data-global-search-open]'),settings=document.querySelector('.titlebar-chrome .navigator-project-settings'),toggle=document.querySelector('.titlebar-chrome [data-directory-toggle]');return search.closest('.navigator-project-primary') && settings?.closest('.navigator-project-menu-popover') && getComputedStyle(toggle).display==='none';})()"), "Project settings live in the project menu; desktop hides directory collapse even on plugins without a directory");
  const create = await evaluate<{ bg: string; color: string; radius: string; icon: string; border: string }>("(()=>{const button=document.querySelector('[data-open-create]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,border:s.borderTopColor};})()");
  // New Goal is the Goals page's one graphite button, like every list page's first create action
  // (DESIGN.md → Plugin stage; specs/archive/plugin-e2e-review/spec.md §4 X5, kept by the user after #108):
  // graphite --action fill, --action-ink text and glyph, 8px control corners, no outline.
  assert.equal(create.bg, "rgb(41, 42, 44)", "New Goal is the graphite primary action");
  assert.equal(create.color, "rgb(255, 255, 255)");
  assert.equal(create.icon, create.color);
  assert.equal(create.radius, "8px");
  assert.equal(create.border, "rgba(0, 0, 0, 0)", "New Goal has no outline");
  const filter = await evaluate<{ bg: string; color: string; radius: string; icon: string; height: number; width: number; border: string }>("(()=>{const button=document.querySelector('[data-tree-filter-trigger]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,height:Math.round(button.getBoundingClientRect().height),width:Math.round(button.getBoundingClientRect().width),border:s.borderTopColor};})()");
  // The filter stays a quiet toolbar control: the ink-4% wash, ink text and glyph, same corners, no outline.
  assert.equal(filter.bg, "color(srgb 0.160784 0.164706 0.172549 / 0.04)", "Filter keeps the quiet control wash");
  assert.equal(filter.color, "rgb(41, 42, 44)");
  assert.equal(filter.icon, "rgb(41, 42, 44)");
  assert.equal(filter.radius, create.radius);
  assert.equal(filter.border, create.border);
  // Standard density controls are 32px tall (DESIGN.md → Density); compact keeps 28px. With room, the filter is named
  // (「状态」) instead of being a bare icon (plugin-e2e-review §5.1), so it is wider than a square icon button.
  assert.equal(filter.height, 32);
  assert.ok(filter.width > 32, "the status filter shows its name on a wide stage");
  // The trigger is a grid, so its label is blockified: check that it renders with width and says 状态, not its display keyword.
  assert.ok(await evaluate("(()=>{const label=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger] > span');return Boolean(label) && getComputedStyle(label).display!=='none' && label.getBoundingClientRect().width>0 && label.textContent.trim()==='状态';})()"), "the status filter label is visible on a wide stage");
  assert.ok(await evaluate("(()=>{const shell=document.querySelector('[data-goal-canvas-shell]'),list=document.querySelector('[data-goal-stage-list]'),chrome=document.querySelector('[data-goal-stage-chrome]');if(!shell||!list||!chrome)return false;const s=shell.getBoundingClientRect(),l=list.getBoundingClientRect();return Math.abs(s.top-l.top)<2 && getComputedStyle(shell).backgroundColor===getComputedStyle(list).backgroundColor && getComputedStyle(chrome).backgroundColor==='rgba(0, 0, 0, 0)';})()"), "List paper fills the stage top; chrome has no toolbar strip");
  await evaluate("document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]')?.click()");
  await waitFor("document.querySelector('[data-goal-stage-chrome] [data-tree-filter]') && !document.querySelector('[data-goal-stage-chrome] [data-tree-filter]').hidden");
  await evaluate("document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]')?.click()");
  await waitFor("document.querySelector('[data-tree-filter]')?.hidden === true");
  assert.ok(await evaluate("(()=>{const fold=document.querySelector('[data-goal-collection-fold=current]'),archive=document.querySelector('[data-goal-collection-fold=archive]'),trash=document.querySelector('[data-goal-collection-fold=trash]');return Boolean(fold?.open) && fold?.querySelector('strong')?.textContent==='当前' && archive && !archive.open && trash && !trash.open && fold.querySelector('[data-tree-root]');})()"), "Live Goals sit in an open Current fold above collapsed archive and trash");
  assert.ok(await evaluate(`(() => {
    const fold = document.querySelector('[data-goal-stage-list] [data-goal-collection-fold=current]');
    const header = fold?.querySelector(':scope > summary .goal-collection-caret');
    const root = fold?.querySelector('[data-tree-item][data-tree-depth="0"] :is(.tree-toggle, .tree-guide)');
    if (!header || !root) return false;
    return Math.abs((root.getBoundingClientRect().left - header.getBoundingClientRect().left) - 16) <= 2;
  })()`), "Root goals sit one indent step under the collection caret");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-goal-collection-fold=archive]')).borderTopWidth"), "0px", "Current/archive/trash folds share one stack without a divider");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.notEqual(await evaluate("document.querySelector('[data-goal-canvas-shell]')?.getAttribute('data-expanded')"), "true", "Opening the Goals plugin must not expand a Goal");
  assert.equal(await evaluate("document.querySelector('[data-goal-node-workspace]')?.hidden"), true);
  const metrics = await evaluate<{ height: number; weight: string; line: string; titleWidth: number; titleRight: number; stateLeft: number; border: string; selected: boolean; relationsLine?: string; relationsHeight?: number }[]>(`[...document.querySelectorAll('[data-goal-stage-list] [data-tree-root]:not([data-collection-tree]) .tree-entry')].map(row => {
    const title = row.querySelector('strong'), state = row.querySelector('.directory-row-state'), relations = row.querySelector('.tree-relations-copy');
    return {
      height: Math.round(row.getBoundingClientRect().height),
      weight: getComputedStyle(title).fontWeight,
      line: getComputedStyle(title).whiteSpace,
      titleWidth: title.getBoundingClientRect().width,
      titleRight: title.getBoundingClientRect().right,
      stateLeft: state.getBoundingClientRect().left,
      border: getComputedStyle(state).borderWidth,
      selected: row.classList.contains('is-selected'),
      relationsLine: relations ? getComputedStyle(relations).whiteSpace : undefined,
      relationsHeight: relations ? Math.round(relations.getBoundingClientRect().height) : undefined
    };
  })`);
  assert.ok(metrics.length > 10);
  const stateLefts = new Set(metrics.map(row => row.stateLeft));
  assert.equal(stateLefts.size, 1, "Status columns align across parent and child rows");
  const indent = await evaluate<{ depths: number[]; step: number; errors: string[] }>(`(() => {
    const items = [...document.querySelectorAll('[data-goal-stage-list] [data-tree-root]:not([data-collection-tree]) [data-tree-item]')];
    const rows = items.map((item) => {
      const title = item.querySelector(':scope > .tree-row .tree-title-line strong');
      const leading = item.querySelector(':scope > .tree-row .tree-leading');
      const nest = item.querySelector(':scope > .tree-children');
      const nestStyle = nest ? getComputedStyle(nest) : null;
      return {
        depth: Number(item.dataset.treeDepth),
        left: title.getBoundingClientRect().left,
        pad: Math.round(parseFloat(getComputedStyle(leading).paddingLeft)),
        nest: nestStyle ? Math.round(parseFloat(nestStyle.marginLeft) + parseFloat(nestStyle.paddingLeft)) : 0
      };
    });
    const byDepth = new Map();
    for (const row of rows) {
      const group = byDepth.get(row.depth) ?? [];
      group.push(row);
      byDepth.set(row.depth, group);
    }
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    const root = Math.min(...byDepth.get(0).map((row) => Math.round(row.left)));
    const errors = [];
    for (const depth of depths) {
      const group = byDepth.get(depth);
      const lefts = group.map((row) => Math.round(row.left));
      if (new Set(lefts).size !== 1) errors.push('depth ' + depth + ' titles are not aligned: ' + lefts.join(','));
      if (group.some((row) => row.pad !== (depth + 1) * 16)) errors.push('depth ' + depth + ' leading pad ' + group.map((row) => row.pad).join(',') + ' expected ' + ((depth + 1) * 16));
      if (group.some((row) => row.nest !== 0)) errors.push('depth ' + depth + ' nested list inset ' + group.map((row) => row.nest).join(','));
      const expected = root + depth * 16;
      if (Math.abs(lefts[0] - expected) > 2) errors.push('depth ' + depth + ' left ' + lefts[0] + ' expected ' + expected);
    }
    return { depths, step: 16, errors };
  })()`);
  assert.deepEqual(indent.errors, []);
  assert.ok(indent.depths.includes(0) && indent.depths.some((depth) => depth >= 3), "Demo tree exposes nested child indent");
  for (const row of metrics) {
    // One comfortable 34px line per Goal at standard density (spec → 第二轮 · 目标; compact keeps 28px).
    assert.equal(row.height, 34, "Parent and child rows share a single-line height");
    assert.equal(row.line, "nowrap");
    if (!row.selected) assert.ok(Number(row.weight) <= 500);
    assert.ok(row.titleWidth > 80, "Child titles use the remaining row instead of the 4.5ch ref column, got " + row.titleWidth);
    assert.equal(row.border, "0px", "The label supplies its own boundary without a second enclosing box");
    if (row.relationsLine) assert.equal(row.relationsLine, "nowrap", "Prerequisite copy stays on one line");
    if (row.relationsHeight != null) assert.ok(row.relationsHeight <= 28, "Prerequisite control does not wrap the row");
  }
  await capture("directory-goals-light");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-shelf-stage-group=materials]')");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=shelf]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=shelf]')"), null);
  await viewport(1280);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + other.project_id + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=sessions]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-session-stage-list]') && document.querySelector('[data-session-stage-chrome] [data-open-session-add]')");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=sessions]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=sessions]')"), null);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && Boolean(document.querySelector('[data-graph-node][data-goal-id=long-child] [data-graph-open]'))");
  await click("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  await click('[data-graph-node][data-goal-id="long-child"] [data-graph-open]');
  await waitFor("document.querySelector('[data-goal-node-workspace]').dataset.expandedGoal==='long-child'");
  await click('[data-goal-collapse]');
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-feed-stage-directory]') && document.querySelector('[data-work-surface=feed]:not([hidden])') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.equal(await evaluate("document.querySelector('[data-feed-list]')?.closest('#goal-tree-pane')"), null);
  assert.equal(await evaluate("document.querySelector('[data-feed-views]')"), null);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory"), "root");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=feed]')"), null);
  // Soft Workbench: adding a source sits in the Feed column heading; the empty list says what to do next.
  assert.ok(await evaluate("document.querySelector('[data-feed-source-header] [data-feed-add-toggle]')?.getBoundingClientRect().width > 0"));
  assert.ok(await evaluate("document.querySelector('[data-feed-empty]:not([hidden])')"), "Feed shows a page empty state");
  await capture("directory-feed-empty");

  const feed = createLocalFeedApplication(store.db);
  const now = new Date().toISOString();
  const source = feed.upsertSource({ project_id: projectId!, source_id: "directory-rss", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "产品观察", description: "目录验证", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "first", title: "从首次使用观察中找到下一步值得改进的地方", summary: "完整保留消息来源和正文，再决定如何推进。", body: "这条消息用于验证在真实目录中打开和阅读内容。", occurredAt: now, attention: false });
  feed.ingestItem({ source, externalId: "second", title: "终端与目标信息应当如何配合", summary: "切换工作时保留上下文，让记录留在正确的目标里。", body: "第二条目录内容。", occurredAt: now, attention: false });
  await reloadPage();
  await waitFor("document.querySelectorAll('[data-feed-entry-task=\"directory-rss\"]').length===2");
  const feedRow = await evaluate<{ height: number; size: string; weight: string; titleWidth: number; columns: string; status: boolean; chevron: boolean }>("(()=>{const row=document.querySelector('[data-feed-entry-id]'),title=row.querySelector('strong');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,titleWidth:Math.round(title.getBoundingClientRect().width),columns:getComputedStyle(row).gridTemplateColumns,status:Boolean(row.querySelector('.feed-entry-status')),chevron:Boolean(row.querySelector('.feed-entry-chevron'))};})()");
  // Soft Workbench prototype: a Feed row is a reading card (source line, title, one-line summary), not a single line.
  assert.ok(feedRow.height >= 72 && feedRow.height <= 130, "Feed rows are compact reading cards: " + feedRow.height);
  assert.equal(feedRow.size, "13px"); // on the fixed type scale (spec → 第三轮 · 字号)
  assert.ok(Number(feedRow.weight) <= 500);
  assert.ok(feedRow.titleWidth > 120, "Feed item titles use the row, not a leftover icon column");
  assert.doesNotMatch(feedRow.columns, /^(22px|24px|16px)/);
  assert.equal(feedRow.status, true, "Closed Feed rows use the Goal status mark");
  assert.equal(feedRow.chevron, false, "Closed Feed rows do not spend a column on a chevron");
  await capture("directory-feed-list");
  await evaluate("document.querySelector('[data-feed-filter-trigger]')?.click()");
  await evaluate("(()=>{const status=document.querySelector('[data-feed-status-filter]');if(!status)return;status.value='archived';status.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-feed-filter-option=\"status\"][data-feed-filter-value=\"archived\"]')?.click();})()");
  await waitFor("document.querySelector('[data-feed-empty]')?.hidden===false");
  assert.ok(await evaluate("document.querySelector('[data-feed-clear-filters]').getClientRects().length>0"));
  await evaluate("document.querySelector('[data-feed-filter-trigger]')?.click()");
  await click('[data-feed-clear-filters]');
  await click('[data-feed-filter-trigger]');
  assert.ok(await evaluate("(()=>{let p=document.querySelector('[data-feed-filter-panel]').getBoundingClientRect(),r=document.querySelector('[data-work-surface=feed]').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.bottom<=innerHeight;})()"));
  await capture("directory-feed-filter");
  await click('[data-feed-filter-trigger]');
  await click('[data-feed-entry-id][data-feed-item-id="' + item.item.item_id + '"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-feed-stage-shell]')?.dataset.expanded === 'true' && Boolean(document.querySelector('[data-feed-entry-detail=\"" + item.item.item_id + "\"]:not([hidden])')) && (document.querySelector('[data-work-surface=feed]')?.textContent || '').includes('从首次使用观察中找到下一步值得改进的地方')");
  const feedBack = await evaluate<{ ok: boolean; dump: string }>(`(() => {
    const back = document.querySelector('[data-work-surface=feed] [data-feed-entry-detail]:not([hidden]) .plugin-stage-back');
    const workspace = back?.closest('.plugin-stage-workspace');
    if (!workspace || !back) return { ok: false, dump: 'missing' };
    const inset = back.getBoundingClientRect().left - workspace.getBoundingClientRect().left;
    return { ok: inset >= 10 && inset <= 18, dump: JSON.stringify({ inset: Math.round(inset * 10) / 10 }) };
  })()`);
  assert.ok(feedBack.ok, "Feed close sits in the reading bar's inset " + feedBack.dump);
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelectorAll('[data-operation-row=session]').length===2 && document.querySelector('[data-plugin-strip] [data-plugin-id=sessions]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  const sessionRow = await evaluate<{ height: number; size: string; weight: string; line: string; titleRight: number; stateLeft: number; border: string; subtitle: string; goal: string }>("(()=>{const row=document.querySelector('[data-operation-row=session]'),title=row?.querySelector('strong'),state=row?.querySelector('.mw-dir-row__status, .directory-row-state'),goal=row?.querySelector('.session-stage-row__goal'),small=row?.querySelector('.project-record-select small, .mw-dir-row__copy small');if(!row||!title||!state||!goal)throw new Error('session row missing parts');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,line:getComputedStyle(title).whiteSpace,titleRight:title.getBoundingClientRect().right,stateLeft:state.getBoundingClientRect().left,border:getComputedStyle(state).borderWidth,subtitle:small?getComputedStyle(small).display:'none',goal:goal.textContent.trim()};})()");
  // Sessions is a plugin list page now: one centred column with 44px single-line rows (spec → 第二轮 · 插件列表页).
  assert.equal(sessionRow.height, 44, "Session rows are single-line list-page rows");
  assert.equal(sessionRow.size, "13px");
  assert.equal(sessionRow.line, "nowrap");
  assert.ok(Number(sessionRow.weight) <= 500);
  assert.ok(sessionRow.titleRight <= sessionRow.stateLeft, "Long session titles must not cover the status");
  assert.equal(sessionRow.border, "0px", "Session status uses the Goal label, not a second enclosing box");
  assert.equal(sessionRow.subtitle, "none");
  assert.ok(sessionRow.goal.length > 0, "Session rows show the current Goal");
  assert.ok(await evaluate(`(() => {
    const fold = document.querySelector('[data-session-runtime-fold]');
    const caret = fold?.querySelector(':scope > summary .goal-collection-caret');
    const title = fold?.querySelector('[data-operation-row=session] .session-stage-row__title strong');
    const goals = [...(fold?.querySelectorAll('.session-stage-row__goal') ?? [])].map((node) => Math.round(node.getBoundingClientRect().left));
    const states = [...(fold?.querySelectorAll('.mw-dir-row__status, .directory-row-state') ?? [])].map((node) => Math.round(node.getBoundingClientRect().left));
    if (!caret || !title) return false;
    return Math.abs((title.getBoundingClientRect().left - caret.getBoundingClientRect().left) - 16) <= 2
      && new Set(goals).size === 1
      && new Set(states).size === 1;
  })()`), "Session rows sit one indent step under the runtime caret");
  // Sessions is a list page (spec → 第二轮 · 插件列表页): New Session and the filter sit in the page header, with the
  // title on the left and the actions on the right, instead of at the stage's top-left corner.
  assert.ok(await evaluate("(()=>{const add=document.querySelector('[data-session-stage-chrome] [data-open-session-add]'),filter=document.querySelector('[data-session-stage-chrome] .project-record-filter-menu'),list=document.querySelector('[data-session-stage-list]'),shell=document.querySelector('[data-session-stage-shell]');if(!add||!filter||!list||!shell)return false;const a=add.getBoundingClientRect(),f=filter.getBoundingClientRect(),s=shell.getBoundingClientRect();return a.top-s.top<96 && a.right<=s.right && f.left>=a.right && !document.querySelector('[data-operation-search]') && document.querySelector('[data-session-stage-workspace]')?.hidden===true;})()"), "New Session and filter sit on the stage list; detail stays closed");
  await capture("directory-sessions-list");
  await click('[data-session-stage-chrome] .project-record-filter-menu > summary');
  await waitFor("document.querySelector('[data-session-stage-chrome] .project-record-filter-menu')?.open===true");
  assert.ok(await evaluate("(()=>{let p=document.querySelector('[data-session-stage-chrome] .project-record-filter-menu > div').getBoundingClientRect(),r=document.querySelector('[data-work-surface=sessions]').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.bottom<=innerHeight;})()"));
  await capture("directory-sessions-filter");
  await evaluate("(()=>{let s=document.querySelector('[data-session-runtime-filter]');s.value='codex';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor("document.querySelectorAll('[data-operation-row=session]:not([hidden])').length===1");
  assert.equal(await evaluate("document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true'"), false, "Filtering a closed list does not open detail");
  await key("Escape", 27);
  assert.equal(await evaluate("document.querySelector('[data-session-stage-chrome] .project-record-filter-menu').open"), false);
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.body.dataset.desktopSurface === 'sessions' && document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true' && document.querySelector('[data-work-surface=sessions] [data-operation-detail]:not([hidden])')");
  const sessionBack = await evaluate<{ ok: boolean; dump: string }>(`(() => {
    const back = document.querySelector('[data-session-stage-workspace] [data-operation-detail]:not([hidden]) .session-stage-back');
    const workspace = document.querySelector('[data-session-stage-workspace]');
    if (!workspace || !back) return { ok: false, dump: 'missing' };
    const inset = back.getBoundingClientRect().left - workspace.getBoundingClientRect().left;
    return { ok: inset >= 2 && inset <= 6, dump: JSON.stringify({ inset: Math.round(inset * 10) / 10 }) };
  })()`);
  assert.ok(sessionBack.ok, "Session back uses the Goal toolbar inset " + sessionBack.dump);
  const split = await evaluate<{ list: number; listRight: number; chromeRight: number; treeWidth: number; detail: boolean; goalDisplay: string }>("(()=>{const list=document.querySelector('[data-session-stage-list]').getBoundingClientRect(),chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),goal=document.querySelector('.session-stage-row__goal'),treeWidth=parseFloat(getComputedStyle(document.querySelector('[data-workspace]')).getPropertyValue('--tree-width'))||240;return {list:Math.round(list.width),listRight:list.right,chromeRight:chrome.right,treeWidth,detail:!document.querySelector('[data-session-stage-workspace]')?.hidden,goalDisplay:goal?getComputedStyle(goal).display:'none'};})()");
  assert.ok(Math.abs(split.list - split.treeWidth) < 3, "Session split list matches the directory column width " + JSON.stringify(split));
  assert.equal(split.detail, true);
  assert.equal(split.goalDisplay, "none");
  await click("[data-operation-detail]:not([hidden]) [data-session-collapse]");
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded !== 'true' && document.querySelector('[data-session-stage-workspace]')?.hidden === true");
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true'");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme='dark'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-operation-row=session] strong')).color"), await evaluate("(()=>{const n=document.createElement('span');n.style.color='var(--ink)';document.body.append(n);const c=getComputedStyle(n).color;n.remove();return c;})()"));
  await capture("directory-sessions-dark");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.titlebar-chrome [data-directory-toggle]')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-directory-show]')).display"), "none");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')"), false);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "shelf");
  await reloadPage();
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')"), false);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "shelf");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=shelf]')"), null);
  const coreTitle = store.snapshot(projectId!).goals.find((goal) => goal.goal_id === "CORE")!.title;
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open === true");
  await evaluate("(()=>{const input=document.querySelector('[data-global-search]');input.focus();input.value=" + JSON.stringify(coreTitle) + ";input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("Boolean(document.querySelector('[data-global-search-id=\"CORE\"]'))");
  await click("[data-global-search-id=\"CORE\"]");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=goals]')"), null);
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-session-stage-list]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await viewport(1024, 800);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-1024");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await viewport(700, 800);
  await viewport(390, 844);
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-shelf-stage-shell]')");
  // Round 4 phone bar: menu, the Assistant with its plugin switcher, and the project, at the foot of the page.
  assert.ok(await evaluate("(()=>{const bar=document.querySelector('.workbench-bar').getBoundingClientRect();return bar.height>0 && bar.bottom<=innerHeight+1 && bar.width<=innerWidth+1 && document.querySelector('[data-plugin-picker-toggle]').getClientRects().length>0;})()"), "On a phone the bottom bar stays in view with its plugin switcher");
  assert.equal(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-mobile");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-session-stage-list]')");
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true' && getComputedStyle(document.querySelector('[data-session-stage-list]')).display === 'none'");
  await click("[data-operation-detail]:not([hidden]) [data-session-collapse]");
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded !== 'true'");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal=\"long-child\"]')?.getClientRects().length > 0");
  await click('[data-select-goal="long-child"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.deepEqual(store.snapshot(projectId!).goals, before.goals);
  assert.deepEqual(store.snapshot(projectId!).runs, before.runs);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});

test("底栏：Assistant 常驻居中，回答在上方先写问题；插件从输入框前切换；Shelf 与灵光在右侧；Dock 放不下就收进 +N", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]') && document.querySelector('[data-dock-pins] [data-dock-pin=home]')");
  // The Assistant sits in the middle of the bar; nothing in the bar overlaps anything else.
  assert.ok(await evaluate(`(()=>{
    const bar=document.querySelector('[data-dock]').getBoundingClientRect();
    const composer=document.querySelector('[data-assistant-composer]').getBoundingClientRect();
    const start=document.querySelector('.bar-start').getBoundingClientRect();
    const residents=document.querySelector('.bar-residents').getBoundingClientRect();
    const project=document.querySelector('.bar-end .navigator-project-selector').getBoundingClientRect();
    return Math.abs((composer.left+composer.right)/2-(bar.left+bar.right)/2)<2
      && start.right<=composer.left && composer.right<=residents.left && residents.right<=project.left
      && project.right<=innerWidth && project.bottom<=innerHeight && project.width>=39;
  })()`), "the bar reads Dock · Assistant · Shelf/灵光 · project, left to right, none covering another");
  // At rest the bar is the input: no chip for a new work, no chooser nobody changed; “+” only adds (files, references,
  // capabilities) — who carries a new work and where it lives are chosen in its tab.
  assert.ok(await evaluate(`(()=>{const hidden=(sel)=>!document.querySelector(sel)?.getClientRects().length;
    return hidden('[data-assistant-target-wrap]') && hidden('[data-assistant-executor]') && hidden('[data-assistant-character]');})()`), "a new work shows no work chip and no default chooser");
  await click("[data-assistant-attach]");
  await waitFor("!document.querySelector('[data-assistant-more]').hidden && /添加文件/.test(document.querySelector('[data-assistant-more]').textContent)");
  assert.ok(await evaluate("(()=>{const t=document.querySelector('[data-assistant-more]').textContent;return /引用项目里的内容/.test(t) && /用一个能力或方法/.test(t) && !/由谁来做|新工作放在/.test(t);})()"), "“+” adds things; it holds no choices about the work");
  assert.ok(await evaluate("!document.querySelector('[data-assistant-composer] [data-plugin-picker], [data-assistant-composer] [data-global-search-open]')"), "the composer holds neither the switcher nor search"); 
  await evaluate("document.querySelector('[data-assistant-more] button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor("document.querySelector('[data-assistant-more]').hidden");
  // However many chips stand beside it, the input keeps room to type: a long work, its materials, what needs a look.
  const crowd = `(()=>{
    for (const [chip, count] of [['[data-assistant-attention]', '23'], ['[data-assistant-materials]', '1']]) { const button = document.querySelector(chip); button.hidden = false; button.querySelector('span').textContent = count; }
    for (const chooser of document.querySelectorAll('[data-assistant-executor], [data-assistant-character]')) chooser.hidden = false;
    document.querySelector('[data-assistant-target-label]').textContent = '继续：给我一个按钮，在待办里记下准备复盘会的数据看板';
  })()`;
  await evaluate(crowd);
  // The choosers give way first (they shrink to an ellipsis, or fold when even that is not enough); the input never does.
  await waitFor("document.querySelector('[data-assistant-input]').getBoundingClientRect().width >= 120");
  assert.ok(await evaluate("document.querySelector('[data-assistant-composer]').scrollWidth <= document.querySelector('[data-assistant-composer]').clientWidth + 1"), "nothing runs out of the composer");
  // A narrower window, where the bar's middle is well under 600px, keeps the same room.
  const roomy = (floor: number) => `(()=>{const f=document.querySelector('[data-assistant-composer]'),end=document.querySelector('.bar-end').getBoundingClientRect();
    return f.querySelector('[data-assistant-input]').getBoundingClientRect().width >= ${floor} && f.scrollWidth <= f.clientWidth + 1 && f.getBoundingClientRect().right <= end.left;})()`;
  await command("Emulation.setDeviceMetricsOverride", { width: 900, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`document.querySelector('.bar-center').getBoundingClientRect().width < 560 && ${roomy(120)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`(()=>{const input=document.querySelector('[data-assistant-input]');input.value='hello';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click("[data-assistant-send]");
  // No model configured: the work is kept with what was typed, and the panel says what to do next.
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden && /模型/.test(document.querySelector('[data-assistant-thread] .assistant-problem')?.textContent || '')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-thread] .assistant-problem a')?.getAttribute('href')"), "/settings/models", "the next step is one click away");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]')?.value"), "hello", "a failed question stays in the input");
  assert.match(await evaluate("document.querySelector('[data-assistant-work-title]')?.textContent"), /hello/, "the work exists, named after what was asked");
  assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-assistant-panel]').getBoundingClientRect(),c=document.querySelector('[data-assistant-composer]').getBoundingClientRect();return p.bottom<=c.top && p.top>=0;})()`), "the panel opens above the input, inside the window");
  // The work is a tab; a wide window shows its side pane beside the conversation, which stays right above the input.
  assert.match(await evaluate("document.querySelector('.assistant-tab[data-current]')?.textContent || ''"), /hello/, "the new work is the current tab");
  assert.ok(await evaluate(`(()=>{const s=document.querySelector('[data-assistant-side]').getBoundingClientRect(),m=document.querySelector('.assistant-main').getBoundingClientRect(),c=document.querySelector('[data-assistant-composer]').getBoundingClientRect(),p=document.querySelector('[data-assistant-panel]').getBoundingClientRect();
    return s.width>0 && s.right<=m.left+1 && m.left<=c.left && m.right>=c.right && p.left>=0;})()`), "side pane on the left, the conversation over the input, all inside the window");
  assert.match(await evaluate("document.querySelector('[data-assistant-meta]')?.textContent || ''"), /属于/, "the side pane says where the work belongs");
  assert.ok(await evaluate("!document.querySelector('[data-assistant-target-wrap]').getClientRects().length"), "with the panel open its tab, not a chip, says where the next message goes");
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home", "asking leaves the work area where it was");
  // With the panel open the choosers come back; the input still keeps a place, and nothing runs under the bar's end.
  await command("Emulation.setDeviceMetricsOverride", { width: 900, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(crowd);
  await waitFor(`document.querySelector('[data-assistant-character]').getClientRects().length > 0 && ${roomy(64)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // Switching goes through the list at the bar's left; its label follows.
  await click('[data-plugin-picker-popover] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-plugin-picker-popover]').hidden && /Goals/.test(document.querySelector('[data-plugin-picker-current]').textContent)");
  assert.equal(await evaluate("document.querySelector('[data-dock-pin=goals]').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), false, "working elsewhere leaves the answer open");
  await click("[data-assistant-panel-close]");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  await click('[data-bar-resident="lingguang"]');
  await waitFor("document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-bar-resident=lingguang]').getAttribute('aria-current') === 'page'");
  // Choosing many plugins for the Dock (at the foot of the switcher's list) folds what does not fit instead of running
  // under the Assistant; ticking them keeps the list open.
  await click('[data-dock-choice="schedule"]');
  for (const id of ["workflows", "pages", "form", "dataset", "ppt", "images", "artifacts", "cognia", "coding"]) {
    await evaluate(`document.querySelector('[data-dock-choice="${id}"]')?.click()`);
  }
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelector('[data-plugin-picker-popover]').hidden"), false, "ticking plugins keeps the list open");
  // Ticking that many plugins refits the Dock (a ResizeObserver, a frame or more later); a press that lands while the bar
  // still moves releases somewhere else and is no click. Wait until the switcher stays put, then close it.
  await waitFor(`(() => { const node = document.querySelector('[data-plugin-picker-toggle]'), rect = node.getBoundingClientRect(), at = rect.x + ',' + rect.y + ',' + rect.width;
    const same = window.__pickerToggle === node && window.__pickerToggleAt === at; window.__pickerToggle = node; window.__pickerToggleAt = at;
    window.__pickerToggleStill = same ? (window.__pickerToggleStill || 0) + 1 : 0; return window.__pickerToggleStill >= 3; })()`);
  await click("[data-plugin-picker-toggle]");
  await waitFor("document.querySelector('[data-plugin-picker-popover]').hidden");
  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 760, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("!document.querySelector('[data-dock-more]')?.hidden && document.querySelector('[data-dock-more]')?.isConnected");
  assert.ok(await evaluate(`(()=>{const start=document.querySelector('.bar-start').getBoundingClientRect(),composer=document.querySelector('[data-assistant-composer]').getBoundingClientRect();return start.right<=composer.left;})()`), "the Dock ends before the Assistant starts");
  await click("[data-dock-more]");
  await waitFor("!document.querySelector('[data-dock-overflow]').hidden && document.querySelectorAll('[data-dock-overflow] [data-dock-pin]').length > 0");
  const folded = await evaluate<string>("document.querySelector('[data-dock-overflow] [data-dock-pin]').dataset.dockPin");
  await click(`[data-dock-overflow] [data-dock-pin="${folded}"]`);
  await waitFor(`document.querySelector('[data-dock-overflow]').hidden && document.querySelector('[data-plugin-picker-popover] [data-plugin-id="${folded}"]')?.getAttribute('aria-current') === 'page'`);
});
