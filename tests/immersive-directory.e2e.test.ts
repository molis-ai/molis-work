import { addProjectPlugin, createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication, boardSnapshot } from "./fixtures/goal-application.js";

test("Immersive directories resize and retain compact, operable Goal and Feed lists", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, store, projectId, homeDirectory } = browser;
  const todo = await pluginFrameBrowser(t, browser, "todo");
  const feedView = await pluginFrameBrowser(t, browser, "feed");
  for (const plugin_id of ["feed"] as const) await addProjectPlugin(browser.web, projectId!, plugin_id);
  const other = await createProject(browser.web, "另一项目");
  await addProjectPlugin(browser.web, other.project_id, "goals");

  new GoalProjectApplication(store).goalEvents.createIntent({ project_id: projectId!, goal_id: "long-child", parent_goal_id: "CORE", actor_id: "directory-test", actor_kind: "user", title: "迁移 Execution Claim / Run 生命周期并保留现有 Runtime 与 Goal 的完整关联", outcome: "验证多层目录中的长标题不会挤压状态标记。", idempotency_key: "long-child" });
  const before = boardSnapshot(store, projectId!);
  const page = origin + "/projects/" + projectId + "/?desktop=1";
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__uiErrors=[];addEventListener('error',e=>window.__uiErrors.push(e.message));" }, sessionId);
  browser.setFrameInitScript("window.__uiErrors=[];addEventListener('error',e=>window.__uiErrors.push(e.message));");
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
  // covers the current shell. This test keeps to the Goal and Feed lists themselves.
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  // The strip holds the kept plugins, ＋ and the project since the work line took the foot (specs/work-line §6.5): 44px.
  assert.equal(await evaluate("Math.round(document.querySelector('.immersive-titlebar').getBoundingClientRect().height)"), 44, "the titlebar strip is one 44px row");
  assert.equal(await evaluate("document.querySelector('[data-directory-list-title]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-list-region]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-goal-stage-chrome] [data-open-create]') && document.querySelector('[data-goal-stage-list] [data-tree-root]')");
  const addLayout = await evaluate<{ ok: boolean; dump: string }>(`(()=>{
    const tabs=[...document.querySelectorAll('[data-titlebar-tabs] .tab-item')].filter((tab)=>tab.getClientRects().length);
    // Goals' own page is a tab like any other (specs/screen-polish §3 方案 C): ＋ follows the last tab, or the first place with none.
    const titlebar=document.querySelector('.immersive-titlebar'), last=tabs.at(-1)??titlebar?.querySelector('[data-dock-pins]'), add=titlebar?.querySelector('[data-plugin-picker-toggle]'), split=titlebar?.querySelector(':scope > .titlebar-layout [data-layout-open]'), strip=titlebar?.querySelector('[data-side-tabs]'), project=titlebar?.querySelector('.titlebar-end .navigator-project-selector');
    if(!last||!add||!split||!titlebar||!project) return {ok:false, dump:'missing'};
    const l=last.getBoundingClientRect(), a=add.getBoundingClientRect(), s=split.getBoundingClientRect(), t=titlebar.getBoundingClientRect(), p=project.getBoundingClientRect();
    const g=strip?.checkVisibility() ? strip.getBoundingClientRect() : null;
    return {
      // The strip since the work line took the foot (specs/work-line §6.5): the tabs, then ＋ (the start page; the tab strip has no
      // ＋ of its own), … the right side's glyph strip and the layout button at the right end; from 960px the project's mark is not
      // shown (POLISH-05 as rewritten, POLISH-71). 07-1 S4b: no Home tools in the titlebar (they are the person's own, on the start
      // page and in the strip's own tray).
      ok: Math.abs((a.top+a.bottom)/2-(s.top+s.bottom)/2)<4 && a.left>=l.right-1 && !project.checkVisibility() && Math.abs(t.right-s.right)<24
        && !titlebar.querySelector('[data-home-plugin-open]') && !titlebar.querySelector('[data-titlebar-tabs] .tab-add-button')?.getClientRects().length
        && (g ? g.left>=a.right && s.left>=g.right-1 : s.left>=a.right),
      dump: JSON.stringify({lastRight:Math.round(l.right), addLeft:Math.round(a.left), addRight:Math.round(a.right), splitLeft:Math.round(s.left), splitRight:Math.round(s.right), projectLeft:Math.round(p.left), projectRight:Math.round(p.right), titlebarRight:Math.round(t.right), stripLeft:g&&Math.round(g.left), stripRight:g&&Math.round(g.right)})
    };
  })()`);
  assert.ok(addLayout.ok, "ISSUE-30, PFG-22, WLN-16: ＋ follows the tabs; no Home tools in the titlebar; the right side's glyph strip (when shown), then the layout button at the titlebar's right end with no project after it, without overlap " + addLayout.dump);
  assert.ok(await evaluate("(()=>{const create=document.querySelector('[data-goal-stage-chrome] [data-open-create]'),filter=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]'),board=document.querySelector('[data-goal-stage-chrome] [data-board-switch]'),shell=document.querySelector('[data-goal-canvas-shell]');if(!create||!filter||!board||!shell)return false;const c=create.getBoundingClientRect(),f=filter.getBoundingClientRect(),b=board.getBoundingClientRect(),s=shell.getBoundingClientRect();return c.left-s.left<40 && f.left-s.left<200 && b.left>=f.right && b.left-f.right<16 && Math.abs(b.top-f.top)<8 && s.right-b.right>80 && Math.abs(c.top-s.top)<28 && Math.abs(f.top-s.top)<28;})()"), "New Goal, filter, and icon view switch sit together in the stage top-left");
  assert.ok(await evaluate("(()=>{const search=document.querySelector('[data-workspace-chrome] [data-global-search-open]'),settings=document.querySelector('.titlebar-chrome .navigator-project-settings'),toggle=document.querySelector('.titlebar-chrome [data-directory-toggle]');return search.closest('.navigator-project-primary') && settings?.closest('.navigator-project-menu-popover') && getComputedStyle(toggle).display==='none';})()"), "Project settings live in the project menu; desktop hides directory collapse even on plugins without a directory");
  const create = await evaluate<{ bg: string; color: string; radius: string; icon: string; border: string }>("(()=>{const button=document.querySelector('[data-open-create]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,border:s.borderTopColor};})()");
  // New Goal is the Goals page's one ink-blue button, like every list page's first create action
  // (DESIGN.md → Plugin stage; specs/archive/plugin-e2e-review/spec.md §4 X5, kept by the user after #108):
  // ink-blue --action fill (#2d4f6c), --action-ink text and glyph, 10px control corners, no outline.
  // Values follow #1741: it made --action ink blue (DESIGN.md "Ink blue `--action`", the Primary button entry) and
  // made the default skin 柔雾, whose controls are 10px; the earlier graphite #292a2c and 8px no longer apply.
  assert.equal(create.bg, "rgb(45, 79, 108)", "New Goal is the ink-blue primary action");
  assert.equal(create.color, "rgb(255, 255, 255)");
  assert.equal(create.icon, create.color);
  assert.equal(create.radius, "10px");
  assert.equal(create.border, "rgba(0, 0, 0, 0)", "New Goal has no outline");
  const filter = await evaluate<{ bg: string; color: string; radius: string; icon: string; height: number; width: number; border: string }>("(()=>{const button=document.querySelector('[data-tree-filter-trigger]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,height:Math.round(button.getBoundingClientRect().height),width:Math.round(button.getBoundingClientRect().width),border:s.borderTopColor};})()");
  // The filter stays a quiet toolbar control: the ink-4% wash, ink text and glyph, same corners, no outline.
  assert.equal(filter.bg, "color(srgb 0.121569 0.168627 0.215686 / 0.04)", "Filter keeps the quiet control wash");
  assert.equal(filter.color, "rgb(31, 43, 55)");
  assert.equal(filter.icon, "rgb(31, 43, 55)");
  assert.equal(filter.radius, create.radius);
  assert.equal(filter.border, create.border);
  // Standard density controls are 32px tall (DESIGN.md → Density); compact keeps 28px. With room, the filter is named
  // (「状态」) instead of being a bare icon (plugin-e2e-review §5.1), so it is wider than a square icon button.
  assert.equal(filter.height, 32);
  assert.ok(filter.width > 32, "the status filter shows its name on a wide stage");
  // The trigger is a grid, so its label is blockified: check that it renders with width and says 状态, not its display keyword.
  assert.ok(await evaluate("(()=>{const label=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger] > span');return Boolean(label) && getComputedStyle(label).display!=='none' && label.getBoundingClientRect().width>0 && label.textContent.trim()==='状态';})()"), "the status filter label is visible on a wide stage");
  assert.ok(await evaluate("(()=>{const shell=document.querySelector('[data-goal-canvas-shell]'),list=document.querySelector('[data-goal-stage-list]'),chrome=document.querySelector('[data-goal-stage-chrome]');if(!shell||!list||!chrome)return false;const c=chrome.getBoundingClientRect(),l=list.getBoundingClientRect();return l.top>=c.bottom && getComputedStyle(shell).backgroundColor===getComputedStyle(list).backgroundColor && getComputedStyle(chrome).backgroundColor==='rgba(0, 0, 0, 0)';})()"), "List paper fills the stage top (the shell's paper above the list is the same); chrome has no toolbar strip, and the list scrolls below it, not under it");
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
      const title = item.querySelector(':scope > .tree-row :is(.tree-title-line strong, .tree-presentation-name .mw-presentation__tag strong)');
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
  await click('[data-plugin-strip] [data-plugin-id="todo"]');
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await todo.waitFor("document.querySelector('[data-todo-stage-shell]')");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=todo]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=todo]')"), null);
  await viewport(1280);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + other.project_id + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="todo"]');
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await todo.waitFor("document.querySelector('[data-todo-stage-shell]')");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && Boolean(document.querySelector('[data-graph-node][data-goal-id=long-child] [data-graph-open]'))");
  await click("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  await click('[data-graph-node][data-goal-id="long-child"] [data-graph-open]');
  await waitFor("document.querySelector('[data-goal-node-workspace]').dataset.expandedGoal==='long-child'");
  await click('[data-goal-collapse]');
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-work-surface=feed]:not([hidden])') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await feedView.waitFor("document.querySelector('[data-feed-stage-directory]') && document.querySelector('[data-feed-list]')");
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane [data-feed-list]')"), null);
  assert.equal(await feedView.evaluate("document.querySelector('[data-feed-views]')"), null);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory"), "root");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=feed]')"), null);
  // Soft Workbench: adding a source sits in the Feed column heading; the empty list says what to do next.
  assert.ok(await feedView.evaluate("document.querySelector('[data-feed-source-header] [data-feed-add-toggle]')?.getBoundingClientRect().width > 0"));
  assert.ok(await feedView.evaluate("document.querySelector('[data-feed-empty]:not([hidden])')"), "Feed shows a page empty state");
  await capture("directory-feed-empty");

  const feed = createLocalFeedApplication(store.db);
  const now = new Date().toISOString();
  const source = feed.sources.upsert({ project_id: projectId!, source_id: "directory-rss", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "产品观察", description: "目录验证", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "first", title: "从首次使用观察中找到下一步值得改进的地方", summary: "完整保留消息来源和正文，再决定如何推进。", body: "这条消息用于验证在真实目录中打开和阅读内容。", occurredAt: now, attention: false });
  feed.ingestItem({ source, externalId: "second", title: "终端与目标信息应当如何配合", summary: "切换工作时保留上下文，让记录留在正确的目标里。", body: "第二条目录内容。", occurredAt: now, attention: false });
  await reloadPage();
  await feedView.waitFor("document.querySelectorAll('[data-feed-entry-task=\"directory-rss\"]').length===2");
  // The rows exist in the server-rendered document before the Feed client connects; measure and operate them only after.
  await feedView.clientReady();
  const feedRow = await feedView.evaluate<{ height: number; size: string; weight: string; titleWidth: number; columns: string; status: boolean; chevron: boolean }>("(()=>{const row=document.querySelector('[data-feed-entry-id]'),title=row.querySelector('strong');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,titleWidth:Math.round(title.getBoundingClientRect().width),columns:getComputedStyle(row).gridTemplateColumns,status:Boolean(row.querySelector('.feed-entry-status')),chevron:Boolean(row.querySelector('.feed-entry-chevron'))};})()");
  // Soft Workbench prototype: a Feed row is a reading card (source line, title, one-line summary), not a single line.
  assert.ok(feedRow.height >= 72 && feedRow.height <= 130, "Feed rows are compact reading cards: " + feedRow.height);
  assert.equal(feedRow.size, "13px"); // on the fixed type scale (spec → 第三轮 · 字号)
  assert.ok(Number(feedRow.weight) <= 500);
  assert.ok(feedRow.titleWidth > 120, "Feed item titles use the row, not a leftover icon column");
  assert.doesNotMatch(feedRow.columns, /^(22px|24px|16px)/);
  assert.equal(feedRow.status, true, "Closed Feed rows use the Goal status mark");
  assert.equal(feedRow.chevron, false, "Closed Feed rows do not spend a column on a chevron");
  await capture("directory-feed-list");
  await feedView.evaluate("document.querySelector('[data-feed-filter-trigger]')?.click()");
  await feedView.waitFor("document.querySelector('[data-feed-filter-panel]')?.hidden===false");
  await feedView.evaluate("(()=>{const status=document.querySelector('[data-feed-status-filter]');if(!status)return;status.value='archived';status.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-feed-filter-option=\"status\"][data-feed-filter-value=\"archived\"]')?.click();})()");
  await feedView.waitFor("document.querySelector('[data-feed-empty]')?.hidden===false");
  assert.ok(await feedView.evaluate("document.querySelector('[data-feed-clear-filters]').getClientRects().length>0"));
  await feedView.evaluate("document.querySelector('[data-feed-filter-trigger]')?.click()");
  await feedView.waitFor("document.querySelector('[data-feed-filter-panel]')?.hidden===true");
  await feedView.click('[data-feed-clear-filters]');
  await feedView.click('[data-feed-filter-trigger]');
  await feedView.waitFor("document.querySelector('[data-feed-filter-panel]')?.hidden===false");
  assert.ok(await feedView.evaluate("(()=>{let p=document.querySelector('[data-feed-filter-panel]').getBoundingClientRect(),r=document.querySelector('[data-work-surface=feed]').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.bottom<=innerHeight;})()"));
  await capture("directory-feed-filter");
  await feedView.click('[data-feed-filter-trigger]');
  await feedView.waitFor("document.querySelector('[data-feed-filter-panel]')?.hidden===true");
  await feedView.click('[data-feed-entry-id][data-feed-item-id="' + item.item.item_id + '"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed'");
  await feedView.waitFor("document.querySelector('[data-feed-stage-shell]')?.dataset.expanded === 'true' && Boolean(document.querySelector('[data-feed-entry-detail=\"" + item.item.item_id + "\"]:not([hidden])')) && (document.querySelector('[data-work-surface=feed]')?.textContent || '').includes('从首次使用观察中找到下一步值得改进的地方')");
  const feedBack = await feedView.evaluate<{ ok: boolean; dump: string }>(`(() => {
    const back = document.querySelector('[data-work-surface=feed] [data-feed-entry-detail]:not([hidden]) .plugin-stage-back');
    const workspace = back?.closest('.plugin-stage-workspace');
    if (!workspace || !back) return { ok: false, dump: 'missing' };
    const inset = back.getBoundingClientRect().left - workspace.getBoundingClientRect().left;
    return { ok: inset >= 10 && inset <= 18, dump: JSON.stringify({ inset: Math.round(inset * 10) / 10 }) };
  })()`);
  assert.ok(feedBack.ok, "Feed close sits in the reading bar's inset " + feedBack.dump);
  assert.deepEqual(await feedView.evaluate("window.__uiErrors"), []);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme='dark'");
  await click('[data-plugin-strip] [data-plugin-id="todo"]');
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await todo.waitFor("document.querySelector('[data-todo-stage-shell]')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.titlebar-chrome [data-directory-toggle]')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-directory-show]')).display"), "none");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')"), false);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "todo");
  await reloadPage();
  await waitFor("document.body.dataset.desktopSurface === 'todo' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await todo.waitFor("document.querySelector('[data-todo-stage-shell]')");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')"), false);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "todo");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=todo]')"), null);
  const coreTitle = boardSnapshot(store, projectId!).goals.find((goal) => goal.goal_id === "CORE")!.title;
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open === true");
  await evaluate("(()=>{const input=document.querySelector('[data-global-search]');input.focus();input.value=" + JSON.stringify(coreTitle) + ";input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await waitFor("Boolean(document.querySelector('[data-global-search-id=\"CORE\"]'))");
  await click("[data-global-search-id=\"CORE\"]");
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=goals]')"), null);
  await viewport(1024, 800);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-1024");
  await click('[data-plugin-strip] [data-plugin-id="todo"]');
  await todo.waitFor("document.querySelector('[data-todo-stage-shell]')");
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await viewport(700, 800);
  await viewport(390, 844);
  await click('[data-plugin-strip] [data-plugin-id="todo"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  // Round 4 phone bar: menu, the Assistant with its plugin switcher, and the project, at the foot of the page.
  assert.ok(await evaluate("(()=>{const bar=document.querySelector('.workbench-bar').getBoundingClientRect();return bar.height>0 && bar.bottom<=innerHeight+1 && bar.width<=innerWidth+1 && document.querySelector('[data-plugin-picker-toggle]').getClientRects().length>0;})()"), "On a phone the bottom bar stays in view with its plugin switcher");
  assert.equal(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-mobile");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal=\"long-child\"]')?.getClientRects().length > 0");
  await click('[data-select-goal="long-child"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.deepEqual(boardSnapshot(store, projectId!).goals, before.goals);
  assert.deepEqual(boardSnapshot(store, projectId!).runs, before.runs);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});

test("顶条与事项线：输入框常驻在线上，回答在上方先写问题；插件在顶条切换；顶条只留项目首页", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-work-bar] [data-assistant-composer] .mw-composer__input') && document.querySelector('[data-dock-pins] [data-top-corner-toggle]')");
  // The strip reads the first place · the tabs · ＋ · the side's switch · the layout button, and nothing after it from 960px (specs/screen-polish
  // §3 方案 C, §4「底栏第十三版」, POLISH-05 as rewritten, POLISH-71); a strip with no tab in it is not drawn, so ＋ follows the first place.
  // The foot is three blocks: the account bar, the Assistant's input in the window's centre, the card stack (第 2、5 条).
  assert.deepEqual(await evaluate(`(()=>{
    const box=(selector)=>document.querySelector(selector).getBoundingClientRect();
    const strip='.workbench-header[data-dock] ';
    const pins=box(strip+'[data-dock-pins]'), tabs=document.querySelector(strip+'[data-titlebar-tabs]'), picker=box(strip+'.plugin-picker');
    const side=box(strip+'[data-side-toggle]'), layout=box(strip+'[data-layout-open]'), drawn=tabs.checkVisibility() ? tabs.getBoundingClientRect() : null;
    const account=box('[data-work-line] .bar-account'), slot=box('[data-work-line] .work-line-slot'), composer=box('[data-work-line] .work-line-slot [data-assistant-composer]'), stack=box('[data-work-line] [data-work-stack]');
    return { strip: (drawn ? pins.right<=drawn.left && drawn.right<=picker.left+4 : pins.right<=picker.left+4) && picker.right<=side.left && side.right<=layout.left && innerWidth-layout.right<24,
      own: document.querySelector(strip+'[data-bar-own]')!==null,
      project: Boolean(document.querySelector(strip+'.titlebar-end')?.checkVisibility()),
      line: account.right<=slot.left+1 && slot.right<=stack.left+1 && composer.bottom<=innerHeight && Math.abs(slot.left+slot.width/2-innerWidth/2)<=1,
      foot: document.querySelectorAll('.workbench-bar[data-work-bar] :is([data-dock-pin],[data-top-corner],[data-plugin-picker-toggle],.navigator-project-selector)').length };
  })()`), { strip: true, own: false, project: false, line: true, foot: 0 }, "the strip reads the first place · tabs · ＋ · side switch · layout and ends there; the foot is the account bar, the centred input and the stack, with no plugin entry");
  // K3, UIV-12, B36F-04: the receiver is still the Assistant. The bar offers the task's role picker; the work's executor and scope
  // are chosen in its tab, and “+” only adds files, methods and capabilities.
  await waitFor("!!document.querySelector('[data-assistant-composer] [data-composer-control=character]')");
  assert.deepEqual(await evaluate(`(() => {
    const composer = document.querySelector('[data-assistant-composer]');
    return {
      receiver: composer.querySelector('[data-composer-receiver]')?.textContent,
      reset: Boolean(composer.querySelector('.mw-composer__to [data-tag-remove]')?.getClientRects().length),
      controls: [...composer.querySelectorAll('[data-composer-control]')].map(control => control.dataset.composerControl),
    };
  })()`), { receiver: "目录交互验证 · 助理", reset: false, controls: ["character"] },
  "a new work goes to the Assistant and exposes the role picker without another work control");
  await click("[data-assistant-composer] [data-composer-add]");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-compose-menu]').hidden && /添加文件/.test(document.querySelector('[data-assistant-composer] [data-compose-menu]').textContent)");
  assert.ok(await evaluate("(()=>{const t=document.querySelector('[data-assistant-composer] [data-compose-menu]').textContent;return /用一个技能或能力/.test(t) && !/由谁来做|新工作放在/.test(t);})()"), "“+” adds things; it holds no choices about the work");
  assert.ok(await evaluate("!document.querySelector('[data-assistant-composer] [data-plugin-picker], [data-assistant-composer] [data-global-search-open]')"), "the composer holds neither the switcher nor search");
  await evaluate("document.querySelector('[data-assistant-composer] [data-compose-menu]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor("document.querySelector('[data-assistant-composer] [data-compose-menu]').hidden");
  // However many chips stand beside it, the input keeps room to type: a long work and what needs a look (what the Send carries
  // is the strip above the line now, context-program §21.2 point 1).
  const crowd = `(()=>{
    for (const [chip, count] of [['[data-assistant-attention]', '23']]) { const button = document.querySelector(chip); button.hidden = false; button.querySelector('span').textContent = count; }
    document.querySelector('[data-assistant-composer] [data-composer-receiver]').textContent = '继续：给我一个按钮，在待办里记下准备复盘会的数据看板';
  })()`;
  await evaluate(crowd);
  // The receiver row and the controls give way (they shrink to an ellipsis, or fold behind 更多); the input never does.
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input').getBoundingClientRect().width >= 120");
  assert.ok(await evaluate("document.querySelector('[data-assistant-composer]').scrollWidth <= document.querySelector('[data-assistant-composer]').clientWidth + 1"), "nothing runs out of the composer");
  // A narrower window, where the bar's middle is well under 600px, keeps the same room. (With one button at the bar's end
  // instead of three the middle is wider, so the window that puts it under 560px is narrower than the 900px it was; and with
  // nothing of the person's own on the right, that column is only as wide as the project button, so it is 780px, not 820px —
  // 07-1 S4b.)
  const roomy = (floor: number) => `(()=>{const f=document.querySelector('[data-assistant-composer]');
    return f.querySelector('[data-assistant-composer] .mw-composer__input').getBoundingClientRect().width >= ${floor} && f.scrollWidth <= f.clientWidth + 1 && f.getBoundingClientRect().right <= innerWidth && f.getBoundingClientRect().left >= 0;})()`;
  await command("Emulation.setDeviceMetricsOverride", { width: 780, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`document.querySelector('[data-work-line] .work-line-slot').getBoundingClientRect().width < 700 && ${roomy(120)}`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`(()=>{const input=document.querySelector('[data-assistant-composer] .mw-composer__input');input.value='hello';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click("[data-assistant-composer] [data-composer-send]");
  // No model configured: the work is kept with what was typed, and the panel says what to do next.
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden && /模型/.test(document.querySelector('[data-assistant-thread] .assistant-problem')?.textContent || '')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-thread] .assistant-problem a')?.getAttribute('href')"), "/settings/models", "the next step is one click away");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input')?.value"), "hello", "a failed question stays in the input");
  // What is typed on the line goes to the main conversation (specs/work-line §4.2): it makes no new work.
  assert.match(await evaluate("document.querySelector('[data-assistant-work-title]')?.textContent"), /主对话/, "the question is in the main conversation");
  assert.ok(await evaluate(`(()=>{const p=document.querySelector('[data-assistant-panel]').getBoundingClientRect(),c=document.querySelector('[data-assistant-composer]').getBoundingClientRect();return p.bottom<=c.top && p.top>=0;})()`), "the panel opens above the input, inside the window");
  // The main conversation is the first tab; a wide window shows its side pane beside the conversation, which stays right above the input.
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.assistant-tab')].map((tab) => [tab.textContent.trim(), tab.hasAttribute('data-current')])"), [["主对话", true]], "the main conversation is the only tab, and the current one");
  assert.ok(await evaluate(`(()=>{const s=document.querySelector('[data-assistant-side]').getBoundingClientRect(),m=document.querySelector('.assistant-main').getBoundingClientRect(),c=document.querySelector('[data-assistant-composer]').getBoundingClientRect(),p=document.querySelector('[data-assistant-panel]').getBoundingClientRect();
    return s.width>0 && s.right<=m.left+1 && m.left<=c.left && m.right>=c.right && p.left>=0;})()`), "side pane on the left, the conversation over the input, all inside the window");
  assert.match(await evaluate("document.querySelector('[data-assistant-meta]')?.textContent || ''"), /属于/, "the side pane says where the work belongs");
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-composer] .mw-composer__to')?.textContent || ''"), /发给：主对话/, "with the panel open the receiver row names where the next message goes");
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home", "asking leaves the work area where it was");
  // With the panel open and the bar crowded, the input still keeps a place, and nothing runs under the bar's end.
  await command("Emulation.setDeviceMetricsOverride", { width: 900, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(crowd);
  await waitFor(roomy(64));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // Switching goes through the list at the bar's left; its label follows.
  await click('[data-plugin-picker-popover] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals' && document.querySelector('[data-plugin-picker-popover]').hidden && /Goals/.test(document.querySelector('[data-plugin-picker-current]').textContent)");
  assert.ok(await evaluate("Boolean(document.querySelector('[data-titlebar-tabs] .tab-item[data-plugin=goals][aria-current]'))"), "Goals' page is the current tab");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), false, "working elsewhere leaves the answer open");
  await click("[data-assistant-panel-close]");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  // Shelf and 灵光 are views of the side panel (side-shelf §3.1). Since specs/screen-polish §3 方案 C the side opens and closes from
  // its switch at the right end of the top strip, and the foot has no side button.
  assert.equal(await evaluate("document.querySelector('.workbench-bar [data-side-toggle]')"), null);
  assert.equal(await evaluate("document.querySelector('.workbench-header [data-side-toggle]')?.getAttribute('aria-pressed')"), "false");
  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tabs] [data-side-tab][aria-selected=true]').parentElement.getAttribute('aria-current') === 'page'");
  await click("[data-layout-open]"); await click("[data-layout-action=side]");
  await waitFor("document.body.dataset.sideOpen === 'false'");
  // The top strip keeps no plugins of its own (specs/screen-polish §3 方案 C): the start page's tiles carry no pin, and the Dock
  // is the first place alone (§4「底栏第十三版」第 1 条), so nothing folds.
  assert.equal(await evaluate("document.querySelectorAll('[data-dock-choice], [data-dock-more]').length"), 0);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-dock-pins] > *')].map((node) => node.className)"), ["top-corner"]);
  assert.equal(await evaluate("document.querySelectorAll('[data-dock-pin]').length"), 0);
  // The switcher's label is looked at again whenever the work area changes a class, so that can land while the press is down.
  // Pressing, letting one land, then releasing must still close the list: the label is rebuilt only when it changed.
  await click("[data-plugin-picker-toggle]");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  const at = await evaluate<{ x: number; y: number }>("(() => { const rect = document.querySelector('[data-plugin-picker-toggle]').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()");
  await command("Input.dispatchMouseEvent", { type: "mousePressed", ...at, button: "left", clickCount: 1 }, sessionId);
  await evaluate("(() => { const area = document.querySelector('.tab-workspace') || document.body; area.classList.add('is-nudged'); area.classList.remove('is-nudged'); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()");
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...at, button: "left", clickCount: 1 }, sessionId);
  await waitFor("document.querySelector('[data-plugin-picker-popover]').hidden");
});
