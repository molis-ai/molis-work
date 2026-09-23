import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

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
    if (options?.method === 'POST' && String(url).endsWith('/api/feed/sources')) {
      window.createdSources.push((await response.clone().json()).source.source_id);
    }
    return response;
  }; }`);
  for (const [index, name] of ['设计观察', '独立的第二个任务'].entries()) {
    await click('[data-feed-stage-chrome] [data-feed-add-toggle]');
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
      assert.equal(await evaluate("document.querySelector('[data-feed-sources-dialog]').open"), true, 'Escape closes only the menu');
    }
    await evaluate(`{ document.querySelector('[data-feed-add-name]').value = ${JSON.stringify(name)};
      const url = document.querySelector('[data-feed-source-value=custom_rss]'); url.value = 'https://example.com/ui-${index}.xml';
    }`);
    await click('[data-feed-source-register]');
    await waitFor(`window.createdSources.length === ${index + 1} && !document.querySelector('[data-feed-sources-dialog]').open && document.querySelector('[data-feed-task="' + window.createdSources[${index}] + '"] summary[aria-current=page]')`);
  }
  const ids = await evaluate<string[]>('window.createdSources');
  assert.equal(new Set(ids).size, 2);
  const feed = createLocalFeedApplication(b.store.db);
  assert.deepEqual(ids.map(id => feed.getSource(DEMO_BOARD_ID, id).name), ['设计观察', '独立的第二个任务']);
  assert.deepEqual(ids.map(id => feed.getSource(DEMO_BOARD_ID, id).schedule.mode), ['manual', 'manual']);
});

test("narrow settings reveal the chosen page and ignore a slower obsolete section", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { click, evaluate, waitFor, navigate, command, sessionId, projectId, origin } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-directory-show]');
  await click('[data-plugin-strip] [data-directory-open=settings]');
  await click('[data-directory-panel=settings] [data-settings-section=appearance]');
  assert.equal(await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"), false);
  assert.equal(await evaluate("document.querySelector('[data-work-surface=settings]').closest('[inert]') === null"), true);
  await evaluate(`{ const original = window.fetch; window.fetch = async (url, options) => {
    const response = await original(url, options);
    if (String(url).startsWith('/settings/runtimes')) {
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
