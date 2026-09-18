import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication, DEMO_BOARD_ID, GoalProjectApplication, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Immersive directories resize and retain compact, operable Goal, Feed and Session lists", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, store, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  for (const plugin_id of ["feed", "sessions"] as const) catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "directory-test" });
  const other = await catalog.createProject({ display_name: "另一项目", actor_id: "directory-test" });
  catalog.close();
  new GoalProjectApplication(store).goalEvents.createIntent({ board_id: DEMO_BOARD_ID, goal_id: "long-child", parent_goal_id: "CORE", actor_id: "directory-test", actor_kind: "user", title: "迁移 Execution Claim / Run 生命周期并保留现有 Runtime 与 Goal 的完整关联", outcome: "验证多层目录中的长标题不会挤压状态标记。", idempotency_key: "long-child" });
  const before = store.snapshot(DEMO_BOARD_ID);
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
  await waitFor("document.querySelector('.plugin-rail') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.equal(await evaluate("Math.round(document.querySelector('.immersive-titlebar').getBoundingClientRect().height)"), 32, "Titlebar is a 32px Linear-height row");
  assert.equal(await evaluate("Math.round(document.querySelector('.plugin-rail-item').getBoundingClientRect().height)"), 32, "Plugin rail icons share a 32px hit target");
  assert.ok(await evaluate("(()=>{const titlebar=document.querySelector('.immersive-titlebar').getBoundingClientRect(),chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),stage=document.querySelector('.immersive-plugin-stage').getBoundingClientRect();return Math.abs(chrome.top-titlebar.top)<2 && Math.abs(chrome.bottom-titlebar.bottom)<2 && rail.top>=titlebar.bottom-1 && Math.abs(rail.top-stage.top)<2;})()"), "On home, project chrome shares the titlebar row and the rail aligns with the stage");
  assert.equal(await evaluate("document.querySelector('[data-directory-list-title]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-list-region]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), true);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-goal-stage-chrome] [data-open-create]') && document.querySelector('[data-goal-stage-list] [data-tree-root]')");
  assert.ok(await evaluate("(()=>{const add=document.querySelector('[data-titlebar-tabs] .tab-add-button'),split=document.querySelector('[data-titlebar-tabs] .tab-split-button'),titlebar=document.querySelector('.immersive-titlebar');if(!add||!split||!titlebar)return false;const a=add.getBoundingClientRect(),s=split.getBoundingClientRect(),t=titlebar.getBoundingClientRect();return Math.abs(t.right-s.right)<20 && s.left>=a.right+8;})()"), "Layout split stays on the right of the titlebar");
  assert.ok(await evaluate("(()=>{const titlebar=document.querySelector('.immersive-titlebar').getBoundingClientRect(),chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),stage=document.querySelector('.immersive-plugin-stage').getBoundingClientRect(),back=document.querySelector('[data-workspace-history=back]').getBoundingClientRect();return Math.abs(chrome.top-titlebar.top)<2 && Math.abs(rail.top-stage.top)<2 && rail.top>=titlebar.bottom-1 && back.bottom<=titlebar.bottom+1 && back.left>=chrome.right-2 && document.querySelector('.immersive-titlebar [data-global-search-open]');})()"), "Project chrome shares the titlebar row; rail and stage share a top edge");
  const goalsChrome = await evaluate<{ right: number; expected: number; surface: string; cssWidth: string; maxWidth: string }>("(()=>{const chrome=document.querySelector('[data-workspace-chrome]'),box=chrome.getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),ws=document.querySelector('[data-workspace]'),cs=getComputedStyle(chrome),treeWidth=parseFloat(getComputedStyle(ws).getPropertyValue('--tree-width'))||240;return {right:box.right,expected:rail.width+treeWidth,surface:document.body.dataset.desktopSurface,cssWidth:cs.width,maxWidth:cs.maxWidth};})()");
  assert.equal(goalsChrome.surface, "goal");
  assert.equal(goalsChrome.maxWidth, "none");
  assert.ok(Math.abs(goalsChrome.right - goalsChrome.expected) < 3, "On Goals, project chrome right edge matches the directory column " + JSON.stringify(goalsChrome));
  assert.ok(await evaluate("(()=>{const create=document.querySelector('[data-goal-stage-chrome] [data-open-create]'),filter=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]'),board=document.querySelector('[data-goal-stage-chrome] [data-board-switch]'),shell=document.querySelector('[data-goal-canvas-shell]');if(!create||!filter||!board||!shell)return false;const c=create.getBoundingClientRect(),f=filter.getBoundingClientRect(),b=board.getBoundingClientRect(),s=shell.getBoundingClientRect();return c.left-s.left<40 && f.left-s.left<200 && b.left>=f.right && b.left-f.right<16 && Math.abs(b.top-f.top)<8 && s.right-b.right>80 && Math.abs(c.top-s.top)<28 && Math.abs(f.top-s.top)<28;})()"), "New Goal, filter, and icon view switch sit together in the stage top-left");
  assert.ok(await evaluate("(()=>{const search=document.querySelector('[data-workspace-chrome] [data-global-search-open]'),settings=document.querySelector('.titlebar-chrome .navigator-project-settings'),toggle=document.querySelector('.titlebar-chrome [data-directory-toggle]');return search.closest('.navigator-project-primary') && settings?.nextElementSibling===toggle && getComputedStyle(toggle).display==='none';})()"), "Directory toggle stays hidden while Goals has no directory");
  const create = await evaluate<{ bg: string; color: string; radius: string; icon: string; border: string }>("(()=>{const button=document.querySelector('[data-open-create]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,border:s.borderTopColor};})()");
  assert.equal(create.bg, "rgb(255, 255, 255)", "New Goal uses a white fill");
  assert.equal(create.color, "rgb(34, 35, 38)");
  assert.equal(create.icon, "rgb(34, 35, 38)");
  assert.equal(create.radius, "10px");
  assert.equal(create.border, "rgb(226, 228, 231)", "New Goal uses a gray outline");
  const filter = await evaluate<{ bg: string; color: string; radius: string; icon: string; height: number; width: number; border: string }>("(()=>{const button=document.querySelector('[data-tree-filter-trigger]'),icon=button.querySelector('svg');const s=getComputedStyle(button);return {bg:s.backgroundColor,color:s.color,radius:s.borderRadius,icon:getComputedStyle(icon).color,height:Math.round(button.getBoundingClientRect().height),width:Math.round(button.getBoundingClientRect().width),border:s.borderTopColor};})()");
  assert.equal(filter.bg, create.bg, "Filter matches New Goal fill");
  assert.equal(filter.color, create.color);
  assert.equal(filter.icon, create.icon);
  assert.equal(filter.radius, create.radius);
  assert.equal(filter.border, create.border);
  assert.equal(filter.height, 28);
  assert.equal(filter.width, 28);
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
  assert.ok(await evaluate("(()=>{const search=document.querySelector('[data-workspace-chrome] [data-global-search-open]'),footer=document.querySelector('.personal-sidebar-footer'),scroll=document.querySelector('.directory-content-scroll');return Boolean(search&&scroll)&&!document.querySelector('.desktop-goal-directory .tree-search')&&!document.querySelector('[data-plugin-section] .plugin-section-toggle')&&!document.querySelector('[data-directory-shortcuts]')&&getComputedStyle(footer).borderTopWidth==='0px'&&getComputedStyle(scroll).scrollbarWidth==='none'&&document.querySelector('[data-plugin-section=feed]')?.hidden===true;})()"));
  if (await evaluate("document.querySelector('[data-goal-canvas-shell]')?.getAttribute('data-expanded') === 'true'")) {
    await evaluate("document.querySelector('[data-goal-collapse]')?.click()");
    await waitFor("document.querySelector('[data-goal-canvas-shell]')?.getAttribute('data-expanded') !== 'true'");
  }
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
    assert.equal(row.height, 28, "Parent and child rows share a single-line height");
    assert.equal(row.line, "nowrap");
    if (!row.selected) assert.ok(Number(row.weight) <= 500);
    assert.ok(row.titleWidth > 80, "Child titles use the remaining row instead of the 4.5ch ref column, got " + row.titleWidth);
    assert.equal(row.border, "0px", "The label supplies its own boundary without a second enclosing box");
    if (row.relationsLine) assert.equal(row.relationsLine, "nowrap", "Prerequisite copy stays on one line");
    if (row.relationsHeight != null) assert.ok(row.relationsHeight <= 28, "Prerequisite control does not wrap the row");
  }
  await capture("directory-goals-light");
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-plugin-section=feed]')?.hidden === false && !document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('#goal-tree-pane').getBoundingClientRect().width > 44");
  const initial = await width();
  await evaluate("(()=>{const resizer=document.querySelector('[data-tree-resizer]');const box=resizer.getBoundingClientRect();const x=box.x+box.width/2;const y=box.y+box.height/2;const opts=(type,cx)=>({bubbles:true,cancelable:true,view:window,button:0,buttons:type.endsWith('up')?0:1,clientX:cx,clientY:y,pointerId:1,pointerType:'mouse'});resizer.dispatchEvent(new PointerEvent('pointerdown',opts('pointerdown',x)));resizer.dispatchEvent(new MouseEvent('mousedown',opts('mousedown',x)));window.dispatchEvent(new PointerEvent('pointermove',opts('pointermove',x+120)));window.dispatchEvent(new MouseEvent('mousemove',opts('mousemove',x+120)));window.dispatchEvent(new PointerEvent('pointerup',opts('pointerup',x+120)));window.dispatchEvent(new MouseEvent('mouseup',opts('mouseup',x+120)));})()");
  await expectWidth(initial + 120);
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('molis-work-ui:' + JSON.parse(document.querySelector('#molis-work-data').textContent).project.project_id + ':current')).treeWidth"), initial + 120, "Pointer release persists the final width");
  await reloadPage();
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-plugin-section=feed]')?.hidden === false");
  await expectWidth(initial + 120);
  await evaluate("document.querySelector('[data-tree-resizer]').focus()");
  await key("ArrowLeft", 37);
  await expectWidth(initial + 104);
  await click('[data-directory-toggle]');
  await viewport(1280);
  await click('[data-directory-show]');
  await expectWidth(initial + 104);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + other.project_id + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')"), true);
  assert.equal(await evaluate("Math.round(document.querySelector('.plugin-rail').getBoundingClientRect().width)"), 48);
  assert.ok(await evaluate("(()=>{const chrome=document.querySelector('[data-workspace-chrome]'),box=chrome.getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),treeWidth=parseFloat(getComputedStyle(document.querySelector('[data-workspace]')).getPropertyValue('--tree-width'))||240;return getComputedStyle(chrome).borderRightWidth==='0px' && box.width+8<rail.width+treeWidth;})()"), "Home project chrome stays content-sized");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-plugin-section=feed]')?.hidden === false");
  await expectWidth(initial + 104);
  await evaluate("document.querySelector('[data-tree-resizer]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await expectWidth(240);
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=sessions]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-session-stage-list]') && document.querySelector('[data-session-stage-chrome] [data-open-session-add]')");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=sessions]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=sessions]')"), null);
  const sessionsChromeRight = await evaluate<number>("document.querySelector('[data-workspace-chrome]').getBoundingClientRect().right");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && Boolean(document.querySelector('[data-graph-node][data-goal-id=long-child] [data-graph-open]'))");
  const goalsChromeRight = await evaluate<number>("document.querySelector('[data-workspace-chrome]').getBoundingClientRect().right");
  assert.ok(await evaluate("(()=>{const chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),treeWidth=parseFloat(getComputedStyle(document.querySelector('[data-workspace]')).getPropertyValue('--tree-width'))||240;return Math.abs(chrome.right-(rail.width+treeWidth))<3;})()"), "After Sessions, Goals chrome keeps the directory-column titlebar width");
  assert.ok(Math.abs(goalsChromeRight - sessionsChromeRight) < 3, "Goals chrome.right matches Sessions");
  await click("[data-board-view-tab=canvas]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'canvas'");
  await click('[data-graph-node][data-goal-id="long-child"] [data-graph-open]');
  await waitFor("document.querySelector('[data-goal-node-workspace]').dataset.expandedGoal==='long-child'");
  await click('[data-goal-collapse]');
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && !document.querySelector('[data-feed-empty]').hidden && Boolean(document.querySelector('[data-feed-stage-directory]'))");
  assert.equal(await evaluate("document.querySelector('[data-feed-list]')?.closest('#goal-tree-pane')"), null);
  assert.equal(await evaluate("document.querySelector('[data-feed-views]')"), null);
  assert.equal(await evaluate("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory"), "feed");
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=feed]')?.hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=feed]')?.hidden"), false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-feed-empty]')).backgroundColor"), "rgba(0, 0, 0, 0)");
  const emptyText = await evaluate<string>("document.querySelector('[data-feed-empty]').textContent");
  assert.match(emptyText, /添加任务/);
  await capture("directory-feed-empty");

  const feed = createLocalFeedApplication(store.db);
  const now = new Date().toISOString();
  const source = feed.upsertSource({ board_id: DEMO_BOARD_ID, source_id: "directory-rss", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "产品观察", description: "目录验证", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "first", title: "从首次使用观察中找到下一步值得改进的地方", summary: "完整保留消息来源和正文，再决定如何推进。", body: "这条消息用于验证在真实目录中打开和阅读内容。", occurredAt: now, attention: false });
  feed.ingestItem({ source, externalId: "second", title: "终端与目标信息应当如何配合", summary: "切换工作时保留上下文，让记录留在正确的目标里。", body: "第二条目录内容。", occurredAt: now, attention: false });
  await reloadPage();
  await waitFor("document.querySelectorAll('[data-feed-entry-id]').length===2");
  const feedRow = await evaluate<{ height: number; size: string; weight: string; titleWidth: number; columns: string; status: boolean; chevron: boolean }>("(()=>{const row=document.querySelector('[data-feed-entry-id]'),title=row.querySelector('strong');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,titleWidth:Math.round(title.getBoundingClientRect().width),columns:getComputedStyle(row).gridTemplateColumns,status:Boolean(row.querySelector('.feed-entry-status')),chevron:Boolean(row.querySelector('.feed-entry-chevron'))};})()");
  assert.equal(feedRow.height, 28, "Closed Feed rows share the Goal single-line height");
  assert.equal(feedRow.size, "13px");
  assert.ok(Number(feedRow.weight) <= 500);
  assert.ok(feedRow.titleWidth > 120, "Feed item titles use the row, not a leftover icon column");
  assert.doesNotMatch(feedRow.columns, /^(22px|24px|16px)/);
  assert.equal(feedRow.status, true, "Closed Feed rows use the Goal status mark");
  assert.equal(feedRow.chevron, false, "Closed Feed rows do not spend a column on a chevron");
  await capture("directory-feed-list");
  await evaluate("(()=>{const option=document.querySelector('[data-feed-filter-option=\"status\"][data-feed-filter-value=\"archived\"]');option?.click();})()");
  await waitFor("!document.querySelector('[data-feed-empty]').hidden");
  assert.ok(await evaluate("document.querySelector('[data-feed-clear-filters]').getClientRects().length>0"));
  await click('[data-feed-clear-filters]');
  await click('[data-feed-filter-trigger]');
  assert.ok(await evaluate("(()=>{let p=document.querySelector('[data-feed-filter-panel]').getBoundingClientRect(),r=document.querySelector('[data-work-surface=feed]').getBoundingClientRect();return p.left>=r.left&&p.right<=r.right&&p.bottom<=innerHeight;})()"));
  await capture("directory-feed-filter");
  await click('[data-feed-filter-trigger]');
  await click('[data-feed-entry-id][data-feed-item-id="' + item.item.item_id + '"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && Boolean(document.querySelector('[data-feed-item-wrap=\"" + item.item.item_id + "\"] [data-feed-item-slot]:not([hidden])')) && (document.querySelector('[data-work-surface=feed]')?.textContent || '').includes('从首次使用观察中找到下一步值得改进的地方')");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelectorAll('[data-operation-row=session]').length===2 && document.querySelector('[data-plugin-strip] [data-plugin-id=sessions]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  const sessionRow = await evaluate<{ height: number; size: string; weight: string; line: string; titleRight: number; stateLeft: number; border: string; subtitle: string; goal: string }>("(()=>{const row=document.querySelector('[data-operation-row=session]'),title=row?.querySelector('strong'),state=row?.querySelector('.mw-dir-row__status, .directory-row-state'),goal=row?.querySelector('.session-stage-row__goal'),small=row?.querySelector('.project-record-select small, .mw-dir-row__copy small');if(!row||!title||!state||!goal)throw new Error('session row missing parts');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,line:getComputedStyle(title).whiteSpace,titleRight:title.getBoundingClientRect().right,stateLeft:state.getBoundingClientRect().left,border:getComputedStyle(state).borderWidth,subtitle:small?getComputedStyle(small).display:'none',goal:goal.textContent.trim()};})()");
  assert.equal(sessionRow.height, 28, "Session rows share the Goal single-line height");
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
  assert.ok(await evaluate("(()=>{const add=document.querySelector('[data-session-stage-chrome] [data-open-session-add]'),filter=document.querySelector('[data-session-stage-chrome] .project-record-filter-menu'),list=document.querySelector('[data-session-stage-list]'),shell=document.querySelector('[data-session-stage-shell]');if(!add||!filter||!list||!shell)return false;const a=add.getBoundingClientRect(),f=filter.getBoundingClientRect(),s=shell.getBoundingClientRect();return a.left-s.left<40 && f.left>=a.right && Math.abs(a.top-s.top)<28 && !document.querySelector('[data-operation-search]') && document.querySelector('[data-session-stage-workspace]')?.hidden===true;})()"), "New Session and filter sit on the stage list; detail stays closed");
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
  const split = await evaluate<{ list: number; listRight: number; chromeRight: number; treeWidth: number; detail: boolean; goalDisplay: string }>("(()=>{const list=document.querySelector('[data-session-stage-list]').getBoundingClientRect(),chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),goal=document.querySelector('.session-stage-row__goal'),treeWidth=parseFloat(getComputedStyle(document.querySelector('[data-workspace]')).getPropertyValue('--tree-width'))||240;return {list:Math.round(list.width),listRight:list.right,chromeRight:chrome.right,treeWidth,detail:!document.querySelector('[data-session-stage-workspace]')?.hidden,goalDisplay:goal?getComputedStyle(goal).display:'none'};})()");
  assert.ok(Math.abs(split.list - split.treeWidth) < 3, "Session split list matches the directory column width " + JSON.stringify(split));
  assert.ok(Math.abs(split.listRight - split.chromeRight) < 3, "Session split line meets the titlebar chrome");
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
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && !document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await click("[data-directory-toggle]");
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')"), true);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "feed");
  await waitFor("JSON.parse(sessionStorage.getItem('molis-work-ui:' + JSON.parse(document.querySelector('#molis-work-data').textContent).project.project_id + ':current') || '{}').directoryCollapsed === true");
  await reloadPage();
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')");
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "feed");
  await click("[data-directory-show]");
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-collapsed')");
  const coreTitle = store.snapshot(DEMO_BOARD_ID).goals.find((goal) => goal.goal_id === "CORE")!.title;
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
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-plugin-section=feed]')?.hidden === false && !document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await viewport(700, 800);
  assert.ok(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length>0"));
  await expectWidth(240);
  await evaluate("document.querySelector('[data-tree-resizer]').focus()");
  await key("ArrowRight", 39);
  await expectWidth(256);
  await viewport(390, 844);
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-plugin-section=feed]')?.hidden === false");
  assert.ok(await evaluate("document.querySelector('.navigator-project').getBoundingClientRect().height===44"));
  assert.ok(await evaluate("document.querySelector('.personal-sidebar-footer').getBoundingClientRect().bottom<=innerHeight"));
  await expectWidth(216);
  assert.equal(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-mobile");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-session-stage-list]')");
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true' && getComputedStyle(document.querySelector('[data-session-stage-list]')).display === 'none'");
  await click("[data-operation-detail]:not([hidden]) [data-session-collapse]");
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded !== 'true'");
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  await click('.tab-item[data-tab-kind=mother] [role=tab]');
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal=\"long-child\"]')?.getClientRects().length > 0");
  await click('[data-select-goal="long-child"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs, before.runs);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});
