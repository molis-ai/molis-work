import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultShelfHotKeys } from "@molis-ai/molis-work-module-shelf";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot, goalsQueryOf } from "./fixtures/goal-application.js";

// It walks every settings category in two layouts: about 27 s on a development Mac, about 60 s on the Linux CI runner.
test("settings serve complete category pages; the project gear opens them in the workbench stage", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, click, waitFor, reloadPage } = browser;
  const prefix = `/projects/${projectId}`;
  for (const [path, content] of [["", "data-project-rename"], ["/general", "data-project-rename"], ["/guidance", "data-guidance-form"], ["/rules", "data-policy-form"], ["/planning", "data-planning-search"]]) {
    const response = await fetch(origin + prefix + "/settings" + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<body class="settings-page project-preferences-page"/);
    assert.ok(html.includes(content));
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), /data-tab-workspace|data-plugin-strip|data-project-settings-page-root/);
  }
  const embed = await (await fetch(origin + prefix + "/settings/rules?embed=1")).text();
  assert.match(embed, /data-policy-form/);
  assert.doesNotMatch(embed, /<body/);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await browser.openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await waitFor("document.querySelector('[data-goal-frame-surface]')?.dataset.frameGoal === 'CORE'");
  await evaluate("document.querySelector('[data-tab-edge=right]').click()");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const storageKey = "molis-work-tab-workspace:" + projectId;
  const readState = `JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`;
  const before = await evaluate(readState);
  await click(".navigator-project-settings");
  await waitFor("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory==='project-settings' && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]') && !document.body.dataset.navigationPending");
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').hasAttribute('aria-busy')"), false);
  assert.equal(await evaluate("location.pathname.includes('/settings')"), false);
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  assert.equal(await evaluate("!!document.querySelector('[data-plugin-strip]')"), true);
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').getAttribute('aria-current')"), "page");
  assert.equal(await evaluate("!!document.querySelector('[data-directory-panel=project-settings] [data-project-rename]')"), false);
  const rhythm = await evaluate<{
    titleSize: number;
    cardRadius: string;
    rowPadding: number;
    navHeight: number;
    navBar: string;
    hasIcon: boolean;
    controlRight: boolean;
    iconLabelGap: number;
    labelFromStart: number;
  }>(`(() => {
    const title = document.querySelector('[data-work-surface=project-settings] h1');
    const card = document.querySelector('[data-work-surface=project-settings] .settings-section');
    const row = document.querySelector('[data-work-surface=project-settings] .settings-setting-row');
    const copy = row?.querySelector('.setting-copy');
    const value = row?.querySelector('.setting-value');
    const nav = document.querySelector('[data-directory-panel=project-settings] [data-settings-section="general"]');
    const icon = nav?.querySelector('.mw-dir-row__icon');
    const label = nav?.querySelector('.mw-dir-row__copy');
    const cs = getComputedStyle(title);
    const cardCs = getComputedStyle(card);
    const rowCs = getComputedStyle(row);
    const before = getComputedStyle(nav, '::before');
    const iconBox = icon.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    return {
      titleSize: parseFloat(cs.fontSize),
      cardRadius: cardCs.borderTopLeftRadius,
      rowPadding: parseFloat(rowCs.paddingTop),
      navHeight: navBox.height,
      navBar: before.display === 'none' || before.content === 'none' || before.width === '0px' ? 'none' : before.width,
      hasIcon: !!icon,
      controlRight: value.getBoundingClientRect().x > copy.getBoundingClientRect().x,
      iconLabelGap: labelBox.x - iconBox.right,
      labelFromStart: labelBox.x - navBox.x,
    };
  })()`);
  assert.ok(rhythm.titleSize >= 26 && rhythm.titleSize <= 30, "settings title stays near 28px, got " + rhythm.titleSize);
  assert.equal(rhythm.cardRadius, "12px");
  assert.ok(rhythm.rowPadding >= 9 && rhythm.rowPadding <= 12, "setting rows stay compact like Codex, got " + rhythm.rowPadding);
  assert.ok(rhythm.navHeight >= 34 && rhythm.navHeight <= 40, "category rows stay near 36px, got " + rhythm.navHeight);
  assert.equal(rhythm.navBar, "none");
  assert.equal(rhythm.hasIcon, true);
  assert.equal(rhythm.controlRight, true);
  assert.ok(rhythm.iconLabelGap >= 0 && rhythm.iconLabelGap <= 16, "category label sits next to its icon, gap " + rhythm.iconLabelGap);
  assert.ok(rhythm.labelFromStart < 48, "category label stays on the left, inset " + rhythm.labelFromStart);
  const columnAlignment = async (paneSelector: string, docSelector: string) => evaluate<{ offset: number; width: number; pane: number }>(`(() => {
    const pane = document.querySelector(${JSON.stringify(paneSelector)});
    const doc = pane?.querySelector(${JSON.stringify(docSelector)});
    const p = pane.getBoundingClientRect();
    const d = doc.getBoundingClientRect();
    return { offset: (d.left + d.width / 2) - (p.left + p.width / 2), width: d.width, pane: p.width };
  })()`);
  const workbenchColumn = await columnAlignment("[data-work-surface=project-settings] .settings-content", ".project-settings-page, .settings-document");
  assert.ok(workbenchColumn.pane > 900, "desktop settings pane is wide enough to show centering, got " + workbenchColumn.pane);
  assert.ok(workbenchColumn.width <= 762, "settings column stays at most 760px, got " + workbenchColumn.width);
  assert.ok(Math.abs(workbenchColumn.offset) <= 24, "workbench settings column is centered, offset " + workbenchColumn.offset);
  for (const [category, selector] of [["workspaces", "[data-project-workspaces-add]"], ["guidance", "[data-guidance-form]"], ["general", "[data-project-rename]"]]) {
    await click(`[data-directory-panel=project-settings] [data-settings-section="${category}"]`);
    // Each category is a page the server renders from the whole project view: 1–3 s here, longer when the machine is
    // busy (it failed about one run in five under parallel test load with the default 4 s).
    await waitFor(`!!document.querySelector('[data-work-surface=project-settings] ${selector}')`, 15_000);
    assert.equal(await evaluate("location.pathname.includes('/settings')"), false);
    assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
    assert.equal(await evaluate(`!!document.querySelector('[data-directory-panel=project-settings] ${selector}')`), false);
  }
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory==='root' && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty') && !document.querySelector('[data-tab-workspace]').dataset.exclusive");
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 2);
  assert.equal(await evaluate("document.querySelector('.navigator-project-settings').hasAttribute('aria-current')"), false);
  const afterLeave = await evaluate(readState);
  assert.equal(afterLeave?.panes?.length, before?.panes?.length);
  assert.equal(afterLeave?.exclusive, null);
  await click(".navigator-project-settings");
  await waitFor("document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]') && !document.body.dataset.navigationPending");
  await reloadPage();
  await waitFor("document.querySelector('#goal-tree-pane')?.dataset.desktopDirectory==='project-settings' && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')");
  assert.equal(await evaluate("document.querySelectorAll('[data-tab-pane]').length"), 2);
  // A settings address opened directly (address bar, bookmark) opens the workbench on that page (specs/artifact-positioning S6).
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general" }, sessionId));
  await waitFor("document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')", 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/");
  assert.equal(await evaluate("location.search"), "");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  const projectPage = await columnAlignment("[data-work-surface=project-settings] .settings-content", ".project-settings-page, .settings-document");
  assert.ok(projectPage.pane > 900, "directly opened project settings pane is wide enough to show centering, got " + projectPage.pane);
  assert.ok(projectPage.width <= 762, "directly opened project settings column stays at most 760px, got " + projectPage.width);
  assert.ok(Math.abs(projectPage.offset) <= 24, "directly opened project settings column is centered, offset " + projectPage.offset);
  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance" }, sessionId));
  await waitFor("document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='settings' && !!document.querySelector('[data-work-surface=settings] [data-settings-panel=appearance]')", 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/", "a global settings address opens in the last opened project");
  assert.equal(await evaluate("document.body.classList.contains('settings-page')"), false);
  const globalPage = await columnAlignment("[data-work-surface=settings] .settings-content", ".settings-document, [data-settings-panel]");
  assert.ok(globalPage.pane > 900, "global settings pane is wide enough to show centering, got " + globalPage.pane);
  assert.ok(globalPage.width <= 762, "global settings column stays at most 760px, got " + globalPage.width);
  assert.ok(Math.abs(globalPage.offset) <= 24, "global settings column is centered, offset " + globalPage.offset);
});

test("work planning opens from the Goal list and is absent from project settings", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, click, waitFor } = browser;
  const prefix = `/projects/${projectId}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await waitFor("Boolean(document.body.dataset.desktopSurface) && document.body.classList.contains('immersive-workbench')");
  await click(".navigator-project-settings");
  await waitFor("!document.body.classList.contains('settings-page') && document.querySelector('[data-tab-workspace]')?.dataset.exclusive==='project-settings' && !!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=project-settings] [data-settings-section=\"planning\"]') == null"), true);
  await click('[data-plugin-id="goals"]');
  await waitFor("!!document.querySelector('[data-open-work-planning]')");
  await click("[data-open-work-planning]");
  await waitFor("document.querySelector('[data-goal-canvas-shell]')?.dataset.goalPlanning === 'open' && !!document.querySelector('[data-goal-work-planning] .work-planning')");
});

test("project settings preserve edits on failed saves, record guidance versions, and combine planning search with filters", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, projectId, command, sessionId, evaluate, navigate, click, waitFor, reloadPage } = browser;
  const prefix = `/projects/${projectId}`;
  const readGuidance = async () => (await (await fetch(origin + prefix + "/api/plugins/io.molis.work.goals/project-guidance")).json());
  const fill = async (selector: string, value: string) => evaluate(`(() => { const field=document.querySelector(${JSON.stringify(selector)}); field.value=${JSON.stringify(value)}; field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await command("Network.enable", {}, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/guidance" }, sessionId));
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-guidance-form]')", 15_000);
  await click('[data-guidance-kind="constraint"]');
  assert.equal(await evaluate("document.querySelector('[name=kind]').value"), "constraint");
  await fill('[name=content]', "用户数据只保存在本机。");
  await fill('[name=reason]', "明确项目的数据边界。");
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/plugins/io.molis.work.goals/project-guidance"] }, sessionId);
  await click('[data-guidance-form] button[type=submit]');
  await waitFor("!document.querySelector('[data-guidance-editor-error]').hidden");
  assert.equal(await evaluate("document.querySelector('[name=content]').value"), "用户数据只保存在本机。");
  assert.equal((await readGuidance()).entries.length, 0);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click('[data-guidance-form] button[type=submit]'));
  const first = await readGuidance();
  assert.equal(first.entries[0].kind, "constraint");
  assert.equal(first.entries[0].content, "用户数据只保存在本机。");
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-guidance-edit]')", 15_000);
  await click("[data-guidance-edit]");
  await fill('[name=content]', "用户数据和备份只保存在本机。");
  await fill('[name=reason]', "将备份也纳入边界。");
  await navigate(() => click('[data-guidance-form] button[type=submit]'));
  const edited = await readGuidance();
  assert.equal(edited.entries[0].revision, 2);
  assert.equal(edited.entries[0].content, "用户数据和备份只保存在本机。");
  assert.equal(edited.revisions.length, 2);
  await reloadPage();
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] .guidance-entry')", 15_000);
  assert.match(await evaluate<string>("document.querySelector('.guidance-entry').textContent"), /用户数据和备份只保存在本机/);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/rules" }, sessionId));
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-policy-form]')", 15_000);
  const beforeRules = boardSnapshot(browser.store, DEMO_PROJECT_ID).cursor;
  const accepted = "document.querySelector('[data-policy-form] [name=human_approval]').checked";
  const original = await evaluate<boolean>(accepted);
  await evaluate(accepted + " = " + String(!original));
  await click('[data-policy-cancel]');
  assert.equal(await evaluate(accepted), original);
  assert.equal(boardSnapshot(browser.store, DEMO_PROJECT_ID).cursor, beforeRules);
  await evaluate(accepted + " = " + String(!original));
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/plugins/io.molis.work.goals/policy-bindings"] }, sessionId);
  await click('[data-policy-form] button[type=submit]');
  await waitFor("!document.querySelector('[data-policy-error]').hidden && !document.querySelector('[data-policy-form] button[type=submit]').disabled");
  assert.equal(await evaluate(accepted), !original);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click('[data-policy-form] button[type=submit]'));
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-policy-form]')", 15_000);
  assert.equal(await evaluate(accepted), !original);
  assert.equal(await evaluate("document.querySelector('[data-project-rules-receipt]').hidden"), false);
  await reloadPage();
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-policy-form]')", 15_000);
  assert.equal(await evaluate(accepted), !original);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/planning" }, sessionId));
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-planning-search]')", 15_000);
  await fill('[data-planning-search]', "软件");
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-planning-method]:not([hidden])').length") > 0);
  await fill('[data-planning-search]', "没有这个方法xyz");
  assert.equal(await evaluate("document.querySelectorAll('[data-planning-method]:not([hidden])').length"), 0);
  await fill('[data-planning-search]', "");
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-planning-fold]').length") > 0);
});

type SettingsBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
interface SettingsSurface {
  frameId: string;
  evaluate<T = unknown>(expression: string): Promise<T>;
  waitFor(expression: string): Promise<void>;
  click(selector: string): Promise<void>;
}

/** RAC-2849: complete same-origin HTTP documents execute their own scripts; B uses the actual shell. */
async function settingsSurface(b: SettingsBrowser, path: string, embedded: boolean): Promise<SettingsSurface> {
  if (embedded) {
    // Use the actual directory control: a top-level redirect intentionally drops the global page's project query.
    if (!await b.evaluate("!!document.querySelector('[data-tab-workspace]')")) await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + b.projectId + "/" }, b.sessionId));
    if (await b.evaluate("!!document.querySelector('[data-tab-workspace]').dataset.exclusive")) await b.click("[data-cover-close]");
    if (new URL(path, b.origin).pathname.startsWith("/projects/")) {
      await b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
    } else {
      await b.click("[data-directory-open=settings]");
      const row = `[data-directory-panel=settings] [data-settings-section="${new URL(path, b.origin).pathname.split("/").pop()}"]`;
      await b.waitFor(`!!document.querySelector(${JSON.stringify(row)})`); await b.click(row);
    }
    assert.equal(await b.evaluate("!!document.querySelector('[data-tab-workspace]')"), true);
    const tree = await b.command<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree", {}, b.sessionId);
    return { frameId: tree.frameTree.frame.id, evaluate: b.evaluate, waitFor: b.waitFor, click: b.click };
  }
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/projects/" + b.projectId + "/" }, b.sessionId));
  await b.evaluate(`new Promise((resolve,reject)=>{const f=document.createElement('iframe');f.id='t393-setting-frame';f.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:9999;background:white';f.onload=()=>resolve(true);f.onerror=reject;f.src=${JSON.stringify(path)};document.body.append(f)})`);
  const tree = await b.command<{ frameTree: { childFrames: { frame: { id: string; url: string } }[] } }>("Page.getFrameTree", {}, b.sessionId);
  const frameId = tree.frameTree.childFrames.find(item => item.frame.url === b.origin + path)?.frame.id;
  assert.ok(frameId, "the loaded HTTP frame has the exact address");
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const { executionContextId } = await b.command<{ executionContextId: number }>("Page.createIsolatedWorld", { frameId, worldName: "T393 DOM inspection" }, b.sessionId);
    const result = await b.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true }, b.sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  assert.deepEqual(await evaluate("({origin:location.origin,path:location.pathname,search:location.search,settings:document.body.classList.contains('settings-page'),workbench:!!document.querySelector('[data-tab-workspace]')})"),
    { origin: b.origin, path: new URL(path, b.origin).pathname, search: new URL(path, b.origin).search, settings: true, workbench: false });
  const waitFor = async (expression: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try { if (await evaluate<boolean>(expression)) return; }
      catch (error) { if (!/Cannot find context|Execution context was destroyed/u.test(String(error))) throw error; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail("Child document condition timed out: " + expression);
  };
  const click = async (selector: string) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    const point = await b.evaluate<{ x: number; y: number; hit: boolean }>(`(()=>{const f=document.getElementById('t393-setting-frame'),d=f.contentDocument,n=d.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect(),p=f.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x:p.x+x,y:p.y+y,hit:!!r.width&&!!r.height&&n.contains(d.elementFromPoint(x,y))}})()`);
    assert.equal(point.hit, true, "the actual child control is visible and hit-testable: " + selector);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await b.command("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, ...(type === "mouseMoved" ? {} : { button: "left", clickCount: 1 }) }, b.sessionId);
  };
  return { frameId, evaluate, waitFor, click };
}

async function settingsTraffic(b: SettingsBrowser) {
  const requests: { url: string; method: string; frame: string }[] = [], errors: string[] = [];
  const responses: { url: string; status: number; frame: string }[] = [];
  const offRequest = b.on("Network.requestWillBeSent", event => {
    const request = event.request as { url: string; method: string };
    requests.push({ method: request.method, url: new URL(request.url).pathname, frame: String(event.frameId ?? "") });
  });
  const offResponse = b.on("Network.responseReceived", event => {
    const response = event.response as { url: string; status: number };
    responses.push({ url: response.url, status: response.status, frame: String(event.frameId ?? "") });
  });
  const offError = b.on("Runtime.exceptionThrown", event => errors.push(JSON.stringify(event.exceptionDetails)));
  await b.command("Network.enable", {}, b.sessionId); await b.command("Runtime.enable", {}, b.sessionId);
  return { requests, responses, errors, close: () => { offRequest(); offResponse(); offError(); }, posts: (url: string, frame: string) => requests.filter(item => item.method === "POST" && item.url === url && item.frame === frame) };
}

async function settingsShot(b: SettingsBrowser, name: string) {
  const directory = join(REVIEW_EVIDENCE, "pg070-current"); await mkdir(directory, { recursive: true });
  const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64"));
}

async function fillSettings(surface: SettingsSurface, selector: string, value: string) {
  await surface.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}

for (const mode of ["A", "B"] as const) test(`RAC-2848 RAC-2849 ${mode}: real Coding and Shelf settings save once and survive reopening`, { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded"); if (!b) return;
  const traffic = await settingsTraffic(b); t.after(traffic.close); await b.setViewport(1440, 1000);
  const workspace = join(b.homeDirectory, "method-workspace"); await mkdir(join(workspace, "skills", "pg070-method"), { recursive: true });
  await writeFile(join(workspace, "skills", "pg070-method", "SKILL.md"), "---\nname: pg070-method\ndescription: PG070 browser fixture\n---\nRead the specified local file before editing.\n");
  await b.web.post("/projects/" + b.projectId + "/api/workspaces", { workspace_path: workspace, user_confirmed: true });
  const prefix = "/projects/" + b.projectId, api = prefix + "/api/plugins/io.molis.work.coding";
  let surface = await settingsSurface(b, "/settings/coding-settings?project=" + b.projectId, mode === "B");
  if (mode === "A") assert.ok(traffic.responses.some(item => item.frame === surface.frameId && item.status === 200 && item.url === b.origin + "/settings/coding-settings?project=" + b.projectId));
  await surface.waitFor("document.querySelector('[data-method-discover]')?.disabled===false");
  assert.equal(await surface.evaluate("document.querySelector('[data-coding-settings]').querySelectorAll(':scope > style').length"), 1);
  await fillSettings(surface, "[data-method-path]", "skills"); await surface.click("[data-method-discover]");
  await surface.waitFor("!!document.querySelector('[data-method-candidates] summary')");
  await surface.click("[data-method-candidates] summary"); await surface.click("[data-method-candidates] button");
  await surface.waitFor("document.querySelector('[data-installed-methods]')?.textContent.includes('pg070-method')");
  assert.equal(traffic.posts(api + "/methods/install", surface.frameId).length, 1);
  const installed = await b.web.get<{ methods: { name: string; source: string }[] }>(api + "/state");
  assert.equal(installed.methods.filter(item => item.name === "pg070-method" && item.source === "installed").length, 1);
  await surface.click("[data-installed-methods] summary");
  await surface.waitFor("document.querySelector('[data-installed-methods] .coding-method-body')?.textContent.includes('Read the specified local file')");
  const styles = await surface.evaluate<{ whiteSpace: string; size: string; lineHeight: string; margin: string; cursor: string }>("(()=>{const p=document.querySelector('[data-installed-methods] .coding-method-body'),d=p.closest('details');return {whiteSpace:getComputedStyle(p).whiteSpace,size:getComputedStyle(p).fontSize,lineHeight:getComputedStyle(p).lineHeight,margin:getComputedStyle(d).marginBlockStart,cursor:getComputedStyle(d.querySelector('summary')).cursor}})()");
  assert.deepEqual(styles, { whiteSpace: "pre-wrap", size: "12px", lineHeight: "19.8px", margin: "12px", cursor: "pointer" });
  await fillSettings(surface, "[data-mcp-config] [name=transport]", "stdio");
  await fillSettings(surface, "[data-mcp-config] [name=label]", "PG070 saved server " + mode);
  await fillSettings(surface, "[data-mcp-config] [name=executable]", "/bin/cat"); await fillSettings(surface, "[data-mcp-config] [name=argv]", "[]");
  await surface.evaluate("document.querySelector('[data-mcp-config] [name=enabled]').checked=false");
  await surface.click("[data-mcp-config] [type=submit]");
  await surface.waitFor("document.querySelector('[data-mcp-status]')?.textContent.includes('已保存')");
  assert.equal(traffic.posts(api + "/mcp", surface.frameId).length, 1);
  const state = await b.web.get<{ mcp: { label: string; enabled: boolean }[] }>(api + "/state");
  assert.equal(state.mcp.filter(item => item.label === "PG070 saved server " + mode && !item.enabled).length, 1);
  await settingsShot(b, mode + "-coding");
  surface = await settingsSurface(b, "/settings/coding-settings?project=" + b.projectId, mode === "B");
  await surface.waitFor("document.querySelector('[data-installed-methods]')?.textContent.includes('pg070-method') && document.querySelector('[data-mcp-servers]')?.textContent.includes('PG070 saved server')");
  assert.equal(await surface.evaluate("document.querySelector('[data-coding-settings]').querySelectorAll(':scope > style').length"), 1);
  const defaults = defaultShelfHotKeys().toggle;
  const shelfRoot = "/api/plugins/io.molis.work.shelf/settings";
  await b.web.post(shelfRoot, { hotkeys: { toggle: { ...defaults, key_code: defaults.key_code === 122 ? 120 : 122 } } });
  surface = await settingsSurface(b, "/settings/shelf?project=" + b.projectId, mode === "B");
  const shelfApi = await surface.evaluate<string>("(document.body.dataset.routePrefix || '') + '/api/plugins/io.molis.work.shelf/settings'");
  assert.equal(await surface.evaluate("typeof globalThis.__TAURI__?.core?.invoke"), "undefined", "the fixture cannot change desktop hotkeys");
  const reset = '[data-shelf-hotkey-slot="toggle"] [data-shelf-hotkey-reset]';
  await surface.waitFor(`document.querySelector(${JSON.stringify(reset)})?.hidden===false`);
  await surface.click(reset); await surface.waitFor(`document.querySelector(${JSON.stringify(reset)})?.hidden===true`);
  assert.equal(traffic.posts(shelfApi, surface.frameId).length, 1);
  const shelf = await b.web.get<{ hotkeys: { toggle: typeof defaults } }>(shelfApi);
  assert.deepEqual(shelf.hotkeys.toggle, defaults);
  await settingsShot(b, mode + "-shelf");
  surface = await settingsSurface(b, "/settings/shelf?project=" + b.projectId, mode === "B");
  await surface.waitFor(`document.querySelector(${JSON.stringify(reset)})?.hidden===true`);
  assert.equal(await surface.evaluate("Number(document.querySelector('[data-shelf-hotkey-slot=toggle] [data-shelf-hotkey-record]').dataset.keyCode)"), defaults.key_code);
  assert.deepEqual(traffic.errors, []);
  await writeFile(join(REVIEW_EVIDENCE, "pg070-current", mode + "-traffic.json"), JSON.stringify(traffic.requests, null, 2));
});

for (const mode of ["B", "C"] as const) test(`RAC-2849 ${mode}: registered Goals rules save once; absent Coding and Shelf cause no new writes`, { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const traffic = await settingsTraffic(b); t.after(traffic.close); await b.setViewport(1440, 1000);
  const path = "/projects/" + b.projectId + "/settings/rules";
  const surface = await settingsSurface(b, path, mode === "B");
  if (mode === "C") assert.ok(traffic.responses.some(item => item.frame === surface.frameId && item.status === 200 && item.url === b.origin + path));
  await surface.waitFor("!!document.querySelector('[data-project-rules-form] [name=human_approval]')");
  assert.equal(await surface.evaluate("!!document.querySelector('[data-coding-method-library],[data-coding-mcp-settings],[data-shelf-settings]')"), false);
  const before = boardSnapshot(b.store, b.projectId!);
  const current = await surface.evaluate<boolean>("document.querySelector('[data-project-rules-form] [name=human_approval]').checked");
  await surface.evaluate(`document.querySelector('[data-project-rules-form] [name=human_approval]').checked=${!current}`);
  if (mode === "B") await b.navigate(() => surface.click("[data-project-rules-form] [type=submit]"));
  else {
    await surface.evaluate("globalThis.t393BeforeRulesSave=true");
    await surface.click("[data-project-rules-form] [type=submit]");
    await surface.waitFor("!globalThis.t393BeforeRulesSave && !!document.querySelector('[data-project-rules-form]')");
  }
  await surface.waitFor(`document.querySelector('[data-project-rules-form] [name=human_approval]')?.checked===${!current}`);
  const api = "/projects/" + b.projectId + "/api/plugins/io.molis.work.goals/policy-bindings";
  assert.equal(traffic.posts(api, surface.frameId).length, 1, "one intent reaches the registered rules client once");
  const after = boardSnapshot(b.store, b.projectId!);
  assert.ok(after.cursor > before.cursor);
  assert.ok(goalsQueryOf(b.store).listPolicyHistory(b.projectId!).some(binding => binding.scope === "project_default" && binding.state === "active" && binding.policy.human_approval === !current));
  assert.equal(traffic.requests.filter(item => item.method === "POST" && /\/api\/plugins\/io\.molis\.work\.(coding|shelf)\//u.test(item.url)).length, 0);
  assert.deepEqual(traffic.errors, []);
  await settingsShot(b, mode + "-goals-rules");
  await writeFile(join(REVIEW_EVIDENCE, "pg070-current", mode + "-rules-traffic.json"), JSON.stringify({ requests: traffic.requests, existingShelfGets: traffic.requests.filter(item => item.method === "GET" && item.url.endsWith("/io.molis.work.shelf/settings")) }, null, 2));
});
