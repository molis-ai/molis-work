import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

test("search exposes keyboard selection and offers a touch dismissal that returns focus", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor, command, sessionId, navigate, origin, projectId } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-global-search-open]');
  await waitFor("document.querySelector('[data-global-search-dialog]').open");
  const selection = () => evaluate<{ inputFocused: boolean; expanded: string; active: string; selected: string }>(`(() => {
    const input = document.querySelector('[data-global-search]');
    return { inputFocused: document.activeElement === input, expanded: input.getAttribute('aria-expanded'),
      active: input.getAttribute('aria-activedescendant'), selected: document.querySelector('[data-global-search-hit][aria-selected=true]')?.id };
  })()`);
  const first = await selection();
  assert.equal(first.inputFocused, true);
  assert.equal(first.expanded, 'true');
  assert.equal(first.active, first.selected);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, sessionId);
  const second = await selection();
  assert.equal(second.inputFocused, true);
  assert.notEqual(second.active, first.active);
  assert.equal(second.active, second.selected);
  await evaluate(`{ const input = document.querySelector('[data-global-search]'); input.value = '没有这样的检索结果xyz'; input.dispatchEvent(new Event('input', {bubbles:true})); }`);
  assert.equal(await evaluate("document.querySelector('[data-global-search]').hasAttribute('aria-activedescendant')"), false);
  await click('[data-global-search-close]');
  await waitFor("!document.querySelector('[data-global-search-dialog]').open && document.querySelector('[data-global-search]').getAttribute('aria-expanded') === 'false'");
  assert.equal(await evaluate("document.activeElement.matches('[data-global-search-open]')"), true);
  assert.equal((await selection()).expanded, 'false');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
});

test("Feed creates two independent tasks in one page and shared controls keep readable dimensions", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor, navigate, command, sessionId, projectId, origin } = b;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId!, plugin_id: 'feed', actor_id: 'ui-test' });
  catalog.close();
  await command('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id=feed]');
  await evaluate(`{ const original = window.fetch; window.createdSources = []; window.fetch = async (url, options) => {
    const response = await original(url, options);
    if (options?.method === 'POST' && String(url).endsWith('/api/plugins/io.molis.work.feed/sources')) {
      window.createdSources.push((await response.clone().json()).source.source_id);
    }
    return response;
  }; }`);
  for (const [index, name] of ['设计观察', '独立的第二个任务'].entries()) {
    await click('[data-feed-source-rail] [data-feed-add-toggle]');
    await waitFor("document.querySelector('[data-feed-source-choices]').hidden === false");
    await click('[data-feed-choose-kind=custom_rss]');
    assert.equal(await evaluate("document.querySelector('[data-feed-add-name]').value"), '');
    assert.equal(await evaluate("document.querySelector('[data-feed-source-register]').disabled"), false);
    if (index === 0) {
      const metrics = await evaluate<{ font: number; height: number; border: number }>(`(() => {
        const trigger = document.querySelector('[data-feed-create-frequency]').parentElement.querySelector('[data-mw-select-trigger]');
        const style = getComputedStyle(trigger);
        return { font: parseFloat(style.fontSize), height: trigger.getBoundingClientRect().height, border: parseFloat(style.borderTopWidth) };
      })()`);
      assert.ok(metrics.font >= 13 && metrics.height >= 36 && metrics.border === 1, JSON.stringify(metrics));
      await click('[data-feed-create-frequency] + [data-mw-select-trigger]');
      const menu = await evaluate<{ font: number; height: number; bottom: number }>(`(() => {
        const item = document.querySelector('.mw-select-picker__menu:popover-open [data-mw-select-option]');
        const rect = item.parentElement.getBoundingClientRect();
        return { font: parseFloat(getComputedStyle(item).fontSize), height: item.getBoundingClientRect().height, bottom: rect.bottom };
      })()`);
      assert.ok(menu.font >= 13 && menu.height >= 32 && menu.bottom <= 768, JSON.stringify(menu));
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
      assert.equal(await evaluate("!document.querySelector('[data-feed-sources-dialog]').hidden"), true, 'Escape closes only the menu');
    }
    await evaluate(`{ document.querySelector('[data-feed-add-name]').value = ${JSON.stringify(name)};
      const url = document.querySelector('[data-feed-source-value=custom_rss]'); url.value = 'https://example.com/ui-${index}.xml';
    }`);
    await click('[data-feed-source-register]');
    await waitFor(`window.createdSources.length === ${index + 1} && document.querySelector('[data-feed-sources-dialog]').hidden && document.querySelector('[data-feed-source-rail] [data-feed-task="' + window.createdSources[${index}] + '"][aria-current=page]')`);
  }
  const ids = await evaluate<string[]>('window.createdSources');
  assert.equal(new Set(ids).size, 2);
  const feed = createLocalFeedApplication(b.store.db);
  assert.deepEqual(ids.map(id => feed.sources.get(DEMO_PROJECT_ID, id).name), ['设计观察', '独立的第二个任务']);
  assert.deepEqual(ids.map(id => feed.sources.get(DEMO_PROJECT_ID, id).schedule.mode), ['manual', 'manual']);
});

test("narrow settings reveal the chosen page and ignore a slower obsolete section", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor, navigate, command, sessionId, projectId, origin } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-personal-menu] [data-directory-open=settings]');
  await click('[data-directory-panel=settings] [data-settings-section=appearance]');
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"), false);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=settings]').closest('[inert]') === null"), true);
  await evaluate(`{ const original = window.fetch; window.fetch = async (url, options) => {
    const response = await original(url, options);
    // W3-10-1B-INTERLEAVE-01: UiRequest resolves the target to an absolute URL; hold the real response by its pathname.
    if (new URL(String(url), location.origin).pathname === '/settings/runtimes') {
      window.settingsResponseReady = true;
      await new Promise(resolve => { window.releaseSettingsResponse = resolve; });
    }
    return response;
  }; }`);
  await click('[data-directory-show]');
  await click('[data-directory-panel=settings] [data-settings-section=runtimes]');
  await waitFor('window.settingsResponseReady === true');
  await click('[data-directory-show]');
  await click('[data-directory-panel=settings] [data-settings-section=appearance]');
  await evaluate('window.releaseSettingsResponse()');
  await waitFor("!document.querySelector('[data-settings-loading]')");
  // Give the released fetch body and rendering tasks a chance to settle.
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(await evaluate("document.querySelector('[data-work-surface=settings] [data-settings-panel]').dataset.settingsPanel"), 'appearance');
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=settings] [aria-current=page]').dataset.settingsSection"), 'appearance');
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"), false);
  await click('[data-directory-show]');
  await click('[data-directory-open=project-settings]');
  await click('[data-directory-panel=project-settings] [data-settings-section=general]');
  await waitFor("document.querySelector('[data-work-surface=project-settings] [data-settings-panel=general]')");
  assert.equal(await evaluate("document.querySelector('[data-work-surface=project-settings]').closest('[inert]') === null"), true);
});


test("RAC-2800 RAC-2802: native search chords cross the Todo bridge without stealing handled or terminal input", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "todo");
  const store = openTodoStore(b.homeDirectory);
  const item = (() => { try { return store.create({ title: "Search from notes", notes: "Keep these notes", placement: "project" },
    { actor: "user", actorId: "web-user", projectId: b.projectId!, projectIds: [] }).item; } finally { store.close(); } })();
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=todo&openItem=${item!.id}` }, b.sessionId));
  const notes = '[data-todo-field=notes]';
  await child.waitFor(`document.querySelector('${notes}')?.value === 'Keep these notes'`);
  // Document bubble runs before the production window-bubble bridge; the final window observer runs after it.
  // On the unfixed bridge, final=false proves this delivered event was not consumed anywhere on that route.
  await child.evaluate(`(() => {
    window.searchKeys = [];
    const record = (event, phase) => { if (!['KeyK','KeyF'].includes(event.code)) return;
      window.searchKeys.push({phase, trusted:event.isTrusted, key:event.key, code:event.code, meta:event.metaKey, ctrl:event.ctrlKey,
        prevented:event.defaultPrevented, composing:event.isComposing, repeat:event.repeat,
        field:event.target.getAttribute('data-todo-field'), terminal:!!event.target.closest('[data-tui-pane],.xterm'), focused:document.activeElement===event.target}); };
    document.addEventListener('keydown', event => record(event, 'before-window'));
    window.addEventListener('keydown', event => record(event, 'after-bridge'));
  })()`);
  const press = async (code: string, modifiers = 4) => {
    for (const type of ['keyDown','keyUp']) await b.command('Input.dispatchKeyEvent', {type, code,
      key:code === 'Escape' ? 'Escape' : code.slice(3).toLowerCase(), modifiers,
      windowsVirtualKeyCode:code === 'Escape' ? 27 : code.charCodeAt(3)}, b.sessionId);
  };
  const state = "({open:document.querySelector('[data-global-search-dialog]').open, focused:document.activeElement===document.querySelector('[data-global-search]')})";
  const opened = "document.querySelector('[data-global-search-dialog]').open && document.activeElement===document.querySelector('[data-global-search]')";
  const closed = "!document.querySelector('[data-global-search-dialog]').open";
  await child.click(notes);
  const url = await b.evaluate('location.href');
  await press('KeyK');
  const receipt = await child.evaluate<Array<Record<string, unknown>>>('window.searchKeys');
  t.diagnostic('RAC-2800 native K receipt: ' + JSON.stringify(receipt));
  assert.deepEqual(receipt[0], {phase:'before-window',trusted:true,key:'k',code:'KeyK',meta:true,ctrl:false,
    prevented:false,composing:false,repeat:false,field:'notes',terminal:false,focused:true});
  try { await b.waitFor(opened, 2000); }
  catch (error) { assert.deepEqual(await b.evaluate(state), {open:true,focused:true}, 'RAC-2800 delivered native K must open and focus global search; receipt=' + JSON.stringify(receipt)); throw error; }
  assert.equal(receipt[1]?.prevented, true, 'the successful bridge consumes its own chord');
  await press('KeyK'); await b.waitFor(closed); // K keeps its toggle behavior in the shell.
  await child.click(notes); await press('KeyF'); await b.waitFor(opened);
  await b.evaluate("document.querySelector('[data-global-search-close]').focus()");
  await press('KeyF'); await b.waitFor(opened); // F focuses the same already-open dialog.
  await press('Escape', 0); await b.waitFor(closed);
  assert.equal(await b.evaluate('location.href'), url);
  assert.equal(await child.evaluate(`document.querySelector('${notes}').value`), 'Keep these notes');

  // RAC-2802: this fixture consumes a real event at document bubble, before the bridge's window listener.
  await child.evaluate(`(() => { window.consumedSearchKey = false;
    document.addEventListener('keydown', event => { if(event.code==='KeyK'){ event.preventDefault(); window.consumedSearchKey=event.isTrusted; } }, {once:true}); })()`);
  await child.click(notes); await press('KeyK');
  assert.equal(await child.evaluate('window.consumedSearchKey'), true);
  await b.evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  assert.equal(await b.evaluate(closed), true, 'a bridge-before handled native key remains handled');
  // A DOM-only terminal target checks selector exclusion; it does not claim a running terminal/Agent test.
  await child.evaluate(`(() => { const pane=document.createElement('div'); pane.dataset.tuiPane='';
    pane.style='position:fixed;inset:20px;z-index:99999;background:white'; pane.innerHTML='<textarea data-terminal-probe></textarea>'; document.body.append(pane); })()`);
  await child.click('[data-terminal-probe]'); await press('KeyK'); await press('KeyF');
  await b.evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  assert.equal(await b.evaluate(closed), true, 'terminal input must not reach search');
  const terminal = await child.evaluate<Array<{prevented:boolean;terminal:boolean;trusted:boolean}>>('window.searchKeys.slice(-4)');
  assert.ok(terminal.every(event => event.terminal && event.trusted && !event.prevented), JSON.stringify(terminal));
  await child.evaluate("document.querySelector('[data-tui-pane]').remove()");
  await child.click(notes);
  // Local synthetic state probes exercise composing/repeat, never substitute for the native positive path.
  await child.evaluate(`(() => { for (const state of [{repeat:true},{isComposing:true}]) document.activeElement.dispatchEvent(new KeyboardEvent('keydown',
    {key:'k',code:'KeyK',metaKey:true,bubbles:true,cancelable:true,...state})); })()`);
  await b.evaluate('new Promise(resolve => setTimeout(resolve, 100))');
  assert.equal(await b.evaluate(closed), true);
});
