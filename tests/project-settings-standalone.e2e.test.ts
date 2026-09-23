import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("settings serve complete category pages; the project gear opens them in the workbench stage", { timeout: 60_000 }, async t => {
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
    assert.doesNotMatch(html, /data-tab-workspace|data-plugin-strip|data-project-settings-page-root/);
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
  for (const [category, selector] of [["guidance", "[data-guidance-form]"], ["rules", "[data-policy-form]"], ["planning", "[data-planning-search]"]]) {
    await click(`[data-directory-panel=project-settings] [data-settings-section="${category}"]`);
    await waitFor(`!!document.querySelector('[data-work-surface=project-settings] ${selector}')`);
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
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/general" }, sessionId));
  await waitFor("!!document.querySelector('body.settings-page .settings-content .project-settings-page, body.settings-page .settings-content [data-project-rename]')");
  const projectPage = await columnAlignment("body.settings-page .settings-content", ".project-settings-page, .settings-document");
  assert.ok(projectPage.pane > 900, "independent project settings pane is wide enough to show centering, got " + projectPage.pane);
  assert.ok(projectPage.width <= 762, "independent project settings column stays at most 760px, got " + projectPage.width);
  assert.ok(Math.abs(projectPage.offset) <= 24, "independent project settings column is centered, offset " + projectPage.offset);
  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance" }, sessionId));
  await waitFor("!!document.querySelector('body.settings-page .settings-content .appearance-document, body.settings-page .settings-content [data-settings-panel=appearance]')");
  const globalPage = await columnAlignment("body.settings-page .settings-content", ".settings-document, [data-settings-panel]");
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
  const readGuidance = async () => (await (await fetch(origin + prefix + "/api/project-guidance")).json());
  const fill = async (selector: string, value: string) => evaluate(`(() => { const field=document.querySelector(${JSON.stringify(selector)}); field.value=${JSON.stringify(value)}; field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await command("Network.enable", {}, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/guidance" }, sessionId));
  await click('[data-guidance-kind="constraint"]');
  assert.equal(await evaluate("document.querySelector('[name=kind]').value"), "constraint");
  await fill('[name=content]', "用户数据只保存在本机。");
  await fill('[name=reason]', "明确项目的数据边界。");
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/project-guidance"] }, sessionId);
  await click('[data-guidance-form] button[type=submit]');
  await waitFor("!document.querySelector('[data-guidance-editor-error]').hidden");
  assert.equal(await evaluate("document.querySelector('[name=content]').value"), "用户数据只保存在本机。");
  assert.equal((await readGuidance()).entries.length, 0);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click('[data-guidance-form] button[type=submit]'));
  const first = await readGuidance();
  assert.equal(first.entries[0].kind, "constraint");
  assert.equal(first.entries[0].content, "用户数据只保存在本机。");
  await click("[data-guidance-edit]");
  await fill('[name=content]', "用户数据和备份只保存在本机。");
  await fill('[name=reason]', "将备份也纳入边界。");
  await navigate(() => click('[data-guidance-form] button[type=submit]'));
  const edited = await readGuidance();
  assert.equal(edited.entries[0].revision, 2);
  assert.equal(edited.entries[0].content, "用户数据和备份只保存在本机。");
  assert.equal(edited.revisions.length, 2);
  await reloadPage();
  assert.match(await evaluate<string>("document.querySelector('.guidance-entry').textContent"), /用户数据和备份只保存在本机/);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/rules" }, sessionId));
  const beforeRules = browser.store.snapshot(DEMO_BOARD_ID).cursor;
  const originalMode = await evaluate<string>("document.querySelector('[name=goal_mode]').value");
  await evaluate("document.querySelector('[name=goal_mode]').value='required'");
  await click('[data-policy-cancel]');
  assert.equal(await evaluate("document.querySelector('[name=goal_mode]').value"), originalMode);
  assert.equal(browser.store.snapshot(DEMO_BOARD_ID).cursor, beforeRules);
  await evaluate("document.querySelector('[name=goal_mode]').value='required'");
  await command("Network.setBlockedURLs", { urls: [origin + prefix + "/api/policy-bindings"] }, sessionId);
  await click('[data-policy-form] button[type=submit]');
  await waitFor("!document.querySelector('[data-policy-error]').hidden && !document.querySelector('[data-policy-form] button[type=submit]').disabled");
  assert.equal(await evaluate("document.querySelector('[name=goal_mode]').value"), "required");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click('[data-policy-form] button[type=submit]'));
  assert.equal(await evaluate("document.querySelector('[name=goal_mode]').value"), "required");
  assert.equal(await evaluate("document.querySelector('[data-project-rules-receipt]').hidden"), false);
  await reloadPage();
  assert.equal(await evaluate("document.querySelector('[name=goal_mode]').value"), "required");
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/planning" }, sessionId));
  await fill('[data-planning-search]', "软件");
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-planning-method]:not([hidden])').length") > 0);
  await fill('[data-planning-search]', "没有这个方法xyz");
  assert.equal(await evaluate("document.querySelectorAll('[data-planning-method]:not([hidden])').length"), 0);
  await fill('[data-planning-search]', "");
  assert.ok(await evaluate<number>("document.querySelectorAll('[data-planning-fold]').length") > 0);
});
