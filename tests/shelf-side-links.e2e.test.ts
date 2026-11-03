import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_STORE_NAME, AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2'-2 (specs/context-program §21.6): `openPlugin`, a search hit's `open.surface` and an Assistant notice's `open` name a
// plugin, and the workbench opens it where its declarations put it. Shelf has only a side view, so the three values stored
// before Shelf left the work area — the action's link (Workflows' arrival href), the search index's `open_json` and the
// Assistant's notice — still land on the one item, in Shelf's side tab. None of them is rewritten.

const SHELF_TAB = "plugin:shelf/side";
const shelfFrame = `document.querySelector('[data-side-body="${SHELF_TAB}"] iframe')`;

test("SHELF-LINK-01 SHELF-LINK-02 SHELF-LINK-03 a stored link, search hit and notice that name Shelf open its side tab on that item", { timeout: 120_000 }, async (t) => {
  const agentSetting = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  t.after(() => { if (agentSetting === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = agentSetting; });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "shelf", `[data-side-body="${SHELF_TAB}"] iframe`);
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')");
  const item = await evaluate<{ item_id: string; name: string } | null>(`fetch(${JSON.stringify(`/projects/${projectId}/api/plugins/io.molis.work.shelf/`)}, { cache: "no-store" })
    .then((response) => response.json()).then((shelf) => (shelf.materials || []).find((row) => row.name === "试用示例.pdf") || null)`);
  assert.ok(item, "the sample material is on the shelf");
  const landed = async (why: string) => {
    await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('#side-panel [role=tab][aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(SHELF_TAB)}`, 8_000);
    await child.waitFor(`document.querySelector('[data-shelf-item].is-on')?.dataset.shelfItem === ${JSON.stringify(item.item_id)}`, 10_000);
    assert.equal(await evaluate("document.querySelector('[data-work-surface=shelf], [data-tab-workspace] [data-tab-plugin=shelf]')"), null, `${why}: nothing of Shelf opens in the work area`);
  };
  const closePanel = async () => {
    await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
    await waitFor("document.body.dataset.sideOpen === 'false'");
  };

  // SHELF-LINK-01: the link `shelf.items.admit` declares (what Workflows' arrival kept), filled as the Host fills it.
  const template = shelfActions.admit.action.result_view?.link?.href_template;
  assert.ok(template);
  const href = template.replace("{project_id}", encodeURIComponent(projectId)).replace("{/item/item_id}", encodeURIComponent(item.item_id)).replace("{/item/name}", encodeURIComponent(item.name));
  await navigate(() => command("Page.navigate", { url: origin + href }, sessionId));
  await landed("the stored link");
  assert.equal(await evaluate("new URLSearchParams(location.search).has('openPlugin') || new URLSearchParams(location.search).has('openItem')"), false, "the link's parameters are spent");
  await closePanel();

  // SHELF-LINK-02: a search hit whose stored `open` is `{ surface: "shelf", id }`.
  await click("[data-global-search-open]");
  await waitFor("document.querySelector('[data-global-search-dialog]').open");
  await evaluate(`{ const input = document.querySelector('[data-global-search]'); input.value = '试用示例'; input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await waitFor(`document.querySelector('[data-global-search-hit][data-global-search-id=${JSON.stringify(item.item_id)}]')`, 15_000);
  await click(`[data-global-search-hit][data-global-search-id=${JSON.stringify(item.item_id)}]`);
  await landed("the search hit");
  await closePanel();

  // SHELF-LINK-03 (QA-018): an Assistant notice whose stored `open` names Shelf. Nothing in the product raises such a notice any more
  // (the only notices that carry an `open` are due reminders, and the only provider of those names the Todo plugin), so this is
  // the legacy stored row the spec means: written once, with the Host's own notice store and writer (`AssistantStore.raiseNotice`,
  // the person's actor, the same row shape a due reminder has), and from there only the product is used. Nothing below sends a
  // notice event to the page or un-hides the bell.
  const dedupe = "reminder:legacy-shelf:shelf-link-03";
  const seeded = (() => {
    const db = openHomeSqliteDatabase(homeDirectory, ASSISTANT_STORE_NAME);
    try {
      return new AssistantStore(db).raiseNotice(LOCAL_PERSON_ACTOR_ID, { kind: "reminder", work_id: "", work_title: "Shelf", text: `提醒（Shelf · 09:00）：${item.name}`,
        open: { surface: "shelf", id: item.item_id, title: item.name, project_id: projectId } }, dedupe);
    } finally { db.close(); }
  })();
  assert.ok(seeded, "the stored notice was written");
  // It is queryable through the Host's own notices API, exactly as stored.
  const listed = () => evaluate<Array<{ notice_id: string; kind: string; open?: unknown }>>(`fetch(document.body.dataset.routePrefix + '/api/assistant/notices', { headers: molisWorkControlHeaders(), cache: 'no-store' }).then((r) => r.json()).then((body) => body.notices)`);
  // A person comes back to the page: its attention read picks the notice up and the bell shows by itself.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')");
  if (await evaluate("document.body.dataset.sideOpen === 'true'")) await closePanel();
  assert.notEqual(await evaluate("document.body.dataset.sideOpen"), "true", "the side panel starts closed, so only the notice can open it");
  const stored = (await listed()).find((one) => one.notice_id === seeded.notice_id);
  assert.ok(stored, "the notices API lists the stored notice");
  assert.equal(stored.kind, "reminder");
  assert.deepEqual(stored.open, { surface: "shelf", id: item.item_id, title: item.name, project_id: projectId }, "with the `open` it was stored with");
  const bell = "[data-assistant-attention]";
  await waitFor(`!document.querySelector(${JSON.stringify(bell)}).hidden && document.querySelector(${JSON.stringify(bell)}).checkVisibility()`, 30_000);
  assert.match(String(await evaluate(`document.querySelector(${JSON.stringify(bell)}).getAttribute('aria-label')`)), /^等你处理 · \d+$/, "the bell counts the notices that wait");
  // The main area as it is before the notice is opened.
  const mainArea = `({ surface: document.body.dataset.desktopSurface ?? null, tabs: [...document.querySelectorAll('[data-titlebar-tabs] [data-tab-id]')].map((tab) => tab.textContent.trim() + ':' + String(tab.hasAttribute('aria-current'))),
    shelf: Boolean(document.querySelector('[data-work-surface=shelf], [data-titlebar-tabs] [data-plugin=shelf]')) })`;
  const before = await evaluate<object>(mainArea);
  // As a person does: the bell, then the notice's own 打开 button.
  await click(bell);
  const open = `[data-assistant-notices]:not([hidden]) [data-notice-id=${JSON.stringify(seeded.notice_id)}][data-notice-action="open"]`;
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(open)}))`, 10_000);
  assert.match(String(await evaluate(`document.querySelector(${JSON.stringify(open)}).closest('.assistant-notice').textContent`)), new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the list shows the notice's words");
  await click(open);
  await landed("the Assistant notice");
  assert.deepEqual(await evaluate(mainArea), before, "the main area is as it was: same surface, same tabs, nothing of Shelf in it");
  // Opened, the notice is settled by the product itself: it leaves the API and the bell goes.
  await waitFor(`fetch(document.body.dataset.routePrefix + '/api/assistant/notices', { headers: molisWorkControlHeaders(), cache: 'no-store' }).then((r) => r.json()).then((body) => !body.notices.some((one) => one.notice_id === ${JSON.stringify(seeded.notice_id)}))`, 10_000);
  await waitFor(`document.querySelector(${JSON.stringify(bell)}).hidden`, 30_000);
});

test("SIDE-FWD-01 a side view's placement events reach the page; an unlisted event stays in the view", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "shelf", `[data-side-body="${SHELF_TAB}"] iframe`);
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-side-toggle]");
  await child.waitFor("document.querySelector('[data-shelf-stage-shell]')", 10_000);
  await waitFor(`document.querySelector('[data-side-body="${SHELF_TAB}"] iframe')?.contentDocument?.querySelector('[data-work-surface=shelf]')?.dataset.uiClientState === 'ready'`);
  await evaluate(`(() => {
    window.__heard = [];
    for (const name of ['molis:placement-result', 'molis:placement-request', 'molis:not-forwarded']) addEventListener(name, (event) => window.__heard.push([name, event.detail && event.detail.title]));
  })()`);
  await child.evaluate(`(() => {
    window.dispatchEvent(new CustomEvent('molis:placement-result', { detail: { verb: 'failed', title: '从侧栏来的', note: 'side view' } }));
    window.dispatchEvent(new CustomEvent('molis:not-forwarded', { detail: { title: 'never' } }));
  })()`);
  await waitFor("window.__heard.length >= 1 && document.querySelector('.placement-toast')");
  assert.match(String(await evaluate("document.querySelector('.placement-toast').textContent")), /从侧栏来的/, "the page's card shows what the side view reported");
  assert.deepEqual(await evaluate("window.__heard"), [["molis:placement-result", "从侧栏来的"]], "only the listed event crossed");
});
