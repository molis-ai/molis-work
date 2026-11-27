import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

const GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("../plugins/native/goals/dist/document-bundle.js", import.meta.url), "utf8");
const GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT = readFileSync(new URL("../plugins/native/goals/dist/event-document-bundle.js", import.meta.url), "utf8");

test("Goal document tabs retry lazy loading, restore selection, and keep the current event document", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, before, sessionId, command, evaluate, waitFor, click, reloadPage, openGoalWork } = browser;
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.navigate", { url: origin + "/goals/V1" }, sessionId);
  await command("Page.bringToFront", {}, sessionId);
  const dom = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  await waitFor("document.readyState === 'complete' && " + dom("[data-goal-event-document]"));
  // A Goal opens on its Frame tab; the event document lives in its workspace view.
  await openGoalWork();
  assert.equal(await evaluate(dom("[data-goal-event-document]") + ".dataset.goalView"), "V1");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/plugins/io.molis.work.goals/goals/V1/event-state*"] }, sessionId);
  await evaluate(`document.querySelector(".goal-more").open = true; document.querySelector('.goal-more [data-event-reader="planning"]').click();`);
  await waitFor(dom("[data-event-reader-root]") + " && !" + dom("[data-event-reader-root]") + ".hasAttribute('hidden')");
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click("[data-event-back]");
  // Back closes the reader layer and returns focus to what opened it (the Goal's 更多 menu), not to a separate sheet.
  await waitFor("!" + dom("[data-event-reader-root]") + "?.getClientRects().length && document.activeElement?.closest('.goal-more') !== null");
  await reloadPage();
  await waitFor(dom("[data-goal-event-document]") + "?.dataset.goalView === 'V1'");
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor(dom("[data-goal-event-document]") + "?.dataset.goalView === 'RELEASE'");
  assert.equal(await evaluate(dom("[data-current-summary]") + " != null"), true);
  const screenshots = process.env.MOLIS_WORK_TEST_CAPTURE === "1" ? await mkdtemp(join(tmpdir(), "molis-work-gw5-document-")) : null;
  async function capture(name: string) {
    if (!screenshots) return;
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(screenshots, name + ".png"), Buffer.from(data, "base64"));
    console.log("Document UI capture: " + join(screenshots, name + ".png"));
  }
  await capture("desktop");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await evaluate(`document.querySelector(".goal-more").open = true; document.querySelector('.goal-more [data-event-reader="planning"]').click();`);
  await waitFor(dom("[data-event-reader-root]") + " && !" + dom("[data-event-reader-root]") + ".hasAttribute('hidden')");
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  await capture("mobile");
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
});

test("late completed document response never replaces the newer selected Goal", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')");
  // Delay delivery of a real, fully read HTTP response. No invented document or server state.
  // Aborting after the body completed cannot undo a result already queued for delivery.
  await evaluate(`(() => {
    const original = fetch.bind(globalThis);
    globalThis.fetch = async (input, options) => {
      const response = await original(input, options);
      if (new URL(String(input), location.href).pathname === '/api/goals/RELEASE/document') {
        const body = await response.text();
        globalThis.__heldGoalResponse = true;
        await new Promise(resolve => { globalThis.__releaseGoalResponse = resolve; });
        globalThis.__lateGoalDelivered = true;
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    return true;
  })()`);
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("globalThis.__heldGoalResponse === true");
  await click('.tree-node[data-select-goal="V1"]');
  await waitFor("document.querySelector('[data-document-pane]').getAttribute('aria-busy') !== 'true' && document.querySelector('[data-goal-view]').dataset.goalView === 'V1'");
  await evaluate("globalThis.__releaseGoalResponse(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("globalThis.__lateGoalDelivered"), true);
  assert.equal(await evaluate("document.querySelector('[data-goal-view]').dataset.goalView"), "V1");
  assert.equal(await evaluate("document.querySelector('.tree-node.is-selected').dataset.selectGoal"), "V1");
  assert.equal(await evaluate("location.pathname"), "/goals/V1");
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).goals, before.goals);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID).relations, before.relations);
});

test("public document clients isolate requests and keep Host callbacks, failure recovery and both pane layouts", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, navigate, evaluate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  const result = await evaluate<{
    first: boolean | null; second: boolean | null; newer: boolean | null; failed: boolean | null; retry: boolean | null;
    aGoal: string; bGoal: string; failedGoal: string; aBusy: boolean; bBusy: boolean;
    heldBusy: boolean; aAborted: boolean; bAborted: boolean; bareReplaced: boolean; siblingKept: boolean;
    calls: string[]; errors: string[]; caches: string[];
  }>(`(async () => {
    const createClient = (${GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT});
    const aPane = document.createElement('section');
    aPane.innerHTML = '<aside>Host sibling</aside><div data-work-surface="goals"><article data-goal-view="initial-a"></article></div>';
    const bPane = document.createElement('section');
    // A pane without the Goal surface holds only the document (its host header left the markup in bc79f8a49).
    bPane.innerHTML = '<article data-goal-view="initial-b"></article>';
    const sibling = aPane.firstElementChild;
    const calls = [], errors = [], caches = [];
    const ports = (name, documentPane) => ({
      documentPane, documentCollection: 'current', route: path => path + (path.includes('?') ? '&' : '?') + 'document-client-test=' + name, translate: text => text,
      isAbortError: error => error instanceof DOMException && error.name === 'AbortError',
      showError: message => errors.push(message),
      beforeReplace: () => calls.push(name + ':before:' + documentPane.querySelector('[data-goal-view]').dataset.goalView),
      afterReplace: () => calls.push(name + ':after:' + documentPane.querySelector('[data-goal-view]').dataset.goalView),
    });
    const a = createClient(ports('a', aPane)), b = createClient(ports('b', bPane));
    const originalFetch = globalThis.fetch;
    let releaseBody, bodyRead, aSignal, bSignal, held = false;
    const captured = new Promise(resolve => { bodyRead = resolve; });
    const gate = new Promise(resolve => { releaseBody = resolve; });
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input), location.href);
      // The page also refreshes its own document/panels. Only these two
      // explicit clients belong to this isolation/cache contract.
      if (!url.searchParams.has('document-client-test')) return originalFetch(input, options);
      const path = url.pathname;
      caches.push(options.cache);
      if (path === '/api/goals/V1/document') bSignal = options.signal;
      const response = await originalFetch(input, options);
      if (path === '/api/goals/RELEASE/document' && !held) {
        held = true;
        aSignal = options.signal;
        const body = await response.text();
        bodyRead();
        await gate;
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    try {
      const pending = a.loadGoalDocument('RELEASE');
      await captured;
      const heldBusy = aPane.getAttribute('aria-busy') === 'true';
      const second = await b.loadGoalDocument('V1');
      const newer = await a.loadGoalDocument('CORE');
      releaseBody();
      const first = await pending;
      const failed = await a.loadGoalDocument('DOES-NOT-EXIST');
      const failedGoal = aPane.querySelector('[data-goal-view]').dataset.goalView;
      const retry = await a.loadGoalDocument('RELEASE');
      return {first,second,newer,failed,retry,failedGoal,heldBusy,
        aGoal:aPane.querySelector('[data-goal-view]').dataset.goalView,
        bGoal:bPane.querySelector('[data-goal-view]').dataset.goalView,
        aBusy:aPane.hasAttribute('aria-busy'),bBusy:bPane.hasAttribute('aria-busy'),
        aAborted:aSignal.aborted,bAborted:bSignal.aborted,
        bareReplaced:bPane.children.length === 1,siblingKept:aPane.firstElementChild === sibling,
        calls,errors,caches};
    } finally { releaseBody(); globalThis.fetch = originalFetch; }
  })()`);
  assert.equal(result.first, null);
  assert.equal(result.second, true);
  assert.equal(result.newer, true);
  assert.equal(result.failed, false);
  assert.equal(result.failedGoal, "CORE");
  assert.equal(result.retry, true);
  assert.equal(result.aGoal, "RELEASE");
  assert.equal(result.bGoal, "V1");
  assert.equal(result.aBusy, false);
  assert.equal(result.bBusy, false);
  assert.equal(result.heldBusy, true);
  assert.equal(result.aAborted, true);
  assert.equal(result.bAborted, false);
  assert.equal(result.bareReplaced, true);
  assert.equal(result.siblingKept, true);
  assert.deepEqual(result.calls, ["b:before:initial-b", "b:after:V1", "a:before:initial-a", "a:after:CORE", "a:before:CORE", "a:after:RELEASE"]);
  assert.deepEqual(result.errors, ["无法读取这条目标正文"]);
  assert.deepEqual(result.caches, Array(5).fill("no-store"));
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  for (const key of ["goals", "relations"] as const) assert.deepEqual(after[key], before[key]);
});

test("switching Goals while a document is loading still keeps the later selection after the old response arrives", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, before, origin, sessionId, command, navigate, evaluate, click, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')");
  await evaluate(`(() => {
    const originalFetch = globalThis.fetch;
    let held = false;
    globalThis.fetch = async (input, options) => {
      const response = await originalFetch(input, options);
      if (!held && new URL(String(input), location.href).pathname === '/api/goals/RELEASE/document') {
        held = true;
        const body = await response.text();
        globalThis.__heldDocumentResponse = true;
        await new Promise(resolve => { globalThis.__releaseDocumentResponse = resolve; });
        return new Response(body, {status:response.status,headers:response.headers});
      }
      return response;
    };
    return true;
  })()`);
  await click('.tree-node[data-select-goal="RELEASE"]');
  await waitFor("globalThis.__heldDocumentResponse === true");
  await click('.tree-node[data-select-goal="V1"]');
  // A single click is applied after the double-click window, and the document still shows V1 meanwhile:
  // wait until V1 is really the selection before letting the old RELEASE response arrive.
  await waitFor("document.querySelector('.tree-node[data-select-goal=\"V1\"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'V1'");
  await evaluate("__releaseDocumentResponse(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document]').dataset.goalView"), "V1");
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  for (const key of ["goals", "relations"] as const) assert.deepEqual(after[key], before[key]);
});

test("F-goals-10 & F-goals-11: decision conflict retry refreshes review_version and detached event clients dispose global listeners", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { origin, sessionId, command, navigate, evaluate } = browser;
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  const result = await evaluate<{
    observedVersions: string[];
    idempotencyKeys: string[];
    retriedVersion: string;
    decisionSucceeded: boolean;
    menuClosedBeforeDispose: boolean;
    menuKeptOpenAfterDispose: boolean;
    menuKeptOpenAfterDetach: boolean;
    surfaceCallsAfterDispose: number;
  }>(`(async () => {
    const createEventClient = (${GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT});
    const observedVersions = [];
    const idempotencyKeys = [];
    let surfaceCalls = 0;
    let reloaded = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = new URL(String(input), location.href);
      if (url.pathname === '/api/contextual/surfaces') {
        surfaceCalls += 1;
        return new Response(JSON.stringify({ surfaces: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/api/project-approvals/request') {
        const body = JSON.parse(String(options?.body || '{}'));
        observedVersions.push(body.draft?.observed_version || '');
        idempotencyKeys.push(body.draft?.idempotency_key || '');
        if (observedVersions.length === 1) {
          return new Response(JSON.stringify({ code: 'actions.conflict', error: 'Goal changed' }), { status: 409, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ reference: { id: 'ref-2', version: 'fresh-v2' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/api/project-approvals/decide') {
        return new Response(JSON.stringify({ record: { decision_id: 'd-2' }, result: { event_id: 'ev-2' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/api/plugins/io.molis.work.goals/goals/V1/event-state') {
        return new Response(JSON.stringify({
          agreement: { outcome: 'Updated outcome', version: 2 },
          config: { version: 1 },
          review_version: 'fresh-v2',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(input, options);
    };
    const pane = document.createElement('section');
    pane.innerHTML = '<article data-goal-event-document data-goal-view="V1">'
      + '<details data-record-menu open><summary>Add</summary></details>'
      + '<form data-event-form="decision" data-review-version="stale-v1">'
      + '<div class="event-form-body"><input name="conclusion" value="Approve change"><input type="checkbox" name="effect" value="authorize_action" checked><input name="scope_action" value="publish"></div>'
      + '<p data-form-status hidden></p><button type="submit">Submit</button></form>'
      + '<p data-event-conflict hidden></p></article>';
    document.body.append(pane);
    const client = createEventClient({
      documentPane: pane,
      route: path => path,
      isAbortError: error => error instanceof DOMException && error.name === 'AbortError',
      reloadDocument: async () => { reloaded = true; return true; },
    });
    try {
      const form = pane.querySelector('form[data-event-form="decision"]');
      const waitUntil = async (fn) => {
        for (let i = 0; i < 60; i += 1) {
          if (fn()) return;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw new Error('Condition timed out');
      };
      // F-goals-10: first submit gets 409; clicking [data-conflict-retry] refreshes review_version and clears idempotencyKey.
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      await waitUntil(() => pane.querySelector('[data-conflict-retry]') != null);
      pane.querySelector('[data-conflict-retry]').click();
      await waitUntil(() => form.dataset.reviewVersion === 'fresh-v2');
      const retriedVersion = form.dataset.reviewVersion || '';
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      await waitUntil(() => reloaded);

      // F-goals-11: document click closes menu while alive; after dispose() and after detach, global listeners and MutationObserver stop.
      const menu = pane.querySelector('[data-record-menu]');
      menu.open = true;
      document.body.click();
      const menuClosedBeforeDispose = !menu.open;
      client.dispose();
      menu.open = true;
      document.body.click();
      const menuKeptOpenAfterDispose = menu.open;
      const beforeMut = surfaceCalls;
      const cited = document.createElement('button');
      cited.setAttribute('data-goal-cited', '');
      cited.dataset.kind = 'risk';
      cited.dataset.id = 'r-1';
      pane.append(cited);
      await new Promise(resolve => setTimeout(resolve, 50));
      const surfaceCallsAfterDispose = surfaceCalls - beforeMut;

      // Auto-dispose on detach without explicit dispose() call.
      const pane2 = document.createElement('section');
      pane2.innerHTML = '<article data-goal-event-document data-goal-view="V1"><details data-record-menu open><summary>Add</summary></details></article>';
      document.body.append(pane2);
      createEventClient({
        documentPane: pane2,
        route: path => path,
        isAbortError: error => error instanceof DOMException && error.name === 'AbortError',
        reloadDocument: async () => true,
      });
      const menu2 = pane2.querySelector('[data-record-menu]');
      pane2.remove();
      menu2.open = true;
      document.body.click();
      const menuKeptOpenAfterDetach = menu2.open;
      pane.remove();
      return {
        observedVersions,
        idempotencyKeys,
        retriedVersion,
        decisionSucceeded: reloaded,
        menuClosedBeforeDispose,
        menuKeptOpenAfterDispose,
        menuKeptOpenAfterDetach,
        surfaceCallsAfterDispose,
      };
    } finally {
      client.dispose();
      pane.remove();
      globalThis.fetch = originalFetch;
    }
  })()`);
  assert.deepEqual(result.observedVersions, ["stale-v1", "fresh-v2"]);
  assert.equal(result.retriedVersion, "fresh-v2");
  assert.notEqual(result.idempotencyKeys[0], result.idempotencyKeys[1], "retry must clear stale idempotencyKey");
  assert.equal(result.decisionSucceeded, true);
  assert.equal(result.menuClosedBeforeDispose, true);
  assert.equal(result.menuKeptOpenAfterDispose, true);
  assert.equal(result.menuKeptOpenAfterDetach, true);
  assert.equal(result.surfaceCallsAfterDispose, 0);
});
