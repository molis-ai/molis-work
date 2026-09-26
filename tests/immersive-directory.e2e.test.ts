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
  assert.ok(await evaluate(`(()=>{
    const items=document.querySelector('.plugin-rail-items');
    const island=document.querySelector('.plugin-rail [data-assistant-island]');
    const footer=document.querySelector('.plugin-rail .personal-sidebar-footer');
    const market=items?.querySelector('[data-plugin-id=market]');
    const characters=items?.querySelector('[data-plugin-id=characters]');
    if(!items||!island||!footer||!market||!characters) return false;
    return Boolean(characters.compareDocumentPosition(market) & Node.DOCUMENT_POSITION_FOLLOWING)
      && items.getBoundingClientRect().bottom<=island.getBoundingClientRect().top+1
      && island.getBoundingClientRect().bottom<=footer.getBoundingClientRect().top+1
      && !footer.querySelector('[data-plugin-id=market], [data-plugin-id=characters]');
  })()`), "Tools, then 拓展 with the market, then personal tools and the account close the rail");
  assert.ok(await evaluate(`(()=>{
    const titlebar=document.querySelector('.immersive-titlebar').getBoundingClientRect();
    const island=document.querySelector('[data-assistant-island]').getBoundingClientRect();
    const chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect();
    const rail=document.querySelector('.plugin-rail').getBoundingClientRect();
    const stage=document.querySelector('.immersive-plugin-stage').getBoundingClientRect();
    return chrome.top>=titlebar.bottom-1
      && island.top>=rail.top && island.bottom<=rail.bottom+1
      && Math.abs(rail.top-chrome.bottom-8)<3
      && Math.abs(chrome.left-rail.left)<2
      && chrome.width<=rail.width+8
      && Math.abs(stage.left-rail.right)<3
      && Math.abs(stage.top-titlebar.bottom)<2
      && document.querySelector('[data-assistant-island] [data-plugin-id=lingguang]')
      && document.querySelector('[data-assistant-toggle]')
      && !document.querySelector('.plugin-rail-items [data-plugin-id=lingguang]')
      && document.querySelector('[data-workspace-chrome] [data-global-search-open]')
      && !document.querySelector('.immersive-titlebar [data-global-search-open]')
      && document.querySelector('.immersive-titlebar .workspace-history [data-navigation-labels-toggle]');
  })()`), "On home, the project opens the rail and personal tools sit above the account; the rail toggle lives in the titlebar");
  const railGaps = await evaluate<{ ok: boolean; dump: string }>(`(()=>{
    const card=document.querySelector('.workspace-chrome .navigator-project-primary');
    const items=document.querySelector('.plugin-rail-items');
    const island=document.querySelector('.plugin-rail [data-assistant-island]');
    const footer=document.querySelector('.plugin-rail .personal-sidebar-footer');
    if(!card||!items||!island||!footer) return {ok:false, dump:'missing'};
    const a=card.getBoundingClientRect(), b=items.getBoundingClientRect(), i=island.getBoundingClientRect(), c=footer.getBoundingClientRect();
    const upper=b.top-a.bottom, middle=i.top-b.bottom, lower=c.top-i.bottom;
    return {ok: [upper, middle, lower].every(gap => Math.abs(gap-8)<2), dump: JSON.stringify({upper:Math.round(upper*10)/10, middle:Math.round(middle*10)/10, lower:Math.round(lower*10)/10})};
  })()`);
  assert.ok(railGaps.ok, "Plugin rail island gaps match at 8px " + railGaps.dump);
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
  assert.ok(await evaluate("(()=>{const titlebar=document.querySelector('.immersive-titlebar').getBoundingClientRect(),island=document.querySelector('[data-assistant-island]').getBoundingClientRect(),chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),stage=document.querySelector('.immersive-plugin-stage').getBoundingClientRect(),back=document.querySelector('[data-workspace-history=back]').getBoundingClientRect(),name=document.querySelector('[data-workspace-chrome] .navigator-project-selector strong');return chrome.top>=titlebar.bottom-1 && island.top>=chrome.bottom-1 && back.bottom<=titlebar.bottom+1 && Math.abs(stage.top-titlebar.bottom)<2 && chrome.width<=rail.width+8 && (name?.getBoundingClientRect().width??0)<=1 && document.querySelector('[data-workspace-chrome] [data-global-search-open]') && !document.querySelector('.immersive-titlebar [data-global-search-open]');})()"), "Goals keeps a compact project island at the top of the rail; titlebar only has the rail toggle, history and tabs");
  const goalsChrome = await evaluate<{ right: number; railRight: number; expected: number; surface: string; cssWidth: string; maxWidth: string }>("(()=>{const chrome=document.querySelector('[data-workspace-chrome]'),box=chrome.getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),ws=document.querySelector('[data-workspace]'),cs=getComputedStyle(chrome),treeWidth=parseFloat(getComputedStyle(ws).getPropertyValue('--tree-width'))||240;return {right:box.right,railRight:rail.right,expected:rail.width,surface:document.body.dataset.desktopSurface,cssWidth:cs.width,maxWidth:cs.maxWidth};})()");
  assert.equal(goalsChrome.surface, "goal");
  assert.equal(goalsChrome.maxWidth, "none");
  assert.ok(Math.abs(goalsChrome.right - goalsChrome.railRight) < 3, "On Goals, the compact island matches the plugin rail " + JSON.stringify(goalsChrome));
  assert.ok(await evaluate("(()=>{const create=document.querySelector('[data-goal-stage-chrome] [data-open-create]'),filter=document.querySelector('[data-goal-stage-chrome] [data-tree-filter-trigger]'),board=document.querySelector('[data-goal-stage-chrome] [data-board-switch]'),shell=document.querySelector('[data-goal-canvas-shell]');if(!create||!filter||!board||!shell)return false;const c=create.getBoundingClientRect(),f=filter.getBoundingClientRect(),b=board.getBoundingClientRect(),s=shell.getBoundingClientRect();return c.left-s.left<40 && f.left-s.left<200 && b.left>=f.right && b.left-f.right<16 && Math.abs(b.top-f.top)<8 && s.right-b.right>80 && Math.abs(c.top-s.top)<28 && Math.abs(f.top-s.top)<28;})()"), "New Goal, filter, and icon view switch sit together in the stage top-left");
  assert.ok(await evaluate("(()=>{const search=document.querySelector('[data-workspace-chrome] [data-global-search-open]'),settings=document.querySelector('.titlebar-chrome .navigator-project-settings'),toggle=document.querySelector('.titlebar-chrome [data-directory-toggle]');return search.closest('.navigator-project-primary') && settings?.nextElementSibling===toggle && getComputedStyle(toggle).display==='none';})()"), "Desktop hides directory collapse even on plugins without a directory");
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
    assert.equal(row.height, 28, "Parent and child rows share a single-line height");
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
  assert.equal(await evaluate("Math.round(document.querySelector('.plugin-stack').getBoundingClientRect().width)"), 48);
  assert.ok(await evaluate("(()=>{const chrome=document.querySelector('[data-workspace-chrome]'),box=chrome.getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect();return box.width<=rail.width+8;})()"), "Home project island stays rail-sized");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=goals]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await navigate(() => command("Page.navigate", { url: page }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  assert.ok(await evaluate("(()=>{const chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect(),name=document.querySelector('[data-workspace-chrome] .navigator-project-selector strong'),primary=document.querySelector('.navigator-project-primary').getBoundingClientRect();return Math.abs(chrome.right-rail.right)<3 && chrome.width<=rail.width+8 && (name?.getBoundingClientRect().width??0)<=1 && primary.height>80;})()"), "Shelf keeps a vertical rail island; project name stays in the icon");
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=sessions]')?.getAttribute('aria-current') === 'page' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && document.querySelector('[data-session-stage-list]') && document.querySelector('[data-session-stage-chrome] [data-open-session-add]')");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=sessions]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=sessions]')"), null);
  const sessionsChromeRight = await evaluate<number>("document.querySelector('[data-workspace-chrome]').getBoundingClientRect().right");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && Boolean(document.querySelector('[data-graph-node][data-goal-id=long-child] [data-graph-open]'))");
  const goalsChromeRight = await evaluate<number>("document.querySelector('[data-workspace-chrome]').getBoundingClientRect().right");
  assert.ok(await evaluate("(()=>{const chrome=document.querySelector('[data-workspace-chrome]').getBoundingClientRect(),rail=document.querySelector('.plugin-rail').getBoundingClientRect();return Math.abs(chrome.right-rail.right)<3;})()"), "After Sessions, Goals keeps a compact rail island");
  assert.ok(Math.abs(goalsChromeRight - sessionsChromeRight) < 3, "Goals chrome.right matches Sessions");
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
  assert.ok(await evaluate("document.querySelector('[data-feed-stage-chrome] [data-feed-add-toggle]')?.getBoundingClientRect().width > 0"));
  assert.ok(await evaluate("document.querySelector('[data-feed-empty]:not([hidden])') || document.querySelector('[data-feed-stage-group-empty]:not([hidden])')"), "Feed shows a page empty or empty-task folds");
  await capture("directory-feed-empty");

  const feed = createLocalFeedApplication(store.db);
  const now = new Date().toISOString();
  const source = feed.upsertSource({ board_id: DEMO_BOARD_ID, source_id: "directory-rss", kind: "rss", definition_id: "rss", sync_kind: "manual", name: "产品观察", description: "目录验证", status: "active", enabled: true, item_count: 0, origin: "molis_work", config: {}, schedule: { mode: "manual" }, cursor: null, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now });
  const item = feed.ingestItem({ source, externalId: "first", title: "从首次使用观察中找到下一步值得改进的地方", summary: "完整保留消息来源和正文，再决定如何推进。", body: "这条消息用于验证在真实目录中打开和阅读内容。", occurredAt: now, attention: false });
  feed.ingestItem({ source, externalId: "second", title: "终端与目标信息应当如何配合", summary: "切换工作时保留上下文，让记录留在正确的目标里。", body: "第二条目录内容。", occurredAt: now, attention: false });
  await reloadPage();
  await waitFor("document.querySelectorAll('[data-feed-stage-group=\"directory-rss\"] [data-feed-entry-id]').length===2");
  const feedRow = await evaluate<{ height: number; size: string; weight: string; titleWidth: number; columns: string; status: boolean; chevron: boolean }>("(()=>{const row=document.querySelector('[data-feed-entry-id]'),title=row.querySelector('strong');return {height:Math.round(row.getBoundingClientRect().height),size:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight,titleWidth:Math.round(title.getBoundingClientRect().width),columns:getComputedStyle(row).gridTemplateColumns,status:Boolean(row.querySelector('.feed-entry-status')),chevron:Boolean(row.querySelector('.feed-entry-chevron'))};})()");
  assert.equal(feedRow.height, 28, "Closed Feed rows share the Goal single-line height");
  assert.equal(feedRow.size, "13px");
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
    return { ok: inset >= 2 && inset <= 6, dump: JSON.stringify({ inset: Math.round(inset * 10) / 10 }) };
  })()`);
  assert.ok(feedBack.ok, "Feed back uses the Goal toolbar inset " + feedBack.dump);
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
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await viewport(700, 800);
  await viewport(390, 844);
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-shelf-stage-shell]')");
  assert.ok(await evaluate("(()=>{const h=document.querySelector('.navigator-project').getBoundingClientRect().height;return h>=44 && h<=64;})()"), "Mobile project island stays a compact card row");
  assert.ok(await evaluate("(()=>{const island=document.querySelector('.plugin-rail [data-assistant-island]');return Boolean(island) && island.getClientRects().length===0 && document.querySelector('[data-assistant-toggle]');})()"), "On a phone personal tools wait in the drawer, so the top keeps one row less");
  assert.ok(await evaluate("document.querySelector('.personal-sidebar-footer').getBoundingClientRect().bottom<=innerHeight"));
  assert.equal(await evaluate("document.querySelector('[data-tree-resizer]').getClientRects().length"), 0);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await capture("directory-mobile");
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open') && document.querySelector('[data-session-stage-list]')");
  await click('[data-operation-select="' + session.session_id + '"]');
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded === 'true' && getComputedStyle(document.querySelector('[data-session-stage-list]')).display === 'none'");
  await click("[data-operation-detail]:not([hidden]) [data-session-collapse]");
  await waitFor("document.querySelector('[data-session-stage-shell]')?.dataset.expanded !== 'true'");
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.boardView === 'list' && document.querySelector('[data-goal-stage-list] .tree-node[data-select-goal=\"long-child\"]')?.getClientRects().length > 0");
  await click('[data-select-goal="long-child"]');
  await waitFor("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).goals, before.goals);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID).runs, before.runs);
  assert.deepEqual(await evaluate("window.__uiErrors"), []);
});

test("个人岛对话浮窗是发送壳", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-assistant-toggle]')");
  await click("[data-assistant-toggle]");
  await waitFor(`(()=>{const toggle=document.querySelector('[data-assistant-toggle]');const composer=document.querySelector('[data-assistant-composer]');if(!toggle||!composer||!composer.matches(':popover-open'))return false;const t=toggle.getBoundingClientRect(),c=composer.getBoundingClientRect();const mid=(a,b)=>(a.top+a.bottom)/2;return c.height>=140 && c.height<=innerHeight*0.85 && c.left>=0 && c.right<=innerWidth && c.top>=0 && c.bottom<=innerHeight;})()`);
  assert.equal(await evaluate("document.body.dataset.desktopSurface"), "home");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-assistant-plan]'))"), true);
  await evaluate(`(()=>{const input=document.querySelector('[data-assistant-input]');input.value='hello';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await click("[data-assistant-send]");
  await waitFor("/尚未配置助手模型/.test(document.querySelector('[data-assistant-plan]')?.textContent || '')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]')?.value"), "hello");
  await evaluate("document.querySelector('[data-assistant-composer]')?.hidePopover()");
  await waitFor("document.querySelector('[data-assistant-composer]')?.matches(':popover-open') !== true");
  await click("[data-assistant-toggle]");
  await waitFor("document.querySelector('[data-assistant-composer]')?.matches(':popover-open') === true");
  await click('[data-assistant-island] [data-plugin-id="lingguang"]');
  await waitFor("document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-assistant-composer]')?.matches(':popover-open') !== true");
});
