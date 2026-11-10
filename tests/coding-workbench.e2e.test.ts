import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openBoardBrowser as openGoalBrowser } from "./fixtures/board-browser.js";
import { CODING_COMPOSER, codingAdd } from "./fixtures/coding-composer.js";

// W5-02-REG-06: real generated-catalog startup, Files snapshots, Diff and Git readers, including Coding's embedded Files.
test("Coding tools open real stages, preserve session tabs and read fixed workspace content", { timeout: 90000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const { command, sessionId } = b;
  const views = Object.fromEntries(await Promise.all(["files", "git", "diff", "text-stats", "coding"].map(async id => [id, await pluginFrameBrowser(t, b, id)])));
  let active: Pick<typeof b, "evaluate" | "waitFor" | "click"> = b;
  const evaluate: typeof b.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof b.waitFor = (...args) => active.waitFor(...args);
  const click: typeof b.click = (...args) => active.click(...args);
  const prefix = `${b.origin}/projects/${b.projectId}`;
  const workspace = join(b.homeDirectory, "coding-fixture");
  await mkdir(join(workspace, "nested"), { recursive: true });
  await writeFile(join(workspace, "note.txt"), "first\n中文🙂\n");
  await writeFile(join(workspace, "nested", "empty.txt"), "");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  git("add", "."); git("commit", "-m", "initial");
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const open = async (plugin: string) => {
    await b.click(`[data-plugin-strip] [data-plugin-id="${plugin}"]`);
    await b.waitFor(`document.querySelector('[data-work-surface="${plugin}"]').getBoundingClientRect().width > 100 && !document.querySelector('[data-work-surface="${plugin}"]').hidden`);
    active = views[plugin]!;
  };
  const files = '[data-companion="files"]';
  const coding = '[data-coding-workbench]';
  const capture = async (name: string) => {
    const directory = join(process.cwd(), ".tmp/coding-component-board-v2"); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(shot.data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.codingTestErrors=[];addEventListener('error',e=>codingTestErrors.push(e.message));addEventListener('unhandledrejection',e=>codingTestErrors.push(String(e.reason)));" }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: b.origin + "/__ui/catalog" }, sessionId));
  const boardFrame = await evaluate(`(()=>{const h=document.querySelector('.mw-catalog-shell .mw-frame__header'),title=h.querySelector('h2');return {padding:getComputedStyle(h).padding,font:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight};})()`);
  await b.navigate(() => command("Page.navigate", { url: prefix + "/" }, sessionId));
  // Folders are added in project settings (「输入与输出」); the output is the folder Files, Git and Coding use when none is named.
  const showWorkspaceSettings = async () => {
    active = b;
    await click('.navigator-project-settings');
    await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
    await click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
    await waitFor("!!document.querySelector('[data-directories-add]') && document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  };
  await showWorkspaceSettings();
  await fill('[data-directories-add] [name=path]', workspace);
  await click('[data-directories-add] [type=submit]');
  await waitFor("document.querySelector('[data-directories-inputs]').textContent.includes('coding-fixture') && !document.querySelector('[data-directories-add] [type=submit]').disabled");
  await click("[data-directories-inputs] [data-directory-row]:has([title$='/coding-fixture']) [data-act=set-output]");
  await waitFor("document.querySelector('[data-directories-output] [data-directory-row] [data-text=path]')?.title.endsWith('/coding-fixture')");
  await capture("workspace-desktop");
  await open("files");
  await waitFor(`document.querySelector('${files} [data-files-tree] [title="note.txt"]')`);
  try { await click(`${files} [data-files-tree] [title="nested"]`); }
  catch (error) { throw new Error(JSON.stringify(await evaluate(`({tree:document.querySelector('${files} [data-files-tree]').textContent,rows:[...document.querySelectorAll('${files} [data-files-tree] button')].map(b=>[b.title,b.dataset.filePath])})`)), {cause:error}); }
  await waitFor(`document.querySelector('${files} [data-files-tree] [title="nested/empty.txt"]')`);
  await click(`${files} [data-files-tree] [title="nested/empty.txt"]`);
  await waitFor(`document.querySelector('${files} [data-files-notice]').textContent.includes('空的')`);
  assert.equal(await evaluate(`document.querySelector('${files} [data-files-capture="before"]').disabled`), false);
  await click(`${files} [data-files-tree] [title="note.txt"]`);
  await waitFor(`document.querySelector('${files} [data-files-text]').value === 'first\\n中文🙂\\n'`);
  await click(`${files} [data-files-capture="before"]`);
  await waitFor(`!document.querySelector('${files} [data-files-capture="before"]').disabled`);
  await writeFile(join(workspace, "note.txt"), "second\n中文🙂\n");
  await click(`${files} [data-files-tree] [title="note.txt"]`);
  await waitFor(`document.querySelector('${files} [data-files-text]').value.startsWith('second')`);
  await click(`${files} [data-files-capture="after"]`);
  await waitFor(`document.querySelector('${files} [data-files-diff] [data-phase="ready"]')`);
  await capture("files-desktop");
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [prefix + "/api/plugins/io.molis.work.files/open"] }, sessionId);
  await click(`${files} [data-files-tree] [title="note.txt"]`);
  // The shared request helper says the failure in words (W3-10; no browser English such as "Failed to fetch").
  await waitFor(`/连不上|不知道这次操作有没有完成/.test(document.querySelector('${files} [data-files-notice]').textContent) && !/fetch/i.test(document.querySelector('${files} [data-files-notice]').textContent)`);
  assert.equal(await evaluate(`document.querySelector('${files} [data-files-text]').hidden && document.querySelector('${files} [data-files-copy]').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('${files} [data-files-reload]').disabled`), false, 'failed reads expose a working retry');
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click(`${files} [data-files-reload]`);
  await waitFor(`!document.querySelector('${files} [data-files-text]').hidden && document.querySelector('${files} [data-files-text]').value.startsWith('second')`);
  // Diff and Text Stats are laid out as plugin stages (E-14): the heading drawn by the stage, the page's actions at its right,
  // one centred column at most 960px wide, and the content inside it, not from the window's edge.
  const stage = (id: string) => evaluate<{ heading: string; actions: string[]; inset: number; column: number; contentLeft: number }>(`(() => {
    const shell = document.querySelector('[data-companion="${id}"]'), list = shell.querySelector(':scope > .plugin-stage-list'), chrome = list.querySelector(':scope > .plugin-stage-chrome');
    const style = getComputedStyle(list), inset = parseFloat(style.paddingLeft), box = list.getBoundingClientRect();
    return { heading: getComputedStyle(chrome, '::before').content, actions: [...chrome.querySelectorAll(':scope > button')].map(button => button.textContent.trim()),
      inset, column: list.clientWidth - inset - parseFloat(style.paddingRight), contentLeft: shell.querySelector('[data-companion-content]').getBoundingClientRect().left - box.left }; })()`);
  await open("diff");
  await waitFor("document.querySelector('[data-companion=" + '"diff"' + "] [data-phase=ready]')");
  const compared = await evaluate<string>("document.querySelector('[data-companion=diff] [data-companion-content]').textContent");
  assert.match(compared, /first/); assert.match(compared, /second/, "Diff reads both snapshots captured by Files");
  const diffStage = await stage("diff");
  assert.match(diffStage.heading, /Diff/); assert.deepEqual(diffStage.actions, ["刷新", "打开 Files"]);
  assert.ok(diffStage.inset >= 32 && diffStage.column <= 960 && diffStage.contentLeft >= 32, JSON.stringify(diffStage));
  await capture("diff-desktop");
  await open("text-stats");
  await waitFor("document.querySelector('[data-companion=" + '"text-stats"' + "] [data-phase=ready]')");
  const statsStage = await stage("text-stats");
  assert.match(statsStage.heading, /Text stats/); assert.deepEqual(statsStage.actions, ["刷新", "打开 Files"]);
  assert.ok(statsStage.inset >= 32 && statsStage.column <= 960 && statsStage.contentLeft >= 32, JSON.stringify(statsStage));
  await capture("stats-desktop");
  await writeFile(join(workspace, "note.txt"), "staged\n中文🙂\n");
  git("add", "note.txt");
  await writeFile(join(workspace, "note.txt"), "second\n中文🙂\n");
  await command("Network.setBlockedURLs", { urls: [prefix + "/api/plugins/io.molis.work.git/state"] }, sessionId);
  await open("git");
  await waitFor("/连不上/.test(document.querySelector('[data-companion=git] [data-git-status]').textContent) && !/fetch/i.test(document.querySelector('[data-companion=git] [data-git-status]').textContent)");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click('[data-companion="git"] [data-git-refresh]');
  await waitFor("document.querySelector('[data-companion=" + '"git"' + "] [data-git-list] button')");
  await waitFor("!document.querySelector('[data-companion=git] [data-git-refresh]').disabled");
  await click('[data-companion="git"] [data-git-list] button');
  await waitFor("document.querySelector('[data-companion=" + '"git"' + "] [data-git-diff] [data-phase=ready]')");
  const staged = await evaluate<string>("document.querySelector('[data-companion=git] [data-git-diff]').textContent");
  assert.match(staged, /first/); assert.match(staged, /staged/, "Git reads the actual HEAD→index change");
  assert.equal(await evaluate("document.querySelectorAll('[data-companion=git] [data-git-list] .is-selected').length"), 1);
  await click('[data-companion="git"] [data-git-list] section:last-child button');
  await waitFor("document.querySelector('[data-companion=git] [data-git-scope]').textContent.includes('未暂存')");
  await waitFor("document.querySelector('[data-companion=git] [data-git-diff]').textContent.includes('second')");
  assert.match(await evaluate<string>("document.querySelector('[data-companion=git] [data-git-diff]').textContent"), /staged/,
    "the worktree comparison reads the actual index→worktree change");
  assert.equal(await evaluate("document.querySelectorAll('[data-companion=git] [data-git-list] .is-selected').length"), 1, "same path on two Git sides has only one selected row");
  await capture("git-desktop");

  await open("coding");
  await click(`${coding} [data-coding-face="files"]`);
  await waitFor(`document.querySelector('${coding} [data-files-tree] [title="note.txt"]')`).catch(async error => {
    throw new Error(JSON.stringify(await evaluate(`({files:document.querySelector('[data-files-notice]')?.textContent,git:document.querySelector('[data-git-status]')?.textContent,tree:document.querySelector('[data-files-tree]')?.outerHTML,root:document.querySelector('[data-coding-workbench]')?.dataset})`)),{cause:error});
  });
  await waitFor(`!document.querySelector('${coding} [data-files-refresh]').disabled && !document.querySelector('${coding} [data-git-refresh]').disabled`);
  await click(`${coding} [data-files-tree] [title="note.txt"]`);
  await waitFor(`!document.querySelector('${coding} [data-files-text]').hidden && document.querySelector('${coding} [data-files-text]').value.startsWith('second')`);
  // Layout can settle a frame after the text arrives under a loaded suite; a reader that never shows still fails here.
  await waitFor(`document.querySelector('${coding} [data-files-text]').getBoundingClientRect().width > 100`);
  assert.equal(await evaluate(`document.querySelector('${coding} [data-files-text]').getBoundingClientRect().width > 100`), true, "embedded file reads are visible before a Coding session exists");
  await click(`${coding} [data-coding-face="sessions"]`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-input] .mw-composer__input').disabled`);
  await waitFor(`document.querySelector('${coding} [data-coding-prompt]')`);
  await capture("coding-welcome-desktop");
  await click(`${coding} [data-coding-prompt][data-coding-prompt-intent="discuss"]`);
  await waitFor(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value.includes('主要模块')`);
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-input] [data-composer-control=intent]').value`), "discuss", "a starter also picks the way the round runs");
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-prompt]').disabled`), true, "examples never overwrite an existing draft");
  await fill(`${coding} [data-coding-input] .mw-composer__input`, "first session draft");
  await click(`${coding} [data-coding-new]`);
  await waitFor(`document.querySelector('${coding} [data-coding-sessions]').querySelectorAll('[data-coding-session]').length === 2 && document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === ''`);
  await fill(`${coding} [data-coding-input] .mw-composer__input`, "second session draft");
  const sessions = await evaluate<string[]>(`[...document.querySelectorAll('${coding} [data-coding-session]')].map(node=>node.dataset.codingSession)`);
  const current = await evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]').dataset.codingSession`);
  const first = sessions.find(id => id !== current)!;
  // Select through the actual tab system, rather than the directory's direct select handler.
  // Tabs store semantic ownership in persisted UI state, not a duplicated DOM id scheme.
  const state = await b.evaluate<any>(`JSON.parse(localStorage.getItem('molis-work-tab-workspace:${b.projectId}'))`);
  const tabs = state.panes.flatMap((pane: any) => pane.tabs);
  const firstTab = tabs.find((tab: any) => tab.itemId === first);
  const secondTab = tabs.find((tab: any) => tab.itemId === current);
  await b.click(`[data-tab-id="${firstTab.id}"]`);
  await waitFor(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === 'first session draft'`);
  await b.click(`[data-tab-id="${secondTab.id}"]`);
  await waitFor(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === 'second session draft'`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`document.querySelectorAll('${coding} [data-coding-session]').length === 3 && document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === ''`);
  const untouched = await evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]').dataset.codingSession`);
  await click(`${coding} [data-coding-new]`);
  await waitFor(`!document.querySelector('${coding} [data-coding-new]').disabled`);
  assert.equal(await evaluate(`document.querySelectorAll('${coding} [data-coding-session]').length`), 3, "an untouched new session is reused instead of piling up");
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-session][aria-current=true]').dataset.codingSession`), untouched);
  assert.deepEqual(await evaluate(`(()=>{const h=document.querySelector('${coding} .coding-dialogue-head'),title=h.querySelector('[data-coding-title]');return {padding:getComputedStyle(h).padding,font:getComputedStyle(title).fontSize,weight:getComputedStyle(title).fontWeight};})()`), boardFrame, 'real Coding heading matches the component board, not just its class names');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${coding} [data-coding-tools]')).display`), 'none', 'empty results do not consume a permanent column');
  await click(`${coding} [data-coding-results-open]`);
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${coding} [data-coding-tools]')).display`), 'none');
  await click(`${coding} [data-coding-results-close]`);
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-directory]').getBoundingClientRect().left < 70`), true, 'embedded directory does not open an empty second host directory');
  await capture("coding-desktop");
  await open("coding");
  await waitFor(`document.querySelector('${coding}').dataset.codingDetail === 'false'`);
  await b.click(`[data-tab-id="${secondTab.id}"]`);
  await waitFor(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === 'second session draft'`);
  await b.reloadPage();
  await waitFor(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === 'second session draft'`);
  // No model: send says why instead of starting a run (the composer's `required`), and the words stay.
  await click(`${coding} [data-coding-input] [data-composer-send]`);
  await waitFor(`document.querySelector('${coding} ${CODING_COMPOSER} .mw-composer__status')?.textContent.includes('请先选择可用的模型')`);
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-input] .mw-composer__input').value`), 'second session draft', "no model cannot execute a run");
  const sessionsResponse = await fetch(`${prefix}/api/plugins/io.molis.work.coding/state`);
  const sessionState = await sessionsResponse.json();
  assert.equal(sessionState.sessions.length, 3, "two drafted sessions plus one reused untouched session: opening and restoring never creates extra sessions");
  for (const row of sessionState.sessions) {
    const detail = await (await fetch(`${prefix}/api/plugins/io.molis.work.coding/sessions/${row.session_id}`)).json();
    assert.equal(detail.runs.length, 0, "opening and typing do not launch a model");
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate(`document.querySelector('${coding} [data-coding-input] [data-composer-send]').scrollIntoView({block:'nearest'})`);
  const sendBottom = await evaluate<number>(`document.querySelector('${coding} [data-coding-input] [data-composer-send]').getBoundingClientRect().bottom`);
  assert.ok(sendBottom <= 780, "send remains reachable on a narrow screen");
  // Session settings and context sources live behind the composer's ＋ so the bar stays about the task, each with its glyph.
  const addMenu = `document.querySelector('${coding} ${CODING_COMPOSER} .mw-composer__start [data-compose-menu]')`;
  assert.equal(await evaluate(`!${addMenu} || ${addMenu}.hidden`), true);
  await click(`${coding} ${CODING_COMPOSER} [data-composer-add]`);
  assert.equal(await evaluate(`${addMenu}.querySelectorAll('[data-composer-command] svg').length`), 7, "＋ keeps its glyphs (materials, character, methods, action capabilities, MCP, delegate, context)");
  await evaluate(codingAdd("context"));
  assert.equal(await evaluate(`${addMenu}.hidden && !${addMenu}.childElementCount`), true, "choosing an item closes the menu");
  assert.equal(await evaluate(`document.querySelector('${coding} [data-coding-rename]').getBoundingClientRect().height > 0`), true, 'compact session settings retain rename');
  await evaluate(codingAdd("context"));
  await capture("coding-mobile");
  await click(`${coding} [data-coding-results-open]`);
  // 07-1 S3: a phone's strip shows the current tab only; the others are opened from 全部标签.
  await b.click("[data-titlebar-tabs] [data-tab-all]");
  // The menu is the workbench's, not the Coding frame's, so it is waited for on the page itself.
  await b.waitFor(`document.querySelector('[data-workspace-all-tabs] [data-all-tab="${firstTab.id}"]')?.checkVisibility()`);
  await b.click(`[data-workspace-all-tabs] [data-all-tab="${firstTab.id}"]`);
  await waitFor(`document.querySelector('${coding}').dataset.codingResults === 'false' && document.querySelector('${coding} [data-coding-input] .mw-composer__input').value === 'first session draft'`);
  await click(`${coding} [data-coding-results-open]`);
  await click(`${coding} [data-coding-results-close]`);
  await click(`${coding} [data-coding-directory-back]`);
  await click(`${coding} [data-coding-session]`);
  await waitFor(`document.querySelector('${coding}').dataset.codingDetail === 'true'`);
  await open("files");
  await waitFor(`document.querySelector('${files} [data-files-tree] [title="note.txt"]')`);
  await b.click('.navigator-directory-toggle');
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').dataset.mobileView`), "document", "the real directory control closes the Dock's drawer");
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')`), false);
  await b.click('[data-directory-show]');
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')`), true);
  await b.evaluate("molisWorkOpenPlugin('files')");
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').dataset.mobileView`), "document", "explicit main navigation dismisses the actual open drawer");
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')`), false);
  await click(`${files} [data-files-tree] [title="note.txt"]`);
  await waitFor(`!document.querySelector('${files} [data-files-text]').hidden`);
  await b.evaluate("localStorage.setItem('molis-work:theme','dark');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'dark'}))");
  await capture("files-mobile-dark");
  await click(`${files} [data-files-close]`);
  assert.equal(await evaluate(`document.activeElement?.getAttribute('title')`), 'note.txt', 'return restores the originating file row');
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await click(`${files} [data-files-tree] [title="note.txt"]`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${files} [data-files-results]')).animationName`), 'none');
  await click(`${files} [data-files-close]`);
  assert.equal(await evaluate(`document.querySelector('${files} [data-files-tree]').getBoundingClientRect().width > 100`), true);
  assert.equal(await evaluate("document.scrollingElement.scrollWidth <= innerWidth"), true);
  await open('git');
  await waitFor("!document.querySelector('[data-companion=git] [data-git-history]').disabled");
  await b.click('.navigator-directory-toggle');
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').dataset.mobileView`), "document", "the real directory control closes the Git Dock's drawer");
  assert.equal(await b.evaluate(`document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')`), false);
  await click('[data-companion=git] [data-git-history]');
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-git-close')"), true);
  assert.equal(await evaluate("document.querySelector('[data-companion=git] [data-git-results]').getAttribute('aria-busy')"), 'false');
  await click('[data-companion=git] [data-git-close]');
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-git-history')"), true);
  await click('[data-companion=git] [data-git-reopen]');
  await waitFor("document.querySelector('[data-companion=git] [data-git-diff] [data-phase=ready]')");
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-git-close')"), true);
  await capture('git-mobile-dark');
  await showWorkspaceSettings();
  await capture('workspace-mobile-dark');
  assert.equal(await evaluate("document.scrollingElement.scrollWidth <= innerWidth"), true);
  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.click(`[data-tab-id="${secondTab.id}"]`);
  active = views.coding!;
  await waitFor(`document.querySelector('${coding}').dataset.codingDetail === 'true'`);
  await capture('coding-compact-dark');
  assert.equal(await evaluate("document.scrollingElement.scrollWidth <= innerWidth"), true);
  assert.deepEqual(await b.evaluate("window.codingTestErrors"), []);
});

// PCSYNC-22/23: browser display evidence only; canonical SDK/digest/SQL behavior is exercised in coding-sync safety tests.
test('received saved history is readable on a narrow new-device page without reviving old approvals',{timeout:60000},async t=>{
 const b=await openGoalBrowser(t,'seeded');if(!b)return;
 const frame=await pluginFrameBrowser(t,b,'coding');
 await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=fetch.bind(window);window.historyCalls=[];window.fetch=async(url,init)=>{const response=await original(url,init),path=new URL(String(url),location.href).pathname;
 if((init?.method||'GET')==='GET'&&/\\/api\\/plugins\\/io\\.molis\\.work\\.coding\\/sessions\\/[^/]+(?:\\/runs)?$/.test(path)&&(response.ok||path.endsWith('/runs'))){const value=await response.json();window.historyCalls.push(path);value.runs=[];value.saved_history={total:25,offset:path.endsWith('/runs')?0:5,runs:[{run_id:path.endsWith('/runs')?'earlier-source-run':'saved-source-run',outcome:'completed',messages:[{role:'user',text:'原设备的完整请求 <script>window.historyXss=true</script>'},{role:'assistant',text:'已保存的完整答复 — 尾部标记'},{role:'tool',text:'原执行回执只供阅读'}]}]};return Response.json(value);}return response;};})();`},b.sessionId);
 await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/projects/'+b.projectId+'/'},b.sessionId));await b.click('[data-plugin-strip] [data-plugin-id="coding"]');await b.surfaceReady('coding');await frame.click('[data-coding-new]');
 await frame.waitFor("document.querySelector('[data-coding-saved-history]')?.textContent.includes('尾部标记')");assert.equal(await frame.evaluate('Boolean(window.historyXss)'),false);assert.equal(await frame.evaluate("Boolean(document.querySelector('[data-coding-turns] [data-coding-welcome]'))"),false,'saved history is not an empty new conversation');
 assert.equal(await frame.evaluate("document.querySelector('[data-coding-saved-history]').querySelectorAll('[data-coding-continue], [data-coding-approve], [data-coding-question], [data-coding-nudge]').length"),0);
 await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);assert.equal(await frame.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);await mkdir('.impeccable/qa/review',{recursive:true});await writeFile('.impeccable/qa/review/coding-saved-history-390.png',Buffer.from(shot.data,'base64'));
 await frame.evaluate("document.querySelector('[data-coding-saved-history] button').scrollIntoView({block:'center'})");await frame.click('[data-coding-saved-history] button');await frame.waitFor("document.querySelector('[data-coding-saved-history]')?.textContent.includes('earlier-source-run')");
});
