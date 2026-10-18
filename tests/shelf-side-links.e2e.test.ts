import assert from "node:assert/strict";
import test from "node:test";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2'-2 (specs/context-program §21.6): `openPlugin`, a search hit's `open.surface` and an Assistant notice's `open` name a
// plugin, and the workbench opens it where its declarations put it. Shelf has only a side view, so the three values stored
// before Shelf left the work area — the action's link (Workflows' arrival href), the search index's `open_json` and the
// Assistant's notice — still land on the one item, in Shelf's side tab. None of them is rewritten.

const SHELF_TAB = "plugin:shelf/side";
const shelfFrame = `document.querySelector('[data-side-body="${SHELF_TAB}"] iframe')`;

test("SHELF-LINK-01 SHELF-LINK-02 SHELF-LINK-03 a stored link, search hit and notice that name Shelf open its side tab on that item", { timeout: 120_000 }, async (t) => {
  const agentSetting = process.env.MOLIS_WORK_SHELF_AGENT;
  process.env.MOLIS_WORK_SHELF_AGENT = "off";
  t.after(() => { if (agentSetting === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT; else process.env.MOLIS_WORK_SHELF_AGENT = agentSetting; });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-side-toggle]')");
  const item = await evaluate<{ item_id: string; name: string } | null>(`fetch(${JSON.stringify(`/projects/${projectId}/api/shelf`)}, { cache: "no-store" })
    .then((response) => response.json()).then((shelf) => (shelf.materials || []).find((row) => row.name === "试用示例.pdf") || null)`);
  assert.ok(item, "the sample material is on the shelf");
  const landed = async (why: string) => {
    await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('#side-panel [role=tab][aria-selected=true]')?.dataset.sideTab === ${JSON.stringify(SHELF_TAB)}`, 8_000);
    await waitFor(`${shelfFrame}?.contentDocument?.querySelector('[data-shelf-item].is-on')?.dataset.shelfItem === ${JSON.stringify(item.item_id)}`, 10_000);
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

  // SHELF-LINK-03: an Assistant notice whose stored `open` names Shelf, as the page's attention read hands it over.
  const notice = { notice_id: "shelf-link-notice", work_id: "work-shelf-link", kind: "material", text: "材料已经放进 Shelf", created_at: new Date().toISOString(),
    open: { surface: "shelf", id: item.item_id, title: item.name, project_id: projectId } };
  await evaluate(`document.dispatchEvent(new CustomEvent('molis-work:attention', { detail: { notices: [${JSON.stringify(notice)}] } }))`);
  if (await evaluate("document.querySelector('[data-assistant-notices]').hidden")) await click("[data-assistant-attention]");
  await waitFor(`document.querySelector('[data-assistant-notices] [data-notice-id="shelf-link-notice"][data-notice-action="open"]')?.getClientRects().length > 0`);
  await click(`[data-assistant-notices] [data-notice-id="shelf-link-notice"][data-notice-action="open"]`);
  await landed("the Assistant notice");
});

test("SIDE-FWD-01 a side view's placement events reach the page; an unlisted event stays in the view", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-side-toggle]");
  await waitFor(`${shelfFrame}?.contentDocument?.querySelector('[data-shelf-stage-shell]')`, 10_000);
  await evaluate(`(() => {
    window.__heard = [];
    for (const name of ['molis:placement-result', 'molis:placement-request', 'molis:not-forwarded']) addEventListener(name, (event) => window.__heard.push([name, event.detail && event.detail.title]));
    const view = ${shelfFrame}.contentWindow;
    view.dispatchEvent(new view.CustomEvent('molis:placement-result', { detail: { verb: 'failed', title: '从侧栏来的', note: 'side view' } }));
    view.dispatchEvent(new view.CustomEvent('molis:not-forwarded', { detail: { title: 'never' } }));
  })()`);
  await waitFor("window.__heard.length >= 1 && document.querySelector('.placement-toast')");
  assert.match(String(await evaluate("document.querySelector('.placement-toast').textContent")), /从侧栏来的/, "the page's card shows what the side view reported");
  assert.deepEqual(await evaluate("window.__heard"), [["molis:placement-result", "从侧栏来的"]], "only the listed event crossed");
});
