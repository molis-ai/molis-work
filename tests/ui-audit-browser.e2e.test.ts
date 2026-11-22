import { addProjectPlugin } from "@molis-ai/molis-work-test-kit/local-host-http";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

const SHOTS = "/tmp/molis-ui-audit-2026-09-22";
// Split panes live in the one workbench document (no nested pane iframes since batch 102-1); the content a pane shows
// carries its pane key ("plugin:<id>").
const PANE_STATE = `[...document.querySelectorAll('[data-tab-pane]')].map(pane => ({
  surface: [...pane.querySelectorAll('[data-pane-key]')].filter(node => node.checkVisibility({visibilityProperty:true}) && !node.parentElement?.closest('[data-pane-key]'))
    .map(node => node.dataset.paneKey.replace(/^plugin:/, '')).join(','),
  homeHidden: pane.querySelector('[data-work-surface=home]')?.hidden ?? null
}))`;
const TWO_PANES = "document.querySelectorAll('[data-tab-pane]').length === 2 && document.querySelectorAll('iframe.tab-content-frame').length === 0";
const TOKEN = "goals-risk-test-control-token-0123456789";

test("UI audit fixes hold in an isolated workbench", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {}, undefined, undefined,
    true);
  if (!browser) return;
  const { command, sessionId, evaluate, click, waitFor, navigate, origin, projectId, reloadPage } = browser;
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const inboxView = await pluginFrameBrowser(t, browser, "inbox");
  await addProjectPlugin(browser.web, projectId!, "feed");

  const source = createLocalFeedSourceService(browser.store.db, DEMO_PROJECT_ID).register({ kind: "web_query", query: "界面修复" }).source;
  const item = createLocalFeedApplication(browser.store.db).ingestItem({
    source,
    externalId: "ui-audit-title",
    title: "这是一条用来核对 Inbox 详情标题宽度的很长的中文标题，它应该顺着详情栏换行，而不是被压成一道窄栏",
    summary: "标题宽度核对",
    body: "原消息保留。",
    occurredAt: new Date().toISOString(),
    attention: false,
  }).item;
  const headers = {
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": TOKEN,
  };
  const inbox = await fetch(`${origin}/projects/${projectId}/api/plugins/io.molis.work.feed/items/${item.item_id}/inbox`, {
    method: "POST",
    headers: { ...headers, "x-molis-work-idempotency-key": "ui-audit-inbox" },
    body: JSON.stringify({ expected_revision: item.revision }),
  });
  assert.equal(inbox.status, 200, await inbox.text());
  const createPage = async (title: string, starred: boolean, key: string) => {
    const response = await fetch(`${origin}/projects/${projectId}/api/plugins/io.molis.work.pages/pages`, {
      method: "POST",
      headers: { ...headers, "x-molis-work-idempotency-key": key },
      body: JSON.stringify({ title, starred }),
    });
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return JSON.parse(text) as { document: { id: string } };
  };
  const first = await createPage("Jev 的三个待验证问题", true, "ui-audit-page-starred");
  const second = await createPage("Jev 的三个待验证问题", false, "ui-audit-page-plain");
  assert.notEqual(first.document.id, second.document.id);

  const shot = async (name: string) => {
    await mkdir(SHOTS, { recursive: true });
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(SHOTS, name), Buffer.from(data, "base64"));
  };
  const size = (width: number, height: number) => command("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, sessionId);

  await size(1280, 800);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home'");
  // Public DOM hooks survive minification; the checks below exercise each behavior in the served page.
  const client = await (await fetch(`${origin}/assets/molis-work-workbench.js`)).text();
  assert.match(client, /data-pane-embedded/);
  assert.match(client, /data-inbox-row/);
  assert.match(client, /workspace-layout-menu/);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goals'");
  await click("[data-layout-open]");
  await click('[data-layout-split="right"]');
  await waitFor(`${TWO_PANES} && ${PANE_STATE}.every(pane => pane.surface === 'goals')`, 15_000);
  const panes = await evaluate<{ surface: string; homeHidden: boolean | null }[]>(PANE_STATE);
  assert.deepEqual(panes.map((pane) => pane.surface), ["goals", "goals"], JSON.stringify(panes));
  assert.ok(panes.every((pane) => pane.homeHidden !== false), JSON.stringify(panes));
  await shot("01-goals-split-1280x800.png");
  await click("[data-layout-open]");
  await click('[data-layout-action="close"]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 10_000);
  const afterClose = await evaluate<{ surface: string; paneSurfaces: string[] }>(`({
    surface: document.body.dataset.desktopSurface,
    paneSurfaces: ${PANE_STATE}.map(pane => pane.surface)
  })`);
  assert.equal(afterClose.surface, "goals");
  assert.deepEqual(afterClose.paneSurfaces, ["goals"], JSON.stringify(afterClose));

  const splitPlugin = async (plugin: string, surface: string, file: string) => {
    await click(`[data-plugin-strip] [data-plugin-id="${plugin}"]`);
    await waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(surface)}`, 10_000);
    await click("[data-layout-open]");
    await click('[data-layout-split="right"]');
    await waitFor(`${TWO_PANES} && ${PANE_STATE}.every(pane => pane.surface === ${JSON.stringify(surface)})`, 15_000);
    const state = await evaluate<{ surface: string; homeHidden: boolean | null }[]>(PANE_STATE);
    assert.deepEqual(state.map((pane) => pane.surface), [surface, surface], JSON.stringify(state));
    assert.ok(state.every((pane) => pane.homeHidden !== false), JSON.stringify(state));
    await shot(file);
    await click("[data-layout-open]");
    await click('[data-layout-action="close"]');
    await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 10_000);
  };
  await splitPlugin("feed", "feed", "01-feed-split-1280x800.png");
  await splitPlugin("inbox", "inbox", "01-inbox-split-1280x800.png");

  await size(1024, 340);
  await click("[data-layout-open]");
  await waitFor("document.querySelector('[data-workspace-layout]')?.matches(':popover-open')");
  const menu = await evaluate<{ top: number; bottom: number; client: number; scroll: number; maxHeight: string }>(`(() => {
    const node = document.querySelector('[data-workspace-layout]');
    const rect = node.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, client: node.clientHeight, scroll: node.scrollHeight, maxHeight: getComputedStyle(node).maxHeight };
  })()`);
  assert.ok(menu.top >= 0, JSON.stringify(menu));
  assert.ok(menu.bottom <= 340 + 1, JSON.stringify(menu));
  await shot("08-layout-menu-1024x340.png");
  await evaluate("document.querySelector('[data-workspace-layout]').hidePopover()");

  await size(1920, 902);
  await reloadPage();
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await inboxView.waitFor("document.querySelectorAll('[data-inbox-row]').length > 0");
  const tabs = await inboxView.evaluate<number[]>(`[...document.querySelectorAll('[data-inbox-row]')].filter(row => row.getClientRects().length).map(row => row.tabIndex)`);
  assert.ok(tabs.length > 0);
  assert.ok(tabs.every((tabIndex) => tabIndex === 0), JSON.stringify(tabs));
  await inboxView.evaluate("[...document.querySelectorAll('[data-inbox-row]')].find(row => row.textContent.includes('Inbox 详情标题宽度'))?.click()");
  await inboxView.waitFor("document.querySelector('[data-inbox-detail]:not([hidden]) h1')");
  // An active entry's visible title is Inbox's own presentation chip; the h1 keeps the same words for screen readers only.
  // VISIBLE_TITLE picks the chip's tag when there is one, else the h1; TITLE_TEXT is the element holding the words.
  // "header" is the header's content width: the title should take the whole line inside its padding, not a narrow strip.
  const VISIBLE_TITLE = "(h1 => h1.closest('.mw-detail-header').querySelector('.inbox-object-title .mw-presentation__tag') ?? h1)";
  const TITLE_TEXT = "(shown => shown.querySelector(':scope > strong') ?? shown)";
  const title = await inboxView.evaluate<{ h1: number; header: number; maxWidth: string; overflow: boolean; spoken: boolean }>(`(() => {
    const h1 = document.querySelector('[data-inbox-detail]:not([hidden]) h1');
    const header = h1.closest('.mw-detail-header'), shown = ${VISIBLE_TITLE}(h1), text = ${TITLE_TEXT}(shown);
    const box = shown.getBoundingClientRect();
    return { h1: box.width, header: header.clientWidth - parseFloat(getComputedStyle(header).paddingLeft) - parseFloat(getComputedStyle(header).paddingRight), maxWidth: getComputedStyle(shown).maxWidth, overflow: text.scrollWidth > text.clientWidth + 1,
      spoken: h1.textContent.trim() === text.textContent.trim() };
  })()`);
  assert.ok(title.spoken, "the heading carries the shown title");
  assert.equal(title.maxWidth, "none");
  assert.ok(title.h1 > 500, JSON.stringify(title));
  assert.ok(title.h1 > title.header * 0.9, JSON.stringify(title));
  assert.equal(title.overflow, false);
  await shot("05-inbox-title-1920x902.png");
  const titleAt = async (width: number, height: number, file: string) => {
    await size(width, height);
    await inboxView.waitFor("document.querySelector('[data-inbox-detail]:not([hidden]) h1')");
    const box = await inboxView.evaluate<{ h1: number; header: number; maxWidth: string; overflow: boolean; lines: number }>(`(() => {
      const h1 = document.querySelector('[data-inbox-detail]:not([hidden]) h1');
      const header = h1.closest('.mw-detail-header'), shown = ${VISIBLE_TITLE}(h1), text = ${TITLE_TEXT}(shown);
      const style = getComputedStyle(text);
      return {
        h1: shown.getBoundingClientRect().width,
        header: header.clientWidth - parseFloat(getComputedStyle(header).paddingLeft) - parseFloat(getComputedStyle(header).paddingRight),
        maxWidth: getComputedStyle(shown).maxWidth,
        overflow: text.scrollWidth > text.clientWidth + 1,
        lines: Math.round(text.getBoundingClientRect().height / parseFloat(style.lineHeight))
      };
    })()`);
    assert.equal(box.maxWidth, "none", JSON.stringify(box));
    assert.equal(box.overflow, false, JSON.stringify(box));
    assert.ok(box.h1 > box.header * 0.9, JSON.stringify(box));
    assert.ok(box.h1 > 180, JSON.stringify(box));
    await shot(file);
    return box;
  };
  await titleAt(960, 800, "05-inbox-title-960x800.png");
  await titleAt(640, 800, "05-inbox-title-640x800.png");

  // At 640 the plugins open from ＋, the start page that lists every one of them (WLN-16); the old rail is not shown.
  await click("[data-plugin-picker-toggle]");
  await waitFor("!document.querySelector('[data-plugin-picker-popover]').hidden");
  await click('[data-plugin-picker-popover] .plugin-rail-items [data-plugin-id="pages"]');
  await pages.waitFor("document.querySelectorAll('button.mw-stage-entry[data-page-id]').length >= 2");
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open");
  await evaluate(`(() => { const input = document.querySelector('[data-global-search]'); input.value = 'Jev 的三个待验证问题'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-global-search-hit]').length >= 2");
  const hits = await evaluate<string[]>(`[...document.querySelectorAll('[data-global-search-hit]')].map(hit => hit.dataset.globalSearchId)`);
  assert.equal(new Set(hits).size, hits.length);
  assert.equal(hits.filter((id) => id === first.document.id || id === second.document.id).length, 2);
  await shot("04-pages-search.png");
  await evaluate("document.querySelector('[data-global-search-dialog]').close()");
  await pages.evaluate(`document.querySelector('button.mw-stage-entry[data-page-id="${first.document.id}"]').click()`);
  await pages.waitFor("document.querySelector('[data-pages-more]')");
  await pages.click("[data-pages-more]");
  await pages.waitFor("document.querySelector('[data-pages-more]').getAttribute('aria-expanded') === 'true'");
  await pages.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await pages.waitFor("document.querySelector('[data-pages-more]').getAttribute('aria-expanded') === 'false'");
  assert.equal(await pages.evaluate("document.querySelector('[data-pages-more-menu]').hidden"), true);
  assert.equal(await pages.evaluate("document.activeElement === document.querySelector('[data-pages-more]')"), true);
  await shot("06-pages-more-after-escape.png");
});
