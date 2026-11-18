import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
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
  await waitFor("document.body.dataset.desktopSurface === 'home' && !document.querySelector(':is([data-titlebar-tabs], [data-tab-strip]) .tab-item[aria-current]')");
  const exclusive = "(document.querySelector('[data-tab-workspace]').dataset.exclusive || '')";
  const shows = (plugin: string) => `document.querySelector('[data-titlebar-tabs] [data-tab-kind="plugin"][aria-current][data-plugin="${plugin}"]')`;

  // A Dock entry pressed twice returns to where the pane was.
  await click('[data-dock-pin="goals"]');
  await waitFor(shows("goals"));
  // PIF-ESC-01: wait for the real board's open groups before leaving; its retained state must not consume Escape.
  await waitFor("!!document.querySelector('[data-goal-kanban] details[open][data-layer-open]')");
  await click('[data-dock-pin="inbox"]');
  await waitFor(`${shows("inbox")} && document.querySelector('[data-dock-pin=inbox]').getAttribute('aria-current') === 'page'`);
  assert.equal(await evaluate("document.querySelector('[data-dock-pin=inbox]').getAttribute('aria-current')"), "page");
  await click('[data-dock-pin="inbox"]');
  await waitFor(shows("goals"));
  await click('[data-dock-pin="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'home' && !document.querySelector(':is([data-titlebar-tabs], [data-tab-strip]) .tab-item[aria-current]')");
  // Home is where panes start: pressing it again changes nothing.
  await click('[data-dock-pin="home"]');
  await waitFor("document.body.dataset.desktopSurface === 'home' && !document.querySelector(':is([data-titlebar-tabs], [data-tab-strip]) .tab-item[aria-current]')");

  // Settings: named in the switcher and the title, not claimed by the Dock underneath.
  await click('[data-directory-open="settings"]');
  await waitFor(`${exclusive} === 'settings' && !!document.querySelector('[data-cover-close]')`);
  await waitFor("document.querySelector('[data-plugin-picker-current] .is-cover')?.textContent.includes('设置')");
  assert.equal(await evaluate("document.title.startsWith('设置')"), true);
  assert.equal(await evaluate("document.querySelectorAll('[data-dock-pin][aria-current]').length"), 0);
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=back]').disabled"), false);
  await waitFor("[...document.querySelectorAll('[data-goal-kanban] details[open][data-layer-open]')].some(node => node.closest('[hidden], [inert]'))");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-goal-kanban] details[open][data-layer-open]')].some(node => node.closest('[hidden], [inert]'))"), true,
    "PIF-ESC-01: the real board retains its open groups in a hidden or inert surface");
  // 1. Esc.
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(`${exclusive} === '' && document.body.dataset.desktopSurface === 'home' && !document.querySelector(':is([data-titlebar-tabs], [data-tab-strip]) .tab-item[aria-current]')`);
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
  // 能力 is four of the categories (specs/artifact-positioning S6b); 工作记录 sits under 个人 after 记忆 (specs/observation-collection/spec.md §2.4).
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-directory-panel=settings] [data-settings-section]')].map(row => row.dataset.settingsSection).slice(0, 17)"),
    ["appearance", "directories", "memory", "work-records", "sync", "models", "assistant", "characters", "kit", "runtimes", "library", "connections", "access", "authorizations", "history", "update", "diagnostics"]);
  await click('[data-directory-panel=settings] [data-settings-section="characters"]');
  await waitFor("!document.querySelector('[data-settings-page=characters]').hidden && document.querySelector('[data-settings-page=characters]').closest('[data-work-surface=settings]')");
  await waitFor("!!document.querySelector('[data-character-builtin-list] a.characters-row')");
  assert.equal(await evaluate("document.querySelector('[data-plugin-strip] [data-plugin-id=characters]')"), null, "角色 is not a plugin in the switcher");
  await evaluate("document.querySelector('[data-character-builtin-list] a.characters-row').click()");
  await waitFor("!!document.querySelector('[data-work-surface=settings] .prompt-role-focus') && location.pathname === '/projects/" + projectId + "/'");
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=settings] [aria-current]')?.dataset.settingsSection"), "kit", "a role's prompts open under 能力包 (09)");
  await click("[data-workspace-history=back]");
  await waitFor("!document.querySelector('[data-settings-page=characters]').hidden && document.querySelector('[data-directory-panel=settings] [aria-current]')?.dataset.settingsSection === 'characters'");
  await click("[data-cover-close]");
  await waitFor(`${exclusive} === ''`);

  // The strip and the line (specs/work-line §4.1): at every width what the kept plugins fold stays inside their tray, nothing in the
  // strip or on the line lies over its neighbour, and both stay inside the window.
  for (const width of [601, 825, 1041, 1100, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("innerWidth === " + width);
    const geometry = await evaluate<{ fold: number; tray: number; over: string[]; out: string[]; scroll: boolean }>(`new Promise(resolve => setTimeout(() => {
      const shown = node => node.getClientRects().length > 0, name = node => node.className.split(' ')[0] || node.tagName.toLowerCase();
      const pins = [...document.querySelectorAll('[data-dock-pins] :is([data-dock-pin]:not([hidden]), [data-dock-more])')].filter(shown).map(node => node.getBoundingClientRect().right);
      const rows = [[...document.querySelector('.workbench-header[data-dock]').children], [...document.querySelectorAll('[data-work-line] .work-line-wing, [data-work-line] .work-line-slot')]];
      const over = [], out = [];
      for (const row of rows) {
        const boxes = row.filter(shown).map(node => [name(node), node.getBoundingClientRect()]);
        for (const [label, box] of boxes) if (box.left < -0.5 || box.right > innerWidth + 0.5) out.push(label);
        boxes.forEach(([a, one], index) => boxes.slice(index + 1).forEach(([b, other]) => {
          if (Math.min(one.right, other.right) - Math.max(one.left, other.left) > 0.5 && Math.min(one.bottom, other.bottom) - Math.max(one.top, other.top) > 0.5) over.push(a + ' × ' + b);
        }));
      }
      resolve({ fold: Math.max(...pins), tray: document.querySelector('[data-dock-pins]').getBoundingClientRect().right, over, out, scroll: document.documentElement.scrollWidth > innerWidth });
    }, 250))`);
    assert.ok(geometry.fold <= geometry.tray + 0.5, `${width}: the last kept plugin shown stays inside its tray (${geometry.fold} > ${geometry.tray})`);
    assert.deepEqual(geometry.over, [], `${width}: nothing in the strip or on the line lies over its neighbour`);
    assert.deepEqual(geometry.out, [], `${width}: the strip and the line stay inside the window`);
    assert.equal(geometry.scroll, false, `${width}: the page does not scroll sideways`);
  }
});

test("QEA-142 settings covers have a mouse and touch exit over two real panes", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, setViewport } = browser;
  await setViewport(1440, 900);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-dock-pin="goals"]');
  await click("[data-layout-open]");
  await click('[data-workspace-layout] [data-layout-split="right"]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  await click('[data-dock-pin="inbox"]');
  const currentPlugins = `[...document.querySelectorAll('[data-tab-pane] [data-tab-kind=plugin][aria-current]')].map(tab => tab.dataset.plugin)`;
  await waitFor(`JSON.stringify(${currentPlugins}) === '["goals","inbox"]'`);
  const projectLayout = () => evaluate(`(() => {
    const { layout, panes, focusedPaneId } = JSON.parse(localStorage.getItem(${JSON.stringify("molis-work-tab-workspace:" + projectId)}));
    return { layout, panes, focusedPaneId };
  })()`);
  const before = await projectLayout();
  const cover = "document.querySelector('[data-tab-workspace]').dataset.exclusive";
  const closeSelector = "[data-titlebar-tabs] [data-cover-close]";
  const closeButton = () => evaluate<{ x: number; y: number; width: number; height: number; label: string | null; reachable: boolean } | null>(`(() => {
    const button = document.querySelector('${closeSelector}');
    if (!button) return null;
    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2, y = top + height / 2;
    return { x, y, width, height, label: button.getAttribute('aria-label'), reachable: button.contains(document.elementFromPoint(x, y)) };
  })()`);
  const assertReturned = async () => {
    await waitFor(`!${cover} && JSON.stringify(${currentPlugins}) === '["goals","inbox"]'`);
    assert.deepEqual(await projectLayout(), before, "closing restores both panes, their tabs, layout and focus");
  };

  await click("[data-project-menu] > summary");
  await click('[data-personal-menu] [data-directory-open="settings"]');
  await waitFor(`${cover} === 'settings'`);
  const mouse = await closeButton();
  assert.ok(mouse?.reachable && mouse.label, "the settings cover has a visible, named close button in split layout");
  await click(closeSelector);
  await assertReturned();

  await click("[data-project-menu] > summary");
  await click(".navigator-project-settings");
  await waitFor(`${cover} === 'project-settings' && !document.body.dataset.navigationPending`);
  await setViewport(390, 844, true);
  await command("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  await waitFor("innerWidth === 390 && matchMedia('(pointer: coarse)').matches");
  const touch = await closeButton();
  assert.ok(touch?.reachable && touch.label && touch.width >= 44 && touch.height >= 44, "the named cover exit is a reachable 44px touch target");
  await command("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touch.x, y: touch.y }] }, sessionId);
  await command("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, sessionId);
  await assertReturned();
});

test("PIF-ESC-02 visible menus and dialogs take Escape before the settings cover", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-directory-open="settings"]');
  const settingsOpen = "document.querySelector('[data-tab-workspace]').dataset.exclusive === 'settings'";
  await waitFor(settingsOpen);
  for (const [trigger, opened, closed] of [
    ["[data-plugin-picker-toggle]", "!document.querySelector('[data-plugin-picker-popover]').hidden", "document.querySelector('[data-plugin-picker-popover]').hidden"],
    ["[data-global-search-open]", "document.querySelector('[data-global-search-dialog]').open", "!document.querySelector('[data-global-search-dialog]').open"],
  ]) {
    await click(trigger);
    await waitFor(`${opened} && ${settingsOpen}`);
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor(`${closed} && ${settingsOpen}`);
  }
});

test("QEA-143 a plugin's page keeps what was open in it across switches and a reload", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, reloadPage } = browser;
  const lingguang = await pluginFrameBrowser(t, browser, "lingguang");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  await click('[data-plugin-picker-popover] [data-plugin-id=lingguang]');
  // The child DOM is visible before its client mounts; the trusted owner releases input only after readiness.
  await waitFor("document.querySelector('[data-work-surface=lingguang]')?.dataset.uiClientState === 'ready' && !document.querySelector('[data-work-surface=lingguang]').hidden && !document.querySelector('[data-work-surface=lingguang]').inert");
  await lingguang.evaluate("[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button => button.getClientRects().length && button.textContent.includes('记下'))?.click()");
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && !!document.querySelector('[data-lingguang-id]')");
  const noteId = await lingguang.evaluate<string>("document.querySelector('[data-work-surface=lingguang] [data-lingguang-id]').dataset.lingguangId");
  // A note left with nothing written is thrown away when the page goes (W2-18 decision 6): these are notes with words in them.
  const write = async (text: string) => {
    await lingguang.evaluate(`(() => { const body = document.querySelector('[data-work-surface=lingguang] [data-lingguang-body]'); body.value = ${JSON.stringify(text)}; body.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang] [data-lingguang-save-status]').textContent === '已保存'");
  };
  await write("第一条灵光");
  await lingguang.evaluate(`document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${noteId}"]').click()`);
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true'");
  await click('[data-dock-pin="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals'");
  await click('[data-plugin-picker-popover] [data-plugin-id=lingguang]');
  await lingguang.waitFor("!document.querySelector('[data-work-surface=lingguang]').hidden");
  assert.equal(await lingguang.evaluate("document.querySelector('[data-work-surface=lingguang]').dataset.expanded"), "true", "the open note is still open");
  await reloadPage();
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]')?.dataset.expanded === 'true'");
  assert.equal(await evaluate("document.querySelector('[data-workspace-history=back]').disabled"), false, "history survives the reload");
  // The plugin's tab goes back to the list, and the list is what then stays.
  await click('[data-titlebar-tabs] [data-tab-kind="plugin"][data-plugin="lingguang"] .tab-item-trigger');
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'false'");

  // A record opened on the page is a step of history: Back from a second note is the first, then the list.
  await lingguang.evaluate("[...document.querySelectorAll('[data-work-surface=lingguang] button')].find(button => button.getClientRects().length && button.textContent.includes('记下'))?.click()");
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && document.querySelectorAll('[data-work-surface=lingguang] [data-lingguang-id]').length >= 2");
  const opened = (id: string) => `document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'true' && document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${id}"]')?.matches('.is-selected, [aria-selected="true"]')`;
  const newId = await lingguang.evaluate<string>(`[...document.querySelectorAll('[data-work-surface=lingguang] [data-lingguang-id]')].find(row => row.matches('.is-selected, [aria-selected="true"]'))?.dataset.lingguangId`);
  assert.ok(newId && newId !== noteId, "the new note is the chosen row");
  await write("第二条灵光");
  await lingguang.evaluate(`document.querySelector('[data-work-surface=lingguang] [data-lingguang-id="${noteId}"]').click()`);
  await lingguang.waitFor(opened(noteId));
  await click("[data-workspace-history=back]");
  await lingguang.waitFor(opened(newId));
  await click("[data-workspace-history=back]");
  await lingguang.waitFor("document.querySelector('[data-work-surface=lingguang]').dataset.expanded === 'false'");
  const savedSparks = async () => (await browser.web.get<{ sparks: { id: string; body: string; updated_at: string }[] }>(
    `/projects/${projectId}/api/plugins/io.molis.work.lingguang/sparks`,
  )).sparks;
  const before = await savedSparks();
  assert.equal(before.find(spark => spark.id === noteId)?.body, "第一条灵光");
  assert.equal(before.find(spark => spark.id === newId)?.body, "第二条灵光");
  await click("[data-workspace-history=forward]");
  await lingguang.waitFor(opened(newId));
  assert.equal(await lingguang.evaluate("document.querySelector('[data-lingguang-body]').value"), "第二条灵光");
  assert.deepEqual(await savedSparks(), before, "history restores the existing editor without changing either saved record");
});
