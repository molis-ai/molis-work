import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/archive/page-interaction-flow: every entry of the bar is a switch, every cover has a way out, history walks both,
// a plugin's page keeps what was open in it, and settings are one list inside the workbench.
test("the bar toggles back, covers close four ways, and history walks covers and their pages", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  const exclusive = "document.querySelector('[data-tab-workspace]').dataset.exclusive || ''";
  const shows = (plugin: string) => `document.querySelector('[data-titlebar-tabs] .tab-view-chip[aria-current][data-tab-view="${plugin}"]')`;

  // A resident pressed twice returns to where the pane was; so does a Dock entry.
  await click('[data-dock-pin="goals"]');
  await waitFor(shows("goals"));
  await click('[data-bar-resident="shelf"]');
  await waitFor(shows("shelf"));
  assert.equal(await evaluate("document.querySelector('[data-bar-resident=shelf]').getAttribute('aria-current')"), "page");
  await click('[data-bar-resident="shelf"]');
  await waitFor(shows("goals"));
  await click('[data-dock-pin="goals"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  // Home is where panes start: pressing it again changes nothing.
  await click('[data-dock-pin="home"]');
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");

  // Settings: named in the switcher and the title, not claimed by the Dock underneath.
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === 'settings' && !!document.querySelector('[data-cover-close]')`);
  await waitFor("document.querySelector('[data-plugin-picker-current] .is-cover')?.textContent.includes('设置')");
  assert.equal(await evaluate("document.title.startsWith('设置')"), true);
  assert.equal(await evaluate("document.querySelectorAll('[data-dock-pin][aria-current], [data-bar-resident][aria-current]').length"), 0);
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=back]').disabled"), false);
  // 1. Esc.
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(`${exclusive} === '' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')`);
  // 2. The same menu entry again, and the menu closes with it.
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === 'settings'`);
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === '' && !document.querySelector('[data-project-menu]').open`);
  // 3. Back, then 4. forward reopens and the chip's close button closes.
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === 'settings'`);
  await click("[data-workspace-history=back]");
  await waitFor(`${exclusive} === ''`);
  await click("[data-workspace-history=forward]");
  await waitFor(`${exclusive} === 'settings'`);
  await click("[data-cover-close]");
  await waitFor(`${exclusive} === '' && document.querySelector('#goal-tree-pane').dataset.desktopDirectory === 'root'`);

  // Settings is one grouped list, and 角色 is a settings page: its roles open their prompts in the same cover,
  // and Back walks back through the pages inside it.
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === 'settings'`);
  // 能力 is four of the categories (specs/artifact-positioning S6b).
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-directory-panel=settings] [data-settings-section]')].map(row => row.dataset.settingsSection).slice(0, 12)"),
    ["appearance", "memory", "models", "assistant", "characters", "prompts", "runtimes", "library", "connections", "access", "history", "diagnostics"]);
  await click('[data-directory-panel=settings] [data-settings-section="characters"]');
  await waitFor("!document.querySelector('[data-settings-page=characters]').hidden && document.querySelector('[data-settings-page=characters]').closest('[data-work-surface=settings]')");
  await waitFor("!!document.querySelector('[data-character-builtin-list] a.characters-row')");
  assert.equal(await evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=characters]')"), null, "角色 is not a plugin in the switcher");
  await evaluate("document.querySelector('[data-character-builtin-list] a.characters-row').click()");
  await waitFor("!!document.querySelector('[data-work-surface=settings] .prompt-role-focus') && location.pathname === '/projects/" + projectId + "/'");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=settings] [aria-current]')?.dataset.settingsSection"), "prompts");
  await click("[data-workspace-history=back]");
  await waitFor("!document.querySelector('[data-settings-page=characters]').hidden && document.querySelector('[data-directory-panel=settings] [aria-current]')?.dataset.settingsSection === 'characters'");
  await click("[data-cover-close]");
  await waitFor(`${exclusive} === ''`);

  // The bar's trays: at every desktop width what folds stays inside the left tray, and neither tray runs under the composer.
  for (const width of [601, 825, 1041, 1100, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("innerWidth === " + width);
    const geometry = await evaluate<{ fold: number; start: number; centre: number; centreEnd: number; residents: number; end: number }>(`new Promise(resolve => setTimeout(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const shown = [...document.querySelectorAll('.bar-start :is([data-dock-pin]:not([hidden]), [data-dock-more])')].map(node => node.getBoundingClientRect().right);
      resolve({ fold: Math.max(...shown), start: box('.workbench-bar .bar-start').right, centre: box('.workbench-bar .bar-center').left,
        centreEnd: box('.workbench-bar .bar-center').right, residents: box('.workbench-bar .bar-residents').left, end: box('.workbench-bar .bar-end').right });
    }, 250))`);
    assert.ok(geometry.fold <= geometry.start + 0.5, `${width}: the Dock's last shown entry stays inside its tray`);
    assert.ok(geometry.start <= geometry.centre, `${width}: the left tray ends before the composer`);
    assert.ok(geometry.centreEnd <= geometry.residents, `${width}: the composer ends before the right tray`);
    assert.ok(geometry.end <= width, `${width}: the bar stays inside the window`);
  }
});

test("a plugin's page keeps what was open in it across switches and a reload", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, reloadPage } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-bar-resident="lingguang"]');
  await waitFor("!document.querySelector('[data-work-surface=lingguang]').hidden");
  await evaluate("[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button => button.getClientRects().length && button.textContent.includes('记下'))?.click()");
  await waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && !!document.querySelector('[data-lingguang-id]')");
  const noteId = await evaluate<string>("document.querySelector('[data-work-surface=lingguang] [data-lingguang-id]').dataset.lingguangId");
  // A note left with nothing written is thrown away when the page goes (W2-18 decision 6): these are notes with words in them.
  const write = async (text: string) => {
    await evaluate(`(() => { const body = document.querySelector('[data-work-surface=lingguang] [data-lingguang-body]'); body.value = ${JSON.stringify(text)}; body.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await waitFor("document.querySelector('[data-work-surface=lingguang] [data-lingguang-save-status]').textContent === '已保存'");
  };
  await write("第一条灵光");
  await evaluate(`document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${noteId}"]').click()`);
  await waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true'");
  await click('[data-dock-pin="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  await click('[data-bar-resident="lingguang"]');
  await waitFor("!document.querySelector('[data-work-surface=lingguang]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=lingguang]').dataset.expanded"), "true", "the open note is still open");
  await reloadPage();
  await waitFor("document.querySelector('[data-work-surface=lingguang]')?.dataset.expanded === 'true'");
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=back]').disabled"), false, "history survives the reload");
  // The location chip goes back to the list, and the list is what then stays.
  await click('[data-titlebar-tabs] .tab-view-chip[data-tab-view="lingguang"]');
  await waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'false'");

  // A record opened on the page is a step of history: Back from a second note is the first, then the list.
  await evaluate("[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button => button.getClientRects().length && button.textContent.includes('记下'))?.click()");
  await waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && document.querySelectorAll('[data-work-surface=lingguang] [data-lingguang-id]').length >= 2");
  const opened = (id: string) => `document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${id}"]')?.matches('.is-selected, [aria-selected="true"]')`;
  const newId = await evaluate<string>(`[...document.querySelectorAll('[data-work-surface=lingguang] [data-lingguang-id]')].find(row => row.matches('.is-selected, [aria-selected="true"]'))?.dataset.lingguangId`);
  assert.ok(newId && newId !== noteId, "the new note is the chosen row");
  await write("第二条灵光");
  await evaluate(`document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${noteId}"]').click()`);
  await waitFor(opened(noteId));
  await click("[data-workspace-history=back]");
  await waitFor(opened(newId));
  await click("[data-workspace-history=back]");
  await waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'false'");
  await click("[data-workspace-history=forward]");
  await waitFor(opened(newId));
});
