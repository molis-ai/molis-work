import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const SHOTS = "/tmp/molis-ui-audit-2026-09-22";
const TOKEN = "goals-risk-test-control-token-0123456789";

test("UI audit fixes hold in an isolated workbench", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, click, waitFor, navigate, origin, projectId, reloadPage } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: browser.homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "feed", actor_id: "ui-audit" });
  catalog.close();
  const source = createLocalFeedSourceService(browser.store.db, DEMO_BOARD_ID).register({ kind: "web_query", query: "界面修复" }).source;
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
  const inbox = await fetch(`${origin}/projects/${projectId}/api/feed/items/${item.item_id}/inbox`, {
    method: "POST",
    headers: { ...headers, "x-molis-work-idempotency-key": "ui-audit-inbox" },
    body: JSON.stringify({ expected_revision: item.revision }),
  });
  assert.equal(inbox.status, 200, await inbox.text());
  const createPage = async (title: string, starred: boolean, key: string) => {
    const response = await fetch(`${origin}/projects/${projectId}/api/pages`, {
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
  const client = await (await fetch(`${origin}/assets/molis-work-workbench.js`)).text();
  assert.match(client, /isEmbedded/);
  assert.match(client, /syncInboxRowTab/);
  assert.match(client, /placeLayoutMenu/);
  const stylesheet = await (await fetch(`${origin}/assets/molis-work-workbench.css`)).text();
  assert.match(stylesheet, /\[data-inbox-workbench\] \.inbox-reference-detail > \.feed-detail-header h1 \{ width: 100%; max-width: none; \}/);
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal'");
  await click("[data-tab-split]");
  await click('[data-layout-split="right"]');
  await waitFor("document.querySelectorAll('iframe.tab-content-frame').length === 2", 15_000);
  let paneState = "";
  const paneDeadline = Date.now() + 15_000;
  while (Date.now() < paneDeadline) {
    paneState = await evaluate<string>(`JSON.stringify([...document.querySelectorAll('iframe.tab-content-frame')].map(frame => ({
      plugin: new URL(frame.src).searchParams.get('panePlugin'),
      ready: frame.contentDocument?.readyState || '',
      surface: frame.contentDocument?.body?.dataset.desktopSurface || '',
      embedded: frame.contentDocument?.body?.dataset.paneEmbedded || ''
    })))`);
    const panes = JSON.parse(paneState) as { surface: string }[];
    if (panes.length === 2 && panes.every((pane) => pane.surface === "goal")) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.match(paneState, /"surface":"goal".*"surface":"goal"/, paneState);
  const panes = await evaluate<{ plugin: string | null; surface: string | undefined; homeHidden: boolean | undefined }[]>(`[...document.querySelectorAll('iframe.tab-content-frame')].map(frame => ({
    plugin: new URL(frame.src).searchParams.get('panePlugin'),
    surface: frame.contentDocument?.body?.dataset.desktopSurface,
    homeHidden: frame.contentDocument?.querySelector('[data-work-surface=home]')?.hidden,
  }))`);
  assert.deepEqual(panes.map((pane) => pane.plugin), ["goals", "goals"]);
  assert.deepEqual(panes.map((pane) => pane.surface), ["goal", "goal"]);
  assert.ok(panes.every((pane) => pane.homeHidden !== false));
  await shot("01-goals-split-1280x800.png");
  await click("[data-tab-split]");
  await click('[data-layout-action="close"]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 10_000);
  const afterClose = await evaluate<{ surface: string; frameSurfaces: string[] }>(`({
    surface: document.body.dataset.desktopSurface,
    frameSurfaces: [...document.querySelectorAll('iframe.tab-content-frame')].filter(frame => !frame.hidden).map(frame => frame.contentDocument?.body?.dataset.desktopSurface || '')
  })`);
  assert.equal(afterClose.surface, "goal");
  assert.ok(afterClose.frameSurfaces.every((surface) => surface === "goal"), JSON.stringify(afterClose));

  const splitPlugin = async (plugin: string, surface: string, file: string) => {
    await click(`[data-plugin-strip] [data-plugin-id="${plugin}"]`);
    await waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(surface)}`, 10_000);
    await click("[data-tab-split]");
    await click('[data-layout-split="right"]');
    await waitFor("document.querySelectorAll('iframe.tab-content-frame').length === 2", 15_000);
    let state = "";
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      state = await evaluate<string>(`JSON.stringify([...document.querySelectorAll('iframe.tab-content-frame')].map(frame => ({
        plugin: new URL(frame.src).searchParams.get('panePlugin'),
        surface: frame.contentDocument?.body?.dataset.desktopSurface || '',
        homeHidden: frame.contentDocument?.querySelector('[data-work-surface=home]')?.hidden ?? null
      })))`);
      const frames = JSON.parse(state) as { plugin: string; surface: string; homeHidden: boolean | null }[];
      if (frames.length === 2 && frames.every((frame) => frame.surface === surface && frame.plugin === plugin && frame.homeHidden !== false)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const frames = JSON.parse(state) as { plugin: string; surface: string; homeHidden: boolean | null }[];
    assert.deepEqual(frames.map((frame) => frame.plugin), [plugin, plugin], state);
    assert.deepEqual(frames.map((frame) => frame.surface), [surface, surface], state);
    assert.ok(frames.every((frame) => frame.homeHidden !== false), state);
    await shot(file);
    await click("[data-tab-split]");
    await click('[data-layout-action="close"]');
    await waitFor("document.querySelectorAll('[data-tab-pane]').length === 1", 10_000);
  };
  await splitPlugin("feed", "feed", "01-feed-split-1280x800.png");
  await splitPlugin("inbox", "inbox", "01-inbox-split-1280x800.png");

  await size(1024, 340);
  await click("[data-tab-split]");
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
  await waitFor("document.querySelectorAll('[data-inbox-row]').length > 0");
  const tabs = await evaluate<number[]>(`[...document.querySelectorAll('[data-inbox-row]')].filter(row => row.getClientRects().length).map(row => row.tabIndex)`);
  assert.ok(tabs.length > 0);
  assert.ok(tabs.every((tabIndex) => tabIndex === 0), JSON.stringify(tabs));
  await evaluate("[...document.querySelectorAll('[data-inbox-row]')].find(row => row.textContent.includes('Inbox 详情标题宽度'))?.click()");
  await waitFor("document.querySelector('[data-inbox-detail]:not([hidden]) h1')");
  const title = await evaluate<{ h1: number; header: number; maxWidth: string; overflow: boolean }>(`(() => {
    const h1 = document.querySelector('[data-inbox-detail]:not([hidden]) h1');
    const header = h1.closest('.feed-detail-header');
    const box = h1.getBoundingClientRect();
    return { h1: box.width, header: header.getBoundingClientRect().width, maxWidth: getComputedStyle(h1).maxWidth, overflow: h1.scrollWidth > h1.clientWidth + 1 };
  })()`);
  assert.equal(title.maxWidth, "none");
  assert.ok(title.h1 > 500, JSON.stringify(title));
  assert.ok(title.h1 > title.header * 0.9, JSON.stringify(title));
  assert.equal(title.overflow, false);
  await shot("05-inbox-title-1920x902.png");
  const titleAt = async (width: number, height: number, file: string) => {
    await size(width, height);
    await waitFor("document.querySelector('[data-inbox-detail]:not([hidden]) h1')");
    const box = await evaluate<{ h1: number; header: number; maxWidth: string; overflow: boolean; lines: number }>(`(() => {
      const h1 = document.querySelector('[data-inbox-detail]:not([hidden]) h1');
      const header = h1.closest('.feed-detail-header');
      const style = getComputedStyle(h1);
      return {
        h1: h1.getBoundingClientRect().width,
        header: header.getBoundingClientRect().width,
        maxWidth: style.maxWidth,
        overflow: h1.scrollWidth > h1.clientWidth + 1,
        lines: Math.round(h1.getBoundingClientRect().height / parseFloat(style.lineHeight))
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

  await click('[data-plugin-strip] [data-plugin-id="pages"]');
  await waitFor("document.querySelectorAll('button.feed-stage-entry[data-page-id]').length >= 2");
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open");
  await evaluate(`(() => { const input = document.querySelector('[data-global-search]'); input.value = 'Jev 的三个待验证问题'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-global-search-hit]').length >= 2");
  const hits = await evaluate<string[]>(`[...document.querySelectorAll('[data-global-search-hit]')].map(hit => hit.dataset.globalSearchId)`);
  assert.equal(new Set(hits).size, hits.length);
  assert.equal(hits.filter((id) => id === first.document.id || id === second.document.id).length, 2);
  await shot("04-pages-search.png");
  await evaluate("document.querySelector('[data-global-search-dialog]').close()");
  await evaluate(`document.querySelector('button.feed-stage-entry[data-page-id="${first.document.id}"]').click()`);
  await waitFor("document.querySelector('[data-pages-more]')");
  await click("[data-pages-more]");
  await waitFor("document.querySelector('[data-pages-more]').getAttribute('aria-expanded') === 'true'");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))");
  await waitFor("document.querySelector('[data-pages-more]').getAttribute('aria-expanded') === 'false'");
  assert.equal(await evaluate("document.querySelector('[data-pages-more-menu]').hidden"), true);
  assert.equal(await evaluate("document.activeElement === document.querySelector('[data-pages-more]')"), true);
  await shot("06-pages-more-after-escape.png");
});
